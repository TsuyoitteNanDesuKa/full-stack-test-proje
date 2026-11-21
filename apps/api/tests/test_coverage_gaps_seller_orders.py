"""Coverage gap tests for seller order status transitions and access."""

from conftest import create_test_token
from fastapi.testclient import TestClient
from test_seller_orders import create_paid_multi_seller_order


def _seller_headers(client: TestClient, subject: str) -> dict[str, str]:
    token = create_test_token(
        client,
        subject=subject,
        email=f"{subject}@example.com",
        roles=["buyer", "seller"],
    )
    return {"Authorization": f"Bearer {token}"}


def test_seller_cannot_read_another_sellers_fulfillment(client: TestClient, engine) -> None:
    create_paid_multi_seller_order(client, engine)
    seller_one = _seller_headers(client, "fulfillment-seller-one")
    seller_two = _seller_headers(client, "fulfillment-seller-two")
    listed_for_one = client.get("/api/v1/seller/orders", headers=seller_one).json()
    listed_for_two = client.get("/api/v1/seller/orders", headers=seller_two).json()
    one_ids = {item["id"] for item in listed_for_one}
    two_ids = {item["id"] for item in listed_for_two}
    assert one_ids and two_ids
    assert one_ids.isdisjoint(two_ids)

    foreign_id = next(iter(two_ids))
    response = client.get(f"/api/v1/seller/orders/{foreign_id}", headers=seller_one)

    assert response.status_code == 404


def test_seller_status_update_on_unknown_fulfillment_returns_404(
    client: TestClient,
    engine,
) -> None:
    create_paid_multi_seller_order(client, engine)

    response = client.patch(
        "/api/v1/seller/orders/999999/status",
        json={"status": "processing"},
        headers=_seller_headers(client, "fulfillment-seller-one"),
    )

    assert response.status_code == 404


def test_seller_status_update_rejects_skipped_stage(client: TestClient, engine) -> None:
    create_paid_multi_seller_order(client, engine)
    headers = _seller_headers(client, "fulfillment-seller-one")
    fulfillment_id = client.get("/api/v1/seller/orders", headers=headers).json()[0]["id"]

    response = client.patch(
        f"/api/v1/seller/orders/{fulfillment_id}/status",
        json={"status": "shipped"},
        headers=headers,
    )

    assert response.status_code == 409


def test_seller_status_update_to_current_status_is_idempotent(
    client: TestClient,
    engine,
) -> None:
    create_paid_multi_seller_order(client, engine)
    headers = _seller_headers(client, "fulfillment-seller-one")
    fulfillment_id = client.get("/api/v1/seller/orders", headers=headers).json()[0]["id"]
    first = client.patch(
        f"/api/v1/seller/orders/{fulfillment_id}/status",
        json={"status": "processing"},
        headers=headers,
    )
    assert first.status_code == 200

    repeat = client.patch(
        f"/api/v1/seller/orders/{fulfillment_id}/status",
        json={"status": "processing"},
        headers=headers,
    )

    assert repeat.status_code == 200
    assert repeat.json()["status"] == "processing"
