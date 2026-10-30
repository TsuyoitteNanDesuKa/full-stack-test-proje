import secrets
from datetime import UTC, datetime


def make_test_label(prefix: str = "Test") -> str:
    timestamp = datetime.now(UTC).strftime("%y%m%d%H%M%S")
    suffix = secrets.token_hex(2)
    return f"{prefix}-{timestamp}-{suffix}"


def product_payload(**overrides: object) -> dict[str, object]:
    label = make_test_label("Product")
    price_cents = secrets.randbelow(99_999_900) + 100
    payload: dict[str, object] = {
        "name": label,
        "category": make_test_label("Category"),
        "description": f"Test description {make_test_label('Catalog')}",
        "price": f"{price_cents // 100}.{price_cents % 100:02d}",
        "stock": secrets.randbelow(1_000_000),
    }
    payload.update(overrides)
    return payload
