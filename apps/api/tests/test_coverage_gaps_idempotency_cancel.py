"""Coverage gap tests: idempotent checkout replay and repeated buyer cancellation."""

from conftest import create_checkout_request, create_test_token
from factories import product_payload
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_admin_orders import create_order

from shop_api.models import CustomerOrder, OrderStatusEvent


def _buyer(client: TestClient, subject: str) -> dict[str, str]:
    token = create_test_token(
        client,
        subject=subject,
        email=f"{subject}@example.com",
        roles=["buyer"],
    )
    return {"Authorization": f"Bearer {token}"}


def test_checkout_replay_with_same_idempotency_key_returns_existing_order(
    client: TestClient,
) -> None:
    subject = "idem-replay-buyer"
    buyer = _buyer(client, subject)
    admin = create_test_token(
        client,
        subject=f"{subject}-admin",
        email=f"{subject}-admin@example.com",
        roles=["admin"],
    )
    product = client.post(
        "/api/v1/products",
        json=product_payload(stock=5, price="12.50"),
        headers={"Authorization": f"Bearer {admin}"},
    ).json()
    assert (
        client.post(
            "/api/v1/cart/items",
            json={"product_id": product["id"], "quantity": 1},
            headers=buyer,
        ).status_code
        == 200
    )
    checkout = create_checkout_request(client, buyer)
    headers = {**buyer, "Idempotency-Key": "idem-replay-key"}

    first = client.post("/api/v1/orders", json=checkout, headers=headers)
    replay = client.post("/api/v1/orders", json=checkout, headers=headers)

    assert first.status_code == 201
    assert replay.status_code == 200
    assert replay.json()["id"] == first.json()["id"]


def test_repeated_buyer_cancel_after_buyer_cancelled_event_is_idempotent(
    client: TestClient, engine
) -> None:
    subject = "idem-cancel-buyer"
    headers = _buyer(client, subject)
    order_id, _, _ = create_order(client, headers, start_payment=False)

    first = client.post(f"/api/v1/orders/{order_id}/cancel", json={}, headers=headers)
    assert first.status_code == 200

    with Session(engine) as db:
        buyer_event = (
            db.query(OrderStatusEvent)
            .filter(
                OrderStatusEvent.order_id == order_id,
                OrderStatusEvent.action == "buyer_cancelled",
            )
            .count()
        )
        assert buyer_event == 1
        assert db.get(CustomerOrder, order_id).status == "cancelled"

    second = client.post(f"/api/v1/orders/{order_id}/cancel", json={}, headers=headers)

    assert second.status_code == 200
    assert second.json()["status"] == "cancelled"
