import os

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from shop_api.config import get_settings
from shop_api.database import create_database_engine
from shop_api.models import User
from shop_api.security import hash_password, normalize_email

email = normalize_email(os.environ["E2E_TEST_EMAIL"])
password = os.environ["E2E_TEST_PASSWORD"]
engine = create_database_engine(get_settings().database_url)

try:
    session_factory = sessionmaker(bind=engine, class_=Session)
    with session_factory.begin() as session:
        existing_user = session.scalar(select(User).where(User.email == email))
        if existing_user is not None:
            raise RuntimeError("The isolated Playwright database already contains its test user.")
        session.add(User(email=email, password_hash=hash_password(password)))
finally:
    engine.dispose()
