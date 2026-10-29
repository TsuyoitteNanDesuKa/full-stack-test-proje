from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()
_UNKNOWN_ACCOUNT_HASH = password_hash.hash("unknown-account-placeholder")


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, stored_hash: str | None) -> bool:
    hash_to_check = stored_hash if stored_hash is not None else _UNKNOWN_ACCOUNT_HASH
    password_is_valid = password_hash.verify(password, hash_to_check)
    return stored_hash is not None and password_is_valid


def create_access_token(
    subject: int,
    secret_key: str,
    expires_in_minutes: int,
) -> str:
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=expires_in_minutes)
    return jwt.encode(
        {"sub": str(subject), "iat": now, "exp": expires_at},
        secret_key,
        algorithm="HS256",
    )
