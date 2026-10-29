from decimal import Decimal

import pytest
from pydantic import ValidationError

from shop_api.schemas import ProductCreateRequest


def test_product_schema_accepts_documented_upper_boundaries_and_normalizes_text() -> None:
    product = ProductCreateRequest(
        name="P" * 32,
        category="C" * 40,
        description="D" * 500,
        price="999999.99",
        stock=999999,
    )

    assert product.name == "P" * 32
    assert product.category == "C" * 40
    assert product.description == "D" * 500
    assert product.price == Decimal("999999.99")
    assert product.stock == 999999


def test_product_schema_normalizes_repeated_whitespace_in_names_and_categories() -> None:
    product = ProductCreateRequest(
        name="  Lavanta   El\tKremi ",
        category=" Kişisel   Bakım ",
        description="Günlük kullanım için nemlendirici el kremi.",
        price="129.90",
        stock=24,
    )

    assert product.name == "Lavanta El Kremi"
    assert product.category == "Kişisel Bakım"


def test_product_schema_normalizes_names_to_unicode_nfc() -> None:
    product = ProductCreateRequest(
        name="Cafe\u0301 Sabunu",
        category="Kişisel Bakım",
        description="Günlük kullanım için doğal sabun.",
        price="129.90",
        stock=24,
    )

    assert product.name == "Café Sabunu"


@pytest.mark.parametrize(
    "field, value",
    [
        pytest.param("name", "P", id="name-shorter-than-minimum"),
        pytest.param("name", " P ", id="name-too-short-after-normalization"),
        pytest.param("name", "P" * 33, id="name-longer-than-maximum"),
        pytest.param("name", "Ürün!", id="name-contains-unsupported-punctuation"),
        pytest.param("name", " ", id="name-is-only-whitespace"),
        pytest.param("category", "C", id="category-shorter-than-minimum"),
        pytest.param("category", " C ", id="category-too-short-after-normalization"),
        pytest.param("category", "C" * 41, id="category-longer-than-maximum"),
        pytest.param("category", "Bakım!", id="category-contains-unsupported-punctuation"),
        pytest.param("description", "D" * 9, id="description-shorter-than-minimum"),
        pytest.param(
            "description",
            "         x",
            id="description-too-short-after-trimming",
        ),
        pytest.param("description", "D" * 501, id="description-longer-than-maximum"),
        pytest.param("description", "Geçersiz\x00 açıklama", id="description-control-character"),
        pytest.param("price", "0", id="zero-price"),
        pytest.param("price", "-0.01", id="negative-price"),
        pytest.param("price", "1.999", id="price-has-too-many-decimal-places"),
        pytest.param("price", "1000000.00", id="price-exceeds-maximum"),
        pytest.param("price", "not-a-price", id="price-is-not-numeric"),
        pytest.param("price", True, id="price-must-not-be-boolean"),
        pytest.param("stock", -1, id="negative-stock"),
        pytest.param("stock", 1000000, id="stock-exceeds-maximum"),
        pytest.param("stock", 1.5, id="fractional-stock"),
        pytest.param("stock", "24", id="stock-must-be-an-integer"),
        pytest.param("name", 24, id="name-must-be-a-string"),
        pytest.param("category", 24, id="category-must-be-a-string"),
        pytest.param("description", 24, id="description-must-be-a-string"),
    ],
)
def test_product_schema_rejects_out_of_range_fields(field: str, value: object) -> None:
    payload: dict[str, object] = {
        "name": "Lavanta El Kremi",
        "category": "Kişisel Bakım",
        "description": "Günlük kullanım için nemlendirici el kremi.",
        "price": "129.90",
        "stock": 24,
    }
    payload[field] = value

    with pytest.raises(ValidationError):
        ProductCreateRequest.model_validate(payload)
