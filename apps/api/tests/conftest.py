from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from shop_api.config import Settings
from shop_api.database import create_database_engine
from shop_api.main import create_app
from shop_api.models import Base, User

TEST_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class StaticJwksClient:
    def __init__(self, public_key: Any) -> None:
        self.public_key = public_key

    def get_signing_key_from_jwt(self, token: str) -> SimpleNamespace:
        jwt.get_unverified_header(token)
        return SimpleNamespace(key=self.public_key)


@pytest.fixture
def engine(tmp_path) -> Iterator[Engine]:
    database_path = tmp_path / "test.db"
    test_engine = create_database_engine(f"sqlite:///{database_path}")
    Base.metadata.create_all(test_engine)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def client(engine: Engine) -> Iterator[TestClient]:
    settings = Settings(database_url="sqlite:///./test.db")
    app = create_app(settings=settings, db_engine=engine)
    app.state.test_private_key = TEST_PRIVATE_KEY
    app.state.jwks_client = StaticJwksClient(TEST_PRIVATE_KEY.public_key())
    with TestClient(app) as test_client:
        yield test_client


def create_test_token(
    client: TestClient,
    *,
    subject: str = "test-user",
    email: str = "customer@example.com",
    roles: list[str] | None = None,
    claims: dict[str, Any] | None = None,
    private_key: Any | None = None,
) -> str:
    now = datetime.now(UTC)
    token_claims: dict[str, Any] = {
        "iss": client.app.state.oidc_issuer,
        "aud": client.app.state.oidc_audience,
        "sub": subject,
        "email": email,
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "realm_access": {"roles": roles or ["buyer"]},
    }
    if claims:
        token_claims.update(claims)
    return jwt.encode(
        token_claims,
        private_key or client.app.state.test_private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )


@pytest.fixture
def customer(engine: Engine) -> User:
    session_factory = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
    with session_factory.begin() as session:
        user = User(
            email="customer@example.com",
            password_hash="legacy-user-password-hash",
        )
        session.add(user)
        session.flush()
        session.refresh(user)
        return user


@pytest.fixture
def admin(engine: Engine) -> User:
    session_factory = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
    with session_factory.begin() as session:
        user = User(
            email="admin@example.com",
            password_hash="legacy-user-password-hash",
            is_admin=True,
        )
        session.add(user)
        session.flush()
        session.refresh(user)
        return user
