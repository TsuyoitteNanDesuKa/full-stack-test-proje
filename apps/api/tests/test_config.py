import pytest
from pydantic import SecretStr, ValidationError

from shop_api.config import Settings, get_settings


@pytest.mark.parametrize("expiry", [0, -1, 1441])
def test_settings_rejects_unsafe_access_token_lifetime(expiry: int) -> None:
    with pytest.raises(ValidationError):
        Settings(
            secret_key=SecretStr("test-signing-key-with-at-least-32-characters"),
            access_token_expire_minutes=expiry,
        )


def test_settings_accepts_access_token_lifetime_boundaries() -> None:
    for expiry in (1, 1440):
        settings = Settings(
            secret_key=SecretStr("test-signing-key-with-at-least-32-characters"),
            access_token_expire_minutes=expiry,
        )

        assert settings.access_token_expire_minutes == expiry


@pytest.mark.parametrize(
    "secret",
    [
        pytest.param("", id="missing-key"),
        pytest.param("too-short", id="short-key"),
        pytest.param(
            "replace-with-a-unique-random-value-of-at-least-32-characters",
            id="example-key",
        ),
    ],
)
def test_settings_refuses_missing_or_example_signing_key(secret: str) -> None:
    settings = Settings(secret_key=SecretStr(secret))

    with pytest.raises(ValueError, match="SHOP_SECRET_KEY"):
        settings.signing_key()


def test_settings_returns_configured_signing_key() -> None:
    secret = "local-test-signing-key-with-at-least-32-characters"
    settings = Settings(secret_key=SecretStr(secret))

    assert settings.signing_key() == secret


def test_get_settings_reads_environment_once_and_can_be_refreshed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("SHOP_SECRET_KEY", "environment-test-key-with-at-least-32-characters")
    monkeypatch.setenv("SHOP_ACCESS_TOKEN_EXPIRE_MINUTES", "12")

    try:
        first_settings = get_settings()
        assert first_settings.secret_key.get_secret_value() == (
            "environment-test-key-with-at-least-32-characters"
        )
        assert first_settings.access_token_expire_minutes == 12
        assert get_settings() is first_settings
    finally:
        get_settings.cache_clear()
