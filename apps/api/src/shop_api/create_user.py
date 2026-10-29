from getpass import getpass

from pydantic import EmailStr, TypeAdapter
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from shop_api.config import get_settings
from shop_api.database import create_database_engine
from shop_api.models import User
from shop_api.security import hash_password, normalize_email


def main() -> None:
    settings = get_settings()
    email = normalize_email(TypeAdapter(EmailStr).validate_python(input("E-posta: ")))
    password = getpass("Parola (en az 12 karakter): ")
    if len(password) < 12:
        raise ValueError("Parola en az 12 karakter olmalıdır.")

    engine = create_database_engine(settings.database_url)
    session_factory = sessionmaker(bind=engine, class_=Session)
    try:
        with session_factory.begin() as session:
            session.add(User(email=email, password_hash=hash_password(password)))
    except IntegrityError as error:
        raise ValueError("Bu e-posta adresiyle bir hesap zaten mevcut.") from error
    finally:
        engine.dispose()

    print(f"Hesap oluşturuldu: {email}")
