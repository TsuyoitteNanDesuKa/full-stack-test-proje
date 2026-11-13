import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from test_admin_orders import auth_headers, create_order
from test_seller_orders import create_paid_multi_seller_order

from shop_api.models import CustomerOrder, OrderFulfillment, OrderStatusEvent, Payment, Product


@pytest.mark.parametrize("payment_mode", ["none", "pending", "paid", "processing"])
def test_buyer_cancels_once_and_updates_payment_stock_and_audit(
    client: TestClient, engine, payment_mode: str
) -> None:
    headers = auth_headers(client, f"cancel-{payment_mode}")
    order_id, product_id, payment = create_order(
        client, headers, start_payment=payment_mode in {"paid", "processing"}
    )
    if payment_mode == "pending":
        response = client.post(
            f"/api/v1/orders/{order_id}/payments",
            headers={**headers, "Idempotency-Key": f"cancel-payment-{product_id}"},
        )
        assert response.status_code == 201
        payment = response.json()
    if payment_mode == "processing":
        assert (
            client.patch(
                f"/api/v1/admin/orders/{order_id}/status",
                json={"status": "processing"},
                headers=auth_headers(client, "cancel-admin", ["admin"]),
            ).status_code
            == 200
        )
    url = f"/api/v1/orders/{order_id}/cancel"
    assert client.post(url, json={}, headers=auth_headers(client, "other")).status_code == 404
    assert (
        client.post(url, json={}, headers=auth_headers(client, "only-admin", ["admin"])).status_code
        == 403
    )
    response = client.post(url, json={"reason": "  Changed my mind  "}, headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert response.json()["history"][-1]["reason"] == "Changed my mind"
    assert response.json()["history"][-1]["action"] == "buyer_cancelled"
    assert "actor_subject" not in response.json()["history"][-1]
    assert all(group["status"] == "cancelled" for group in response.json()["fulfillments"])
    assert client.post(url, json={"reason": "another retry"}, headers=headers).status_code == 200
    if payment_mode == "pending":
        late = client.post(payment["checkout_url"], json={"status": "succeeded"})
        assert late.status_code == 200
    with Session(engine) as db:
        assert db.get(Product, product_id).stock == 5
        stored_payment = db.scalar(select(Payment).where(Payment.order_id == order_id))
        if payment_mode == "none":
            assert stored_payment is None
        else:
            assert stored_payment.status == (
                "cancelled" if payment_mode == "pending" else "refunded"
            )
        assert (
            db.scalar(
                select(func.count())
                .select_from(OrderStatusEvent)
                .where(
                    OrderStatusEvent.order_id == order_id,
                    OrderStatusEvent.action == "buyer_cancelled",
                )
            )
            == 1
        )


def test_cancellation_rejects_shipped_package_and_stock_overflow_atomically(
    client: TestClient, engine
) -> None:
    order, _, _ = create_paid_multi_seller_order(client, engine)
    headers = auth_headers(client, "fulfillment-buyer")
    seller = auth_headers(client, "fulfillment-seller-one", ["buyer", "seller"])
    fulfillment = client.get("/api/v1/seller/orders", headers=seller).json()[0]["id"]
    for next_status in ("processing", "shipped"):
        assert (
            client.patch(
                f"/api/v1/seller/orders/{fulfillment}/status",
                json={"status": next_status},
                headers=seller,
            ).status_code
            == 200
        )
    response = client.post(f"/api/v1/orders/{order['id']}/cancel", json={}, headers=headers)
    assert response.status_code == 409
    with Session(engine) as db:
        assert db.get(CustomerOrder, order["id"]).status == "paid"
        assert (
            db.scalar(select(Payment).where(Payment.order_id == order["id"])).status == "succeeded"
        )
        assert db.get(OrderFulfillment, fulfillment).status == "shipped"

    buyer = auth_headers(client, "overflow-buyer")
    order_id, product_id, _ = create_order(client, buyer, start_payment=True)
    with Session(engine) as db:
        db.get(Product, product_id).stock = 999999
        db.commit()
    assert (
        client.post(f"/api/v1/orders/{order_id}/cancel", json={}, headers=buyer).status_code == 409
    )
    with Session(engine) as db:
        assert db.get(Product, product_id).stock == 999999
        assert db.get(CustomerOrder, order_id).status == "paid"
        assert db.scalar(select(Payment).where(Payment.order_id == order_id)).status == "succeeded"


def test_buyer_cannot_replay_an_admin_cancellation(client: TestClient, engine) -> None:
    headers = auth_headers(client, "admin-cancel-buyer")
    order_id, product_id, _ = create_order(client, headers, start_payment=True)
    admin = auth_headers(client, "admin-cancel-admin", ["admin"])
    assert (
        client.post(
            f"/api/v1/admin/orders/{order_id}/refund",
            headers=admin,
            json={"reason": "Admin cancelled"},
        ).status_code
        == 200
    )
    assert (
        client.post(f"/api/v1/orders/{order_id}/cancel", headers=headers, json={}).status_code
        == 409
    )
    with Session(engine) as db:
        assert db.get(Product, product_id).stock == 5
        assert (
            db.scalar(
                select(func.count())
                .select_from(OrderStatusEvent)
                .where(
                    OrderStatusEvent.order_id == order_id,
                    OrderStatusEvent.action == "buyer_cancelled",
                )
            )
            == 0
        )
