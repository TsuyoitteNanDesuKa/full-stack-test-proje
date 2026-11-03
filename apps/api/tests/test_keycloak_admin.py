import json
from json import JSONDecodeError
from urllib.error import HTTPError, URLError
from urllib.request import Request

import pytest

from shop_api.config import Settings
from shop_api.keycloak_admin import KeycloakProvisioningError, KeycloakRoleProvisioner


def test_seller_role_provisioning_assigns_and_verifies_role(monkeypatch) -> None:
    settings = Settings(
        oidc_issuer="http://localhost:8080/realms/shop",
        keycloak_admin_client_id="shop-api-admin",
        keycloak_admin_client_secret="test-secret",
    )
    calls: list[tuple[str, dict[str, object]]] = []

    def fake_send(url: str, **kwargs: object) -> bytes:
        calls.append((url, kwargs))
        if url.endswith("/protocol/openid-connect/token"):
            return b'{"access_token":"service-token"}'
        if url.endswith("/admin/realms/shop/roles/seller"):
            return b'{"id":"seller-role-id","name":"seller"}'
        if kwargs.get("method") == "POST":
            return b""
        return b'[{"id":"seller-role-id","name":"seller"}]'

    monkeypatch.setattr(KeycloakRoleProvisioner, "_send", staticmethod(fake_send))

    KeycloakRoleProvisioner(settings).assign_seller_role("user-subject")

    assert len(calls) == 4
    assert calls[0][0] == "http://localhost:8080/realms/shop/protocol/openid-connect/token"
    assert calls[0][1]["method"] == "POST"
    assert calls[0][1]["content_type"] == "application/x-www-form-urlencoded"
    assert calls[1][0].endswith("/admin/realms/shop/roles/seller")
    assert calls[2][0].endswith("/admin/realms/shop/users/user-subject/role-mappings/realm")
    assert calls[2][1]["method"] == "POST"
    assert json.loads(calls[2][1]["data"].decode()) == [{"id": "seller-role-id", "name": "seller"}]
    assert calls[3][0] == calls[2][0]


def test_seller_role_provisioning_fails_when_service_account_is_not_configured(
    monkeypatch,
) -> None:
    provisioner = KeycloakRoleProvisioner(Settings(keycloak_admin_client_secret=None))

    def unexpected_send(*args: object, **kwargs: object) -> bytes:
        raise AssertionError("Keycloak must not be called without a configured secret.")

    monkeypatch.setattr(KeycloakRoleProvisioner, "_send", staticmethod(unexpected_send))

    with pytest.raises(KeycloakProvisioningError, match="not configured"):
        provisioner.assign_seller_role("user-subject")


def test_seller_role_provisioning_rejects_malformed_service_account_response(
    monkeypatch,
) -> None:
    settings = Settings(keycloak_admin_client_secret="test-secret")
    monkeypatch.setattr(
        KeycloakRoleProvisioner,
        "_send",
        staticmethod(lambda *args, **kwargs: b"[]"),
    )

    with pytest.raises(KeycloakProvisioningError, match="response is invalid"):
        KeycloakRoleProvisioner(settings).assign_seller_role("user-subject")


def test_seller_role_provisioning_surfaces_keycloak_network_failures(monkeypatch) -> None:
    settings = Settings(keycloak_admin_client_secret="test-secret")
    calls = 0

    def fail_send(*args: object, **kwargs: object) -> bytes:
        nonlocal calls
        calls += 1
        raise URLError("Keycloak unavailable")

    monkeypatch.setattr(KeycloakRoleProvisioner, "_send", staticmethod(fail_send))

    with pytest.raises(KeycloakProvisioningError, match="failed"):
        KeycloakRoleProvisioner(settings).assign_seller_role("user-subject")
    assert calls == 1


@pytest.mark.parametrize(
    "response",
    [b"{}", b'{"access_token":""}', b'{"access_token":123}'],
    ids=["missing-token", "empty-token", "non-string-token"],
)
def test_seller_role_provisioning_rejects_missing_or_invalid_access_token(
    monkeypatch,
    response: bytes,
) -> None:
    provisioner = KeycloakRoleProvisioner(Settings(keycloak_admin_client_secret="test-secret"))
    monkeypatch.setattr(
        KeycloakRoleProvisioner,
        "_send",
        staticmethod(lambda *args, **kwargs: response),
    )

    with pytest.raises(KeycloakProvisioningError, match="no access token"):
        provisioner.assign_seller_role("user-subject")


def test_seller_role_provisioning_rejects_malformed_seller_role(monkeypatch) -> None:
    provisioner = KeycloakRoleProvisioner(Settings(keycloak_admin_client_secret="test-secret"))
    calls = 0

    def fake_send(*args: object, **kwargs: object) -> bytes:
        nonlocal calls
        calls += 1
        return b'{"access_token":"service-token"}' if calls == 1 else b"[]"

    monkeypatch.setattr(KeycloakRoleProvisioner, "_send", staticmethod(fake_send))

    with pytest.raises(KeycloakProvisioningError, match="seller role response is invalid"):
        provisioner.assign_seller_role("user-subject")


@pytest.mark.parametrize(
    "response",
    [b"{}", b'[{"name":"buyer"}]'],
    ids=["mapping-response-is-not-a-list", "seller-role-not-assigned"],
)
def test_seller_role_provisioning_rejects_unverified_role_assignment(
    monkeypatch,
    response: bytes,
) -> None:
    provisioner = KeycloakRoleProvisioner(Settings(keycloak_admin_client_secret="test-secret"))
    calls = 0

    def fake_send(*args: object, **kwargs: object) -> bytes:
        nonlocal calls
        calls += 1
        if calls == 1:
            return b'{"access_token":"service-token"}'
        if calls == 2:
            return b'{"id":"seller-role-id","name":"seller"}'
        return b"" if kwargs.get("method") == "POST" else response

    monkeypatch.setattr(KeycloakRoleProvisioner, "_send", staticmethod(fake_send))

    with pytest.raises(KeycloakProvisioningError, match="could not be verified"):
        provisioner.assign_seller_role("user-subject")


@pytest.mark.parametrize(
    "error",
    [
        HTTPError("http://keycloak.test", 403, "forbidden", None, None),
        TimeoutError("timed out"),
        JSONDecodeError("invalid JSON", "", 0),
        OSError("connection reset"),
    ],
    ids=["http-error", "timeout", "invalid-json", "os-error"],
)
def test_seller_role_provisioning_wraps_transport_and_decode_errors(monkeypatch, error) -> None:
    provisioner = KeycloakRoleProvisioner(Settings(keycloak_admin_client_secret="test-secret"))

    def fail_send(*args: object, **kwargs: object) -> bytes:
        raise error

    monkeypatch.setattr(KeycloakRoleProvisioner, "_send", staticmethod(fail_send))

    with pytest.raises(KeycloakProvisioningError, match="failed"):
        provisioner.assign_seller_role("user-subject")


def test_send_builds_request_and_returns_response_body(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def read(self) -> bytes:
            return b"response-body"

    def fake_urlopen(request: Request, *, timeout: int) -> FakeResponse:
        captured["request"] = request
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("shop_api.keycloak_admin.urlopen", fake_urlopen)
    body = KeycloakRoleProvisioner._send(
        "https://keycloak.test/admin",
        method="PUT",
        data=b'{"enabled":true}',
        headers={"Authorization": "Bearer test-token"},
        content_type="application/json",
    )

    request = captured["request"]
    assert isinstance(request, Request)
    assert request.get_method() == "PUT"
    assert request.data == b'{"enabled":true}'
    assert request.get_header("Authorization") == "Bearer test-token"
    assert request.get_header("Content-type") == "application/json"
    assert captured["timeout"] == 5
    assert body == b"response-body"


def test_send_omits_content_type_when_not_configured(monkeypatch) -> None:
    class FakeResponse:
        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def read(self) -> bytes:
            return b"response-body"

    captured: dict[str, Request] = {}

    def fake_urlopen(request: Request, *, timeout: int) -> FakeResponse:
        captured["request"] = request
        return FakeResponse()

    monkeypatch.setattr("shop_api.keycloak_admin.urlopen", fake_urlopen)
    KeycloakRoleProvisioner._send("https://keycloak.test/health")

    assert captured["request"].get_method() == "GET"
    assert captured["request"].get_header("Content-type") is None
