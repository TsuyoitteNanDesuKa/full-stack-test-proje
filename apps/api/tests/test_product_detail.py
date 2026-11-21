"""REQ-020: tekil ürün okuma uç noktası (GET /api/v1/products/{product_id})."""

from conftest import create_test_token
from factories import product_payload
from fastapi.testclient import TestClient


def _headers(client: TestClient, subject: str, roles: list[str]) -> dict[str, str]:
    token = create_test_token(
        client,
        subject=subject,
        email=f"{subject}@example.com",
        roles=roles,
    )
    return {"Authorization": f"Bearer {token}"}


def _create_product(client: TestClient, admin: dict[str, str], **overrides) -> dict:
    response = client.post(
        "/api/v1/products",
        json=product_payload(**overrides),
        headers=admin,
    )
    assert response.status_code == 201
    return response.json()


def test_product_detail_requires_authentication(client: TestClient) -> None:
    admin = _headers(client, "detail-admin-auth", ["admin"])
    product = _create_product(client, admin)

    response = client.get(f"/api/v1/products/{product['id']}")

    assert response.status_code == 401


def test_product_detail_rejects_invalid_bearer_token(client: TestClient) -> None:
    admin = _headers(client, "detail-admin-token", ["admin"])
    product = _create_product(client, admin)

    response = client.get(
        f"/api/v1/products/{product['id']}",
        headers={"Authorization": "Bearer not-a-real-token"},
    )

    assert response.status_code == 401


def test_buyer_reads_current_price_and_stock_with_manage_flag_false(client: TestClient) -> None:
    admin = _headers(client, "detail-admin-buyer", ["admin"])
    buyer = _headers(client, "detail-buyer", ["buyer"])
    product = _create_product(client, admin, price="19.90", stock=7)

    response = client.get(f"/api/v1/products/{product['id']}", headers=buyer)

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == product["id"]
    assert body["name"] == product["name"]
    assert body["price"] == "19.90"
    assert body["stock"] == 7
    assert body["can_manage"] is False


def test_admin_detail_reports_manage_permission(client: TestClient) -> None:
    admin = _headers(client, "detail-admin-manage", ["admin"])
    product = _create_product(client, admin)

    response = client.get(f"/api/v1/products/{product['id']}", headers=admin)

    assert response.status_code == 200
    assert response.json()["can_manage"] is True


def test_detail_reflects_latest_price_and_stock_after_update(client: TestClient) -> None:
    admin = _headers(client, "detail-admin-update", ["admin"])
    product = _create_product(client, admin, price="10.00", stock=3)
    updated = {**product_payload(price="25.50", stock=9), "name": product["name"]}
    assert (
        client.put(f"/api/v1/products/{product['id']}", json=updated, headers=admin).status_code
        == 200
    )

    response = client.get(f"/api/v1/products/{product['id']}", headers=admin)

    assert response.status_code == 200
    assert response.json()["price"] == "25.50"
    assert response.json()["stock"] == 9


def test_detail_returns_404_for_unknown_product(client: TestClient) -> None:
    buyer = _headers(client, "detail-buyer-missing", ["buyer"])

    response = client.get("/api/v1/products/987654", headers=buyer)

    assert response.status_code == 404
    assert response.json()["detail"] == "Ürün bulunamadı."


def test_detail_returns_404_after_product_deletion(client: TestClient) -> None:
    admin = _headers(client, "detail-admin-deleted", ["admin"])
    buyer = _headers(client, "detail-buyer-deleted", ["buyer"])
    product = _create_product(client, admin)
    assert client.delete(f"/api/v1/products/{product['id']}", headers=admin).status_code == 204

    response = client.get(f"/api/v1/products/{product['id']}", headers=buyer)

    assert response.status_code == 404


def test_detail_rejects_non_positive_or_non_numeric_ids_without_lookup(client: TestClient) -> None:
    buyer = _headers(client, "detail-buyer-invalid-id", ["buyer"])

    for bad_id in ("0", "-1", "abc"):
        response = client.get(f"/api/v1/products/{bad_id}", headers=buyer)
        assert response.status_code == 422, bad_id
