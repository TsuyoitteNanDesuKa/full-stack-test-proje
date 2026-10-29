from datetime import UTC, datetime, timedelta

import jwt
from fastapi.testclient import TestClient

from shop_api.models import User


def test_home_returns_storefront_for_authenticated_customer(
    client: TestClient,
    customer: User,
) -> None:
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": customer.email, "password": "correct-password-123"},
    )
    token = login_response.json()["access_token"]

    response = client.get(
        "/api/v1/home",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "Alışverişe hoş geldiniz",
        "featured_categories": [],
    }


def test_home_rejects_missing_invalid_or_expired_token(
    client: TestClient,
    customer: User,
) -> None:
    now = datetime.now(UTC)
    expired_token = jwt.encode(
        {
            "sub": str(customer.id),
            "iat": now - timedelta(hours=2),
            "exp": now - timedelta(hours=1),
        },
        client.app.state.secret_key,
        algorithm="HS256",
    )
    no_token_response = client.get("/api/v1/home")
    invalid_token_response = client.get(
        "/api/v1/home",
        headers={"Authorization": "Bearer not-a-valid-token"},
    )
    expired_token_response = client.get(
        "/api/v1/home",
        headers={"Authorization": f"Bearer {expired_token}"},
    )

    assert no_token_response.status_code == 401
    assert invalid_token_response.status_code == 401
    assert expired_token_response.status_code == 401
