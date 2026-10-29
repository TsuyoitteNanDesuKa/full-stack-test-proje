import jwt

from shop_api.security import (
    create_access_token,
    hash_password,
    normalize_email,
    verify_password,
)


def test_password_hash_is_not_reversible_and_verifies_only_matching_password() -> None:
    password = "customer-password-123"

    stored_hash = hash_password(password)

    assert stored_hash != password
    assert stored_hash.startswith("$argon2")
    assert verify_password(password, stored_hash)
    assert not verify_password("different-password", stored_hash)
    assert not verify_password(password, None)


def test_normalize_email_trims_whitespace_and_ignores_case() -> None:
    assert normalize_email("  CUSTOMER@EXAMPLE.COM  ") == "customer@example.com"


def test_access_token_has_subject_and_expiration_claims() -> None:
    token = create_access_token(
        subject=42,
        secret_key="unit-test-signing-key-with-at-least-32-characters",
        expires_in_minutes=7,
    )

    claims = jwt.decode(
        token,
        "unit-test-signing-key-with-at-least-32-characters",
        algorithms=["HS256"],
    )

    assert claims["sub"] == "42"
    assert claims["exp"] - claims["iat"] == 420
