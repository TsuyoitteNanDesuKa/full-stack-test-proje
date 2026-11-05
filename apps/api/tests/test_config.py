import pytest
from pydantic import ValidationError

from shop_api.config import Settings, get_settings


def test_default_database_uses_local_postgresql() -> None:
    settings = Settings(_env_file=None)

    assert settings.database_url == (
        "postgresql+psycopg://shop:shop-local-dev-only@127.0.0.1:5432/shop"
    )


def test_settings_derive_jwks_endpoint_from_issuer() -> None:
    settings = Settings(oidc_issuer="https://identity.example/realms/store/")

    assert settings.oidc_issuer == "https://identity.example/realms/store"
    assert settings.jwks_endpoint() == (
        "https://identity.example/realms/store/protocol/openid-connect/certs"
    )


def test_settings_accept_explicit_jwks_endpoint() -> None:
    settings = Settings(
        oidc_issuer="https://identity.example/realms/store",
        oidc_jwks_url="https://keys.example/shop",
    )

    assert settings.jwks_endpoint() == "https://keys.example/shop"


def test_mock_payment_settings_default_to_two_minutes() -> None:
    settings = Settings(_env_file=None)

    assert settings.payment_provider == "mock"
    assert settings.payment_expiry_seconds == 120


@pytest.mark.parametrize(
    "values",
    [
        {"payment_provider": "stripe"},
        {"payment_webhook_secret": "short"},
        {"payment_expiry_seconds": 0},
    ],
)
def test_settings_reject_unsupported_or_invalid_payment_configuration(
    values: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **values)


@pytest.mark.parametrize(
    "issuer",
    [
        pytest.param("http://identity.example/realms/shop", id="non-local-http"),
        pytest.param("ftp://identity.example/realms/shop", id="unsupported-scheme"),
        pytest.param("", id="empty"),
    ],
)
def test_settings_reject_insecure_or_invalid_issuer(issuer: str) -> None:
    with pytest.raises(ValidationError):
        Settings(oidc_issuer=issuer)


@pytest.mark.parametrize("audience", ["", "  "])
def test_settings_reject_empty_audience(audience: str) -> None:
    with pytest.raises(ValidationError):
        Settings(oidc_audience=audience)


def test_get_settings_reads_environment_once_and_can_be_refreshed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("SHOP_OIDC_ISSUER", "https://identity.example/realms/test")
    monkeypatch.setenv("SHOP_OIDC_AUDIENCE", "test-api")

    try:
        first_settings = get_settings()
        assert first_settings.oidc_issuer == "https://identity.example/realms/test"
        assert first_settings.oidc_audience == "test-api"
        assert get_settings() is first_settings
    finally:
        get_settings.cache_clear()
