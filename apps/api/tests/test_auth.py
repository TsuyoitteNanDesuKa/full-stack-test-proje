from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest
from conftest import create_test_token
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

pytestmark = [pytest.mark.smoke, pytest.mark.security]


def test_current_user_returns_keycloak_identity_and_buyer_role(client: TestClient) -> None:
    token = create_test_token(client, subject="keycloak-buyer-123")

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "subject": "keycloak-buyer-123",
        "email": "customer@example.com",
        "roles": ["buyer"],
        "is_admin": False,
    }


def test_current_user_identifies_admin_role(client: TestClient) -> None:
    token = create_test_token(
        client,
        subject="keycloak-admin-123",
        email="admin@example.com",
        roles=["buyer", "admin"],
    )

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["is_admin"] is True
    assert response.json()["roles"] == ["admin", "buyer"]


def test_legacy_password_login_endpoint_is_not_available(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "customer@example.com", "password": "not-forwarded"},
    )

    assert response.status_code == 404


def test_current_user_rejects_missing_or_malformed_bearer_token(client: TestClient) -> None:
    missing_response = client.get("/api/v1/auth/me")
    malformed_response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not-a-token"},
    )

    assert missing_response.status_code == 401
    assert malformed_response.status_code == 401
    assert missing_response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "claims",
    [
        pytest.param({"sub": None, "exp": 4_102_444_800}, id="invalid-subject"),
        pytest.param({"sub": "subject", "exp": None}, id="invalid-expiration"),
        pytest.param(
            {"sub": "subject", "exp": datetime.now(UTC) - timedelta(minutes=1)},
            id="expired",
        ),
        pytest.param({"sub": "", "exp": 4_102_444_800}, id="empty-subject"),
        pytest.param(
            {
                "sub": "subject",
                "exp": 4_102_444_800,
                "realm_access": {"roles": "buyer"},
            },
            id="malformed-role-claim",
        ),
        pytest.param(
            {
                "sub": "subject",
                "exp": 4_102_444_800,
                "realm_access": {"roles": ["unrecognized"]},
            },
            id="no-application-role",
        ),
    ],
)
def test_current_user_rejects_invalid_claims(
    client: TestClient,
    claims: dict[str, Any],
) -> None:
    token = create_test_token(client, claims=claims)

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


@pytest.mark.parametrize(
    "claim, value",
    [
        pytest.param("iss", "https://attacker.example/realms/shop", id="wrong-issuer"),
        pytest.param("aud", "another-api", id="wrong-audience"),
    ],
)
def test_current_user_rejects_wrong_issuer_or_audience(
    client: TestClient,
    claim: str,
    value: str,
) -> None:
    token = create_test_token(client, claims={claim: value})

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_current_user_rejects_token_signed_by_untrusted_key(client: TestClient) -> None:
    token = create_test_token(
        client,
        private_key=rsa.generate_private_key(public_exponent=65537, key_size=2048),
    )

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_current_user_rejects_disallowed_jwt_algorithm(client: TestClient) -> None:
    token = jwt.encode(
        {
            "iss": client.app.state.oidc_issuer,
            "aud": client.app.state.oidc_audience,
            "sub": "keycloak-buyer",
            "iat": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(minutes=5),
            "realm_access": {"roles": ["buyer"]},
        },
        "not-an-rsa-key-with-adequate-length",
        algorithm="HS256",
        headers={"kid": "test-key"},
    )

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_current_user_reports_keycloak_jwks_outage_as_unavailable(
    client: TestClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    class UnavailableJwksClient:
        def get_signing_key_from_jwt(self, _: str) -> None:
            from jwt.exceptions import PyJWKClientConnectionError

            raise PyJWKClientConnectionError("test outage")

    client.app.state.jwks_client = UnavailableJwksClient()
    token = create_test_token(client)

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 503
    assert "Keycloak JWKS endpoint is unavailable" in caplog.text
