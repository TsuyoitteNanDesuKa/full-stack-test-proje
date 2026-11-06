import json

from conftest import create_test_token
from factories import product_payload
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shop_api.models import (
    CustomerOrder,
    OrderStatusEvent,
    Payment,
    Product,
)
from shop_api.payment_providers import sign_webhook_body

WEBHOOK_SECRET = "local-mock-payment-webhook-secret"


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


def create_order(
    client: TestClient,
    buyer_headers: dict[str, str],
    *,
    start_payment: bool,
) -> tuple[int, int, dict[str, object] | None]:
    product_response = client.post(
        "/api/v1/products",
        json=product_payload(stock=5, price="12.50"),
        headers=auth_headers(client, "order-ops-product-admin", ["admin"]),
    )
    assert product_response.status_code == 201
    product_id = product_response.json()["id"]
    cart_response = client.post(
        "/api/v1/cart/items",
        json={"product_id": product_id, "quantity": 2},
        headers=buyer_headers,
    )
    assert cart_response.status_code == 200
    order_response = client.post(
        "/api/v1/orders",
        headers={**buyer_headers, "Idempotency-Key": f"ops-order-{product_id}"},
    )
    assert order_response.status_code == 201
    order_id = order_response.json()["id"]
    if not start_payment:
        return order_id, product_id, None

    payment_response = client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={**buyer_headers, "Idempotency-Key": f"ops-payment-{product_id}"},
    )
    assert payment_response.status_code == 201
    payment = payment_response.json()
    body = json.dumps(
        {
            "event_id": f"ops-payment-success-{product_id}",
            "payment_reference": payment["provider_reference"],
            "status": "succeeded",
            "amount": "25.00",
            "currency": "TRY",
        },
        separators=(",", ":"),
    ).encode()
    webhook_response = client.post(
        "/api/v1/payments/webhook",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Payment-Signature": sign_webhook_body(body, WEBHOOK_SECRET),
        },
    )
    assert webhook_response.status_code == 200
    return order_id, product_id, payment


def test_admin_lists_and_sequentially_updates_orders_with_audit(
    client: TestClient,
    engine,
) -> None:
    buyer_headers = auth_headers(client, "order-ops-buyer")
    order_id, _, _ = create_order(client, buyer_headers, start_payment=True)
    admin_headers = auth_headers(client, "order-ops-admin", ["admin"])

    assert client.get("/api/v1/admin/orders", headers=buyer_headers).status_code == 403
    assert client.get(f"/api/v1/admin/orders/{order_id}", headers=buyer_headers).status_code == 403
    assert client.get("/api/v1/admin/orders?limit=101", headers=admin_headers).status_code == 422
    buyer_order = client.get(f"/api/v1/orders/{order_id}", headers=buyer_headers)
    assert buyer_order.status_code == 200
    assert buyer_order.json()["history"][-1]["action"] == "payment_succeeded"
    assert "actor_subject" not in buyer_order.json()["history"][-1]

    admin_list = client.get(
        "/api/v1/admin/orders?status=paid&limit=10",
        headers=admin_headers,
    )
    assert admin_list.status_code == 200
    assert admin_list.json()[0]["owner_subject"] == "order-ops-buyer"
    assert admin_list.json()[0]["payment_status"] == "succeeded"
    assert admin_list.json()[0]["history"][-1]["actor_subject"] is None
    assert client.get(f"/api/v1/admin/orders/{order_id}", headers=admin_headers).status_code == 200
    assert (
        client.patch(
            f"/api/v1/admin/orders/{order_id}/status",
            json={"status": "processing"},
            headers=buyer_headers,
        ).status_code
        == 403
    )

    skipped_status = client.patch(
        f"/api/v1/admin/orders/{order_id}/status",
        json={"status": "delivered"},
        headers=admin_headers,
    )
    assert skipped_status.status_code == 409

    for next_status in ("processing", "shipped", "delivered"):
        response = client.patch(
            f"/api/v1/admin/orders/{order_id}/status",
            json={"status": next_status},
            headers=admin_headers,
        )
        assert response.status_code == 200
        assert response.json()["status"] == next_status

    replay = client.patch(
        f"/api/v1/admin/orders/{order_id}/status",
        json={"status": "delivered"},
        headers=admin_headers,
    )
    assert replay.status_code == 200
    with Session(engine) as session:
        events = session.scalars(
            select(OrderStatusEvent)
            .where(
                OrderStatusEvent.order_id == order_id,
                OrderStatusEvent.action == "admin_status_changed",
            )
            .order_by(OrderStatusEvent.id)
        ).all()
        assert [event.to_status for event in events] == ["processing", "shipped", "delivered"]
        assert {event.actor_subject for event in events} == {"order-ops-admin"}


def test_admin_refund_is_idempotent_and_restores_stock_once_before_shipment(
    client: TestClient,
    engine,
) -> None:
    buyer_headers = auth_headers(client, "refund-buyer")
    order_id, product_id, _ = create_order(client, buyer_headers, start_payment=True)
    admin_headers = auth_headers(client, "refund-admin", ["admin"])
    url = f"/api/v1/admin/orders/{order_id}/refund"

    assert (
        client.post(
            url,
            json={"reason": "Alıcı talebi"},
            headers=buyer_headers,
        ).status_code
        == 403
    )
    assert (
        client.post(
            url,
            json={"reason": "   "},
            headers=admin_headers,
        ).status_code
        == 422
    )
    response = client.post(
        url,
        json={"reason": "  Alıcı talebi  "},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert response.json()["payment_status"] == "refunded"
    assert response.json()["history"][-1]["action"] == "admin_refund"
    assert response.json()["history"][-1]["reason"] == "Alıcı talebi"
    assert response.json()["history"][-1]["actor_subject"] == "refund-admin"

    replay = client.post(
        url,
        json={"reason": "A different retry reason"},
        headers=admin_headers,
    )
    assert replay.status_code == 200
    assert replay.json()["history"][-1]["reason"] == "Alıcı talebi"

    with Session(engine) as session:
        product = session.get(Product, product_id)
        payment = session.scalar(select(Payment).where(Payment.order_id == order_id))
        order = session.get(CustomerOrder, order_id)
        assert product is not None and product.stock == 5
        assert payment is not None and payment.status == "refunded"
        assert order is not None and order.status == "cancelled"
        assert (
            session.scalar(
                select(func.count())
                .select_from(OrderStatusEvent)
                .where(
                    OrderStatusEvent.order_id == order_id,
                    OrderStatusEvent.action == "admin_refund",
                )
            )
            == 1
        )


def test_refund_rejects_pending_and_shipped_orders_without_stock_changes(
    client: TestClient,
    engine,
) -> None:
    admin_headers = auth_headers(client, "refund-policy-admin", ["admin"])
    pending_buyer = auth_headers(client, "refund-pending-buyer")
    pending_id, pending_product_id, _ = create_order(
        client,
        pending_buyer,
        start_payment=False,
    )
    pending_refund = client.post(
        f"/api/v1/admin/orders/{pending_id}/refund",
        json={"reason": "Alıcı talebi"},
        headers=admin_headers,
    )
    assert pending_refund.status_code == 409

    shipped_buyer = auth_headers(client, "refund-shipped-buyer")
    shipped_id, shipped_product_id, _ = create_order(
        client,
        shipped_buyer,
        start_payment=True,
    )
    for next_status in ("processing", "shipped"):
        assert (
            client.patch(
                f"/api/v1/admin/orders/{shipped_id}/status",
                json={"status": next_status},
                headers=admin_headers,
            ).status_code
            == 200
        )

    shipped_refund = client.post(
        f"/api/v1/admin/orders/{shipped_id}/refund",
        json={"reason": "Alıcı talebi"},
        headers=admin_headers,
    )
    assert shipped_refund.status_code == 409
    with Session(engine) as session:
        pending_product = session.get(Product, pending_product_id)
        shipped_product = session.get(Product, shipped_product_id)
        assert pending_product is not None and pending_product.stock == 3
        assert shipped_product is not None and shipped_product.stock == 3


def test_refund_stock_capacity_failure_rolls_back_payment_and_order(
    client: TestClient,
    engine,
) -> None:
    buyer_headers = auth_headers(client, "refund-capacity-buyer")
    order_id, product_id, payment = create_order(
        client,
        buyer_headers,
        start_payment=True,
    )
    with Session(engine) as session:
        product = session.get(Product, product_id)
        assert product is not None
        product.stock = 999999
        session.commit()

    response = client.post(
        f"/api/v1/admin/orders/{order_id}/refund",
        json={"reason": "Alıcı talebi"},
        headers=auth_headers(client, "refund-capacity-admin", ["admin"]),
    )
    assert response.status_code == 409
    with Session(engine) as session:
        order = session.get(CustomerOrder, order_id)
        stored_payment = session.get(Payment, payment["id"])
        product = session.get(Product, product_id)
        assert order is not None and order.status == "paid"
        assert stored_payment is not None and stored_payment.status == "succeeded"
        assert product is not None and product.stock == 999999
        assert (
            session.scalar(
                select(func.count())
                .select_from(OrderStatusEvent)
                .where(
                    OrderStatusEvent.order_id == order_id,
                    OrderStatusEvent.action == "admin_refund",
                )
            )
            == 0
        )
