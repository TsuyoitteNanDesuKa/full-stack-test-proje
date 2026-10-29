from decimal import Decimal

import pytest
from pydantic import ValidationError

from shop_api.schemas import ProductCreateRequest


def test_product_schema_accepts_documented_field_and_numeric_boundaries() -> None:
    product = ProductCreateRequest(
        name="P" * 120,
        category="C" * 80,
        description="D" * 600,
        price="99999999.99",
        stock=0,
    )

    assert product.name == "P" * 120
    assert product.category == "C" * 80
    assert product.description == "D" * 600
    assert product.price == Decimal("99999999.99")
    assert product.stock == 0


@pytest.mark.parametrize(
    "field, value",
    [
        pytest.param("name", "P", id="name-shorter-than-minimum"),
        pytest.param("name", "P" * 121, id="name-longer-than-maximum"),
        pytest.param("category", "C", id="category-shorter-than-minimum"),
        pytest.param("category", "C" * 81, id="category-longer-than-maximum"),
        pytest.param("description", "", id="empty-description"),
        pytest.param("description", "D" * 601, id="description-longer-than-maximum"),
        pytest.param("price", "0", id="zero-price"),
        pytest.param("price", "-0.01", id="negative-price"),
        pytest.param("price", "1.999", id="price-has-too-many-decimal-places"),
        pytest.param("price", "100000000.00", id="price-exceeds-maximum"),
        pytest.param("stock", -1, id="negative-stock"),
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
