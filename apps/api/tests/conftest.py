from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from shop_api.config import Settings
from shop_api.main import create_app
from shop_api.models import Base, User
from shop_api.security import hash_password


@pytest.fixture
def engine(tmp_path) -> Iterator[Engine]:
    database_path = tmp_path / "test.db"
    test_engine = create_engine(f"sqlite:///{database_path}")
    Base.metadata.create_all(test_engine)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def client(engine: Engine) -> Iterator[TestClient]:
    settings = Settings(
        database_url="sqlite:///./test.db",
        secret_key=SecretStr("test-signing-key-with-at-least-32-characters"),
    )
    app = create_app(settings=settings, db_engine=engine)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def customer(engine: Engine) -> User:
    session_factory = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
    with session_factory.begin() as session:
        user = User(
            email="customer@example.com",
            password_hash=hash_password("correct-password-123"),
        )
        session.add(user)
        session.flush()
        session.refresh(user)
        return user
