import argparse

from pydantic import EmailStr, TypeAdapter
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from shop_api.config import get_settings
from shop_api.database import create_database_engine
from shop_api.models import User
from shop_api.security import normalize_email


def main() -> None:
    parser = argparse.ArgumentParser(description="Grant administrator access to an existing user.")
    parser.add_argument("email", help="Email address of the existing account")
    args = parser.parse_args()
    email = normalize_email(TypeAdapter(EmailStr).validate_python(args.email))

    engine = create_database_engine(get_settings().database_url)
    session_factory = sessionmaker(bind=engine, class_=Session)
    try:
        with session_factory.begin() as session:
            user = session.scalar(select(User).where(User.email == email))
            if user is None:
                raise ValueError(f"Bu e-posta adresiyle bir hesap bulunamadı: {email}")
            user.is_admin = True
    finally:
        engine.dispose()

    print(f"Yönetici yetkisi verildi: {email}")
