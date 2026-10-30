import json
from pathlib import Path
from typing import Any


def load_realm() -> dict[str, Any]:
    realm_path = Path(__file__).parents[3] / "infra" / "keycloak" / "realm-export.json"
    return json.loads(realm_path.read_text(encoding="utf-8"))


def test_keycloak_realm_allows_self_registration_without_verification_or_reset() -> None:
    realm = load_realm()

    assert realm["registrationAllowed"] is True
    assert realm["registrationEmailAsUsername"] is True
    assert realm["loginWithEmailAllowed"] is True
    assert realm["duplicateEmailsAllowed"] is False
    assert realm["verifyEmail"] is False
    assert realm["resetPasswordAllowed"] is False


def test_public_registration_grants_only_the_buyer_role_by_default() -> None:
    realm = load_realm()
    role_names = {role["name"] for role in realm["roles"]["realm"]}

    assert role_names == {"buyer", "seller", "admin"}
    assert realm["defaultRoles"] == ["buyer"]


def test_web_client_uses_pkce_and_has_a_backend_audience_mapper() -> None:
    realm = load_realm()
    web_client = next(client for client in realm["clients"] if client["clientId"] == "shop-web")
    audience_mapper = next(
        mapper
        for mapper in web_client["protocolMappers"]
        if mapper["name"] == "shop-api-audience"
    )

    assert web_client["publicClient"] is True
    assert web_client["standardFlowEnabled"] is True
    assert web_client["directAccessGrantsEnabled"] is False
    assert web_client["attributes"]["pkce.code.challenge.method"] == "S256"
    assert audience_mapper["config"]["included.client.audience"] == "shop-api"
    assert audience_mapper["config"]["access.token.claim"] == "true"
