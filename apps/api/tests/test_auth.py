from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from shop_api.models import User


def test_login_returns_access_token_for_existing_customer(
    client: TestClient,
    customer: User,
) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": customer.email, "password": "correct-password-123"},
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["expires_in"] == 1800
    assert response.json()["access_token"]
    assert "password" not in response.json()


def test_login_normalizes_email(client: TestClient, customer: User) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "  CUSTOMER@EXAMPLE.COM ", "password": "correct-password-123"},
    )

    assert response.status_code == 200


def test_login_rejects_invalid_credentials_with_generic_message(
    client: TestClient,
    customer: User,
) -> None:
    known_email_response = client.post(
        "/api/v1/auth/login",
        json={"email": customer.email, "password": "incorrect-password"},
    )
    unknown_email_response = client.post(
        "/api/v1/auth/login",
        json={"email": "unknown@example.com", "password": "incorrect-password"},
    )

    assert known_email_response.status_code == 401
    assert unknown_email_response.status_code == 401
    assert known_email_response.json() == unknown_email_response.json()


def test_login_rejects_inactive_customer(
    client: TestClient,
    engine: Engine,
    customer: User,
) -> None:
    session_factory = sessionmaker(bind=engine, class_=Session)
    with session_factory.begin() as session:
        stored_customer = session.get(User, customer.id)
        assert stored_customer is not None
        stored_customer.is_active = False

    response = client.post(
        "/api/v1/auth/login",
        json={"email": customer.email, "password": "correct-password-123"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Geçersiz e-posta veya parola."


def test_login_validates_required_credentials(client: TestClient) -> None:
    secret_password = "sensitive-invalid-input"
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "not-an-email", "password": secret_password},
    )

    assert response.status_code == 422
    assert secret_password not in response.text
