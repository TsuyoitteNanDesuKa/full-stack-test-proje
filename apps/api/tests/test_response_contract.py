import json
import re
from pathlib import Path
from typing import Any

import pytest
from conftest import create_test_token
from factories import product_payload
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, FormatChecker, ValidationError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

CONTRACT_PATH = Path(__file__).resolve().parents[3] / "docs" / "openapi.json"
CONTRACT_URI = "https://contracts.local/openapi.json"
pytestmark = pytest.mark.integration


def auth_headers(
    client: TestClient,
    subject: str,
    roles: list[str] | None = None,
) -> dict[str, str]:
    token = create_test_token(
        client,
        subject=subject,
        email=f"{subject}@example.com",
        roles=roles if roles is not None else ["buyer"],
    )
    return {"Authorization": f"Bearer {token}"}


def response_schema(
    contract: dict[str, Any],
    method: str,
    path: str,
    status_code: int,
) -> dict[str, Any]:
    for template, path_item in contract["paths"].items():
        pattern = re.sub(r"\\\{[^}]+\\\}", r"[^/]+", re.escape(template))
        if not re.fullmatch(pattern, path):
            continue
        operation = path_item.get(method.lower())
        assert operation is not None, f"{method} {path} is absent from the OpenAPI snapshot"
        response = operation["responses"].get(str(status_code))
        assert response is not None, f"{method} {path} does not document HTTP {status_code}"
        schema = response.get("content", {}).get("application/json", {}).get("schema")
        assert schema is not None, f"{method} {path} has no documented JSON response schema"
        return schema
    raise AssertionError(f"{method} {path} is absent from the OpenAPI snapshot")


def assert_response_matches_contract(
    contract: dict[str, Any],
    method: str,
    path: str,
    response: Any,
) -> Any:
    assert response.headers["content-type"].startswith("application/json")
    schema = response_schema(contract, method, path, response.status_code)
    registry = Registry().with_resource(
        CONTRACT_URI,
        Resource.from_contents(contract, default_specification=DRAFT202012),
    )
    validator = Draft202012Validator(
        _absolute_local_references(schema),
        registry=registry,
        format_checker=FormatChecker(),
    )
    validator.validate(response.json())
    return response.json()


def _absolute_local_references(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: f"{CONTRACT_URI}{item}"
            if key == "$ref" and isinstance(item, str) and item.startswith("#")
            else _absolute_local_references(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_absolute_local_references(item) for item in value]
    return value


def test_representative_api_responses_match_versioned_openapi_snapshot(
    client: TestClient,
) -> None:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    buyer = auth_headers(client, "contract-buyer")
    admin = auth_headers(client, "contract-admin", ["admin"])

    identity = client.get("/api/v1/auth/me", headers=buyer)
    assert identity.status_code == 200
    assert_response_matches_contract(contract, "GET", "/api/v1/auth/me", identity)

    home = client.get("/api/v1/home", headers=buyer)
    assert home.status_code == 200
    assert_response_matches_contract(contract, "GET", "/api/v1/home", home)

    created_product = client.post(
        "/api/v1/products",
        json=product_payload(price="25.00", stock=5),
        headers=admin,
    )
    assert created_product.status_code == 201
    product = assert_response_matches_contract(
        contract, "POST", "/api/v1/products", created_product
    )

    products = client.get("/api/v1/products?limit=10&offset=0", headers=buyer)
    assert products.status_code == 200
    assert_response_matches_contract(contract, "GET", "/api/v1/products", products)

    address = client.post(
        "/api/v1/addresses",
        json={
            "label": "Home",
            "recipient_name": "Test Buyer",
            "phone": "+905551234567",
            "city": "Istanbul",
            "district": "Kadikoy",
            "address_line": "Example Street 1",
            "postal_code": None,
            "is_default": True,
        },
        headers=buyer,
    )
    assert address.status_code == 201
    address_body = assert_response_matches_contract(contract, "POST", "/api/v1/addresses", address)
    addresses = client.get("/api/v1/addresses", headers=buyer)
    assert addresses.status_code == 200
    assert_response_matches_contract(contract, "GET", "/api/v1/addresses", addresses)

    cart_item = client.post(
        "/api/v1/cart/items",
        json={"product_id": product["id"], "quantity": 2},
        headers=buyer,
    )
    assert cart_item.status_code == 200
    assert_response_matches_contract(contract, "POST", "/api/v1/cart/items", cart_item)

    order_response = client.post(
        "/api/v1/orders",
        json={"address_id": address_body["id"], "delivery_method": "standard"},
        headers={**buyer, "Idempotency-Key": "contract-order"},
    )
    assert order_response.status_code == 201
    order = assert_response_matches_contract(contract, "POST", "/api/v1/orders", order_response)

    payment = client.post(
        f"/api/v1/orders/{order['id']}/payments",
        headers={**buyer, "Idempotency-Key": "contract-payment"},
    )
    assert payment.status_code == 201
    assert_response_matches_contract(
        contract, "POST", f"/api/v1/orders/{order['id']}/payments", payment
    )

    order_list = client.get("/api/v1/orders", headers=buyer)
    assert order_list.status_code == 200
    assert_response_matches_contract(contract, "GET", "/api/v1/orders", order_list)
    admin_orders = client.get("/api/v1/admin/orders", headers=admin)
    assert admin_orders.status_code == 200
    assert_response_matches_contract(contract, "GET", "/api/v1/admin/orders", admin_orders)
    admin_order = client.get(f"/api/v1/admin/orders/{order['id']}", headers=admin)
    assert admin_order.status_code == 200
    assert_response_matches_contract(
        contract, "GET", f"/api/v1/admin/orders/{order['id']}", admin_order
    )

    seller_application = client.get("/api/v1/seller-applications/me", headers=buyer)
    assert seller_application.status_code == 200
    assert_response_matches_contract(
        contract, "GET", "/api/v1/seller-applications/me", seller_application
    )


def test_response_contract_rejects_payloads_missing_required_fields() -> None:
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    schema = response_schema(contract, "GET", "/api/v1/auth/me", 200)
    registry = Registry().with_resource(
        CONTRACT_URI,
        Resource.from_contents(contract, default_specification=DRAFT202012),
    )
    validator = Draft202012Validator(
        _absolute_local_references(schema),
        registry=registry,
        format_checker=FormatChecker(),
    )

    with pytest.raises(ValidationError):
        validator.validate({"sub": "buyer-subject"})
