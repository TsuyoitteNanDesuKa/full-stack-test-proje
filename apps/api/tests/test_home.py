import pytest
from conftest import create_test_token
from fastapi.testclient import TestClient


def test_home_returns_storefront_for_registered_keycloak_buyer(client: TestClient) -> None:
    token = create_test_token(client, subject="registered-keycloak-user")

    response = client.get(
        "/api/v1/home",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "Alışverişe hoş geldiniz",
        "featured_categories": [],
    }


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="missing-token"),
        pytest.param({"Authorization": "Bearer invalid"}, id="invalid-token"),
        pytest.param({"Authorization": "Basic dXNlcjpwYXNz"}, id="non-bearer"),
        pytest.param({"Authorization": "Bearer"}, id="empty-bearer"),
    ],
)
def test_home_rejects_missing_or_invalid_authentication(
    client: TestClient,
    headers: dict[str, str],
) -> None:
    response = client.get("/api/v1/home", headers=headers)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_home_rejects_token_without_application_role(client: TestClient) -> None:
    token = create_test_token(client, roles=["offline_access"])

    response = client.get(
        "/api/v1/home",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_home_surfaces_identity_provider_outage(client: TestClient) -> None:
    from jwt.exceptions import PyJWKClientConnectionError

    class UnavailableJwksClient:
        def get_signing_key_from_jwt(self, _: str) -> None:
            raise PyJWKClientConnectionError("test outage")

    client.app.state.jwks_client = UnavailableJwksClient()
    token = create_test_token(client)

    response = client.get(
        "/api/v1/home",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Kimlik sağlayıcısına şu anda ulaşılamıyor."
