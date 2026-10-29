from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from shop_api.models import User

PRODUCT_PAYLOAD = {
    "name": "Lavanta El Kremi",
    "category": "Kişisel Bakım",
    "description": "Günlük kullanım için nemlendirici el kremi.",
    "price": "129.90",
    "stock": 24,
}


def access_token(client: TestClient, user: User) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "correct-password-123"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_list_products_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/v1/products")

    assert response.status_code == 401


def test_list_products_returns_empty_page_for_customer(
    client: TestClient,
    customer: User,
) -> None:
    response = client.get(
        "/api/v1/products",
        headers={"Authorization": f"Bearer {access_token(client, customer)}"},
    )

    assert response.status_code == 200
    assert response.json() == {"products": [], "total": 0, "limit": 20, "offset": 0}


def test_admin_can_create_product_and_customer_can_list_it(
    client: TestClient,
    admin: User,
    customer: User,
) -> None:
    admin_token = access_token(client, admin)
    create_response = client.post(
        "/api/v1/products",
        json=PRODUCT_PAYLOAD,
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert create_response.status_code == 201
    created_product = create_response.json()
    assert created_product == {
        "id": 1,
        **PRODUCT_PAYLOAD,
        "price": "129.90",
    }

    list_response = client.get(
        "/api/v1/products",
        headers={"Authorization": f"Bearer {access_token(client, customer)}"},
    )

    assert list_response.status_code == 200
    assert list_response.json() == {
        "products": [created_product],
        "total": 1,
        "limit": 20,
        "offset": 0,
    }


def test_customer_cannot_create_products(
    client: TestClient,
    customer: User,
) -> None:
    response = client.post(
        "/api/v1/products",
        json=PRODUCT_PAYLOAD,
        headers={"Authorization": f"Bearer {access_token(client, customer)}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Bu işlem için yönetici yetkisi gereklidir."
    assert (
        client.get(
            "/api/v1/products",
            headers={"Authorization": f"Bearer {access_token(client, customer)}"},
        ).json()["total"]
        == 0
    )


def test_create_products_rejects_missing_authentication(
    client: TestClient,
) -> None:
    response = client.post("/api/v1/products", json=PRODUCT_PAYLOAD)

    assert response.status_code == 401


@pytest.mark.parametrize(
    "updates",
    [
        pytest.param({"name": "x"}, id="name-too-short"),
        pytest.param({"category": "x"}, id="category-too-short"),
        pytest.param({"description": ""}, id="empty-description"),
        pytest.param({"price": "0"}, id="zero-price"),
        pytest.param({"price": "1.999"}, id="too-many-decimals"),
        pytest.param({"price": "100000000"}, id="price-out-of-range"),
        pytest.param({"price": "-0.01"}, id="negative-price"),
        pytest.param({"stock": -1}, id="negative-stock"),
        pytest.param({"stock": 1.5}, id="fractional-stock"),
        pytest.param({"name": "N" * 121}, id="name-too-long"),
        pytest.param({"category": "C" * 81}, id="category-too-long"),
        pytest.param({"description": "D" * 601}, id="description-too-long"),
    ],
)
def test_admin_cannot_create_product_with_invalid_fields(
    client: TestClient,
    admin: User,
    updates: dict[str, object],
) -> None:
    payload = {**PRODUCT_PAYLOAD, **updates}
    response = client.post(
        "/api/v1/products",
        json=payload,
        headers={"Authorization": f"Bearer {access_token(client, admin)}"},
    )

    assert response.status_code == 422


def test_list_products_supports_stable_pagination(
    client: TestClient,
    admin: User,
) -> None:
    token = access_token(client, admin)
    for product_number in range(3):
        response = client.post(
            "/api/v1/products",
            json={
                **PRODUCT_PAYLOAD,
                "name": f"Ürün {product_number + 1}",
                "price": str(Decimal("10.00") + product_number),
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 201

    response = client.get(
        "/api/v1/products?limit=1&offset=1",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["total"] == 3
    assert response.json()["limit"] == 1
    assert response.json()["offset"] == 1
    assert response.json()["products"][0]["name"] == "Ürün 2"


@pytest.mark.parametrize("query", ["limit=0", "limit=101", "offset=-1"])
def test_list_products_rejects_invalid_pagination(
    client: TestClient,
    customer: User,
    query: str,
) -> None:
    response = client.get(
        f"/api/v1/products?{query}",
        headers={"Authorization": f"Bearer {access_token(client, customer)}"},
    )

    assert response.status_code == 422


@pytest.mark.parametrize("method", ["get", "post"])
def test_product_endpoints_reject_invalid_bearer_token(
    client: TestClient,
    method: str,
) -> None:
    request = getattr(client, method)
    if method == "get":
        response = request("/api/v1/products", headers={"Authorization": "Bearer invalid"})
    else:
        response = request(
            "/api/v1/products",
            json=PRODUCT_PAYLOAD,
            headers={"Authorization": "Bearer invalid"},
        )

    assert response.status_code == 401
