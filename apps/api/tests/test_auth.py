import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from shop_api.models import User


def test_login_returns_access_token_for_existing_customer(
    client: TestClient,
    customer: User,
    caplog: pytest.LogCaptureFixture,
) -> None:
    password = "correct-password-123"
    response = client.post(
        "/api/v1/auth/login",
        json={"email": customer.email, "password": password},
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["expires_in"] == 1800
    assert response.json()["is_admin"] is False
    assert response.json()["access_token"]
    assert "password" not in response.json()

    claims = jwt.decode(
        response.json()["access_token"],
        client.app.state.secret_key,
        algorithms=["HS256"],
    )
    assert claims["sub"] == str(customer.id)
    assert claims["exp"] - claims["iat"] == 1800
    assert password not in caplog.text


def test_admin_login_identifies_administrator_role(
    client: TestClient,
    admin: User,
) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": admin.email, "password": "correct-password-123"},
    )

    assert response.status_code == 200
    assert response.json()["is_admin"] is True


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


def test_login_rejects_inactive_customer_without_revealing_account_state(
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
    unknown_customer_response = client.post(
        "/api/v1/auth/login",
        json={"email": "unknown@example.com", "password": "incorrect-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Geçersiz e-posta veya parola."
    assert response.json() == unknown_customer_response.json()
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param({"password": "secret-password"}, id="missing-email"),
        pytest.param({"email": "customer@example.com"}, id="missing-password"),
        pytest.param(
            {"email": "customer@example.com", "password": ""},
            id="empty-password",
        ),
        pytest.param(
            {"email": "not-an-email", "password": "sensitive-invalid-input"},
            id="invalid-email",
        ),
        pytest.param(
            {"email": "customer@example.com", "password": "x" * 129},
            id="password-over-limit",
        ),
    ],
)
def test_login_rejects_invalid_credentials_without_echoing_password(
    client: TestClient,
    payload: dict[str, str],
) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json=payload,
    )

    assert response.status_code == 422
    password = payload.get("password", "secret-password")
    if password:
        assert password not in response.text
