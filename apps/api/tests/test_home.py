from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

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
    assert no_token_response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "claims, signing_key, algorithm",
    [
        pytest.param(
            {"sub": "1"},
            "test-signing-key-with-at-least-32-characters",
            "HS256",
            id="missing-expiration",
        ),
        pytest.param(
            {"exp": 4_102_444_800},
            "test-signing-key-with-at-least-32-characters",
            "HS256",
            id="missing-subject",
        ),
        pytest.param(
            {"sub": "not-an-id", "exp": 4_102_444_800},
            "test-signing-key-with-at-least-32-characters",
            "HS256",
            id="invalid-subject",
        ),
        pytest.param(
            {"sub": "-1", "exp": 4_102_444_800},
            "test-signing-key-with-at-least-32-characters",
            "HS256",
            id="negative-subject",
        ),
        pytest.param(
            {"sub": "1", "exp": 4_102_444_800},
            "wrong-signing-key-with-at-least-32-characters",
            "HS256",
            id="wrong-signature",
        ),
        pytest.param(
            {"sub": "1", "exp": 4_102_444_800},
            "test-signing-key-that-is-at-least-48-characters-long",
            "HS384",
            id="disallowed-algorithm",
        ),
    ],
)
def test_home_rejects_malformed_or_untrusted_tokens(
    client: TestClient,
    claims: dict[str, str | int],
    signing_key: str,
    algorithm: str,
) -> None:
    token = jwt.encode(claims, signing_key, algorithm=algorithm)

    response = client.get(
        "/api/v1/home",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("authorization", ["Basic dXNlcjpwYXNz", "Bearer", ""])
def test_home_rejects_non_bearer_or_empty_authorization(
    client: TestClient,
    authorization: str,
) -> None:
    headers = {"Authorization": authorization} if authorization else {}

    response = client.get("/api/v1/home", headers=headers)

    assert response.status_code == 401


def test_home_rejects_token_for_inactive_customer(
    client: TestClient,
    engine: Engine,
    customer: User,
) -> None:
    session_factory = sessionmaker(bind=engine, class_=Session)
    with session_factory.begin() as session:
        stored_customer = session.get(User, customer.id)
        assert stored_customer is not None
        stored_customer.is_active = False

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": customer.email, "password": "correct-password-123"},
    )
    token = jwt.encode(
        {
            "sub": str(customer.id),
            "exp": 4_102_444_800,
        },
        client.app.state.secret_key,
        algorithm="HS256",
    )
    assert login_response.status_code == 401

    response = client.get(
        "/api/v1/home",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_home_rejects_token_for_deleted_or_unknown_customer(client: TestClient) -> None:
    token = jwt.encode(
        {"sub": "9999", "exp": 4_102_444_800},
        client.app.state.secret_key,
        algorithm="HS256",
    )

    response = client.get(
        "/api/v1/home",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401
