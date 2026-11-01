import json
from urllib.error import URLError

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
