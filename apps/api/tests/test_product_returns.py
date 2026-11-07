import json
from datetime import UTC, datetime, timedelta

import pytest
from conftest import create_checkout_request, create_test_token
from factories import product_payload
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shop_api.models import (
    OrderItem,
    OrderStatusEvent,
    Payment,
    Product,
    ProductReturn,
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


def create_shipped_order(
    client: TestClient,
    engine,
    subject: str = "return-buyer",
    quantity: int = 2,
    final_status: str = "delivered",
) -> tuple[int, int, int]:
    admin_headers = auth_headers(client, f"{subject}-admin", ["admin"])
    buyer_headers = auth_headers(client, subject)
    product_response = client.post(
        "/api/v1/products",
        json=product_payload(stock=5, price="12.50"),
        headers=admin_headers,
    )
    assert product_response.status_code == 201
    product_id = int(product_response.json()["id"])
    cart_response = client.post(
        "/api/v1/cart/items",
        json={"product_id": product_id, "quantity": quantity},
        headers=buyer_headers,
    )
    assert cart_response.status_code == 200
    order_response = client.post(
        "/api/v1/orders",
        json=create_checkout_request(client, buyer_headers),
        headers={**buyer_headers, "Idempotency-Key": f"return-order-{subject}"},
    )
    assert order_response.status_code == 201
    order_id = int(order_response.json()["id"])
    order_item_id = int(order_response.json()["items"][0]["id"])

    payment_response = client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={**buyer_headers, "Idempotency-Key": f"return-payment-{subject}"},
    )
    assert payment_response.status_code == 201
    payment = payment_response.json()
    webhook_body = json.dumps(
        {
            "event_id": f"return-payment-success-{subject}",
            "payment_reference": payment["provider_reference"],
            "status": "succeeded",
            "amount": payment["amount"],
            "currency": payment["currency"],
        },
        separators=(",", ":"),
    ).encode()
    webhook_response = client.post(
        "/api/v1/payments/webhook",
        content=webhook_body,
        headers={
            "Content-Type": "application/json",
            "X-Payment-Signature": sign_webhook_body(webhook_body, WEBHOOK_SECRET),
        },
    )
    assert webhook_response.status_code == 200

    for next_status in ("processing", "shipped", "delivered"):
        transition = client.patch(
            f"/api/v1/admin/orders/{order_id}/status",
            json={"status": next_status},
            headers=admin_headers,
        )
        assert transition.status_code == 200
        if next_status == final_status:
            break
    assert (
        client.get(f"/api/v1/admin/orders/{order_id}", headers=admin_headers).json()["status"]
        == final_status
    )
    return order_id, order_item_id, product_id


def submit_return(
    client: TestClient,
    order_id: int,
    item_id: int,
    *,
    subject: str = "return-buyer",
    quantity: int = 1,
    reason: str = "Ürün beklentimi karşılamadı",
    key: str = "return-request-1",
):
    return client.post(
        f"/api/v1/orders/{order_id}/returns",
        json={"order_item_id": item_id, "quantity": quantity, "reason": reason},
        headers={**auth_headers(client, subject), "Idempotency-Key": key},
    )


def test_partial_and_full_returns_are_idempotent_and_update_payment_and_stock(
    client: TestClient,
    engine,
) -> None:
    order_id, item_id, product_id = create_shipped_order(client, engine)

    first = submit_return(client, order_id, item_id)
    assert first.status_code == 201
    assert first.json()["status"] == "approved"
    assert first.json()["refund_amount"] == "12.50"
    assert first.json()["product_name"]

    replay = submit_return(client, order_id, item_id)
    assert replay.status_code == 200
    assert replay.json() == first.json()
    buyer_order = client.get(
        f"/api/v1/orders/{order_id}",
        headers=auth_headers(client, "return-buyer"),
    ).json()
    assert buyer_order["status"] == "delivered"
    assert buyer_order["returns"] == [first.json()]
    assert all("actor_subject" not in event for event in buyer_order["history"])
    assert (
        client.get(
            f"/api/v1/admin/orders/{order_id}",
            headers=auth_headers(client, "return-buyer-admin", ["admin"]),
        ).json()["payment_status"]
        == "partially_refunded"
    )

    with Session(engine) as session:
        product = session.get(Product, product_id)
        assert product is not None and product.stock == 4
        payment = session.scalar(select(Payment).where(Payment.order_id == order_id))
        assert payment is not None and payment.status == "partially_refunded"

    final_return = submit_return(
        client,
        order_id,
        item_id,
        quantity=1,
        key="return-request-2",
    )
    assert final_return.status_code == 201
    assert final_return.json()["refund_amount"] == "12.50"
    admin_order = client.get(
        f"/api/v1/admin/orders/{order_id}",
        headers=auth_headers(client, "return-buyer-admin", ["admin"]),
    ).json()
    assert admin_order["payment_status"] == "partially_refunded"
    assert len(admin_order["returns"]) == 2
    with Session(engine) as session:
        product = session.get(Product, product_id)
        assert product is not None and product.stock == 5
        payment = session.scalar(select(Payment).where(Payment.order_id == order_id))
        assert payment is not None and payment.status == "partially_refunded"


def test_return_rejects_wrong_roles_owners_items_and_excess_quantity(
    client: TestClient,
    engine,
) -> None:
    order_id, item_id, _ = create_shipped_order(client, engine)
    url = f"/api/v1/orders/{order_id}/returns"
    body = {"order_item_id": item_id, "quantity": 1, "reason": "Alıcı iade talebi"}

    assert client.post(url, json=body).status_code == 401
    assert (
        client.post(
            url,
            json=body,
            headers={
                **auth_headers(client, "return-buyer-admin", ["admin"]),
                "Idempotency-Key": "role-denied",
            },
        ).status_code
        == 403
    )
    assert (
        submit_return(
            client,
            order_id,
            item_id,
            subject="different-buyer",
        ).status_code
        == 404
    )
    assert (
        submit_return(
            client,
            order_id,
            item_id + 999,
        ).status_code
        == 404
    )
    assert (
        submit_return(
            client,
            order_id,
            item_id,
            quantity=3,
        ).status_code
        == 409
    )
    assert (
        submit_return(
            client,
            order_id,
            item_id,
            key="invalid/key",
        ).status_code
        == 422
    )
    assert (
        client.post(
            url,
            json=body,
            headers=auth_headers(client, "return-buyer"),
        ).status_code
        == 422
    )


@pytest.mark.parametrize(
    "body",
    [
        {"order_item_id": 1, "quantity": 0, "reason": "valid reason"},
        {"order_item_id": 1, "quantity": 1, "reason": " no "},
        {"order_item_id": 1, "quantity": True, "reason": "valid reason"},
    ],
)
def test_return_request_schema_rejects_invalid_values(
    client: TestClient,
    body: dict[str, object],
) -> None:
    response = client.post(
        "/api/v1/orders/1/returns",
        json=body,
        headers={
            **auth_headers(client, "return-buyer"),
            "Idempotency-Key": "invalid-payload",
        },
    )
    assert response.status_code == 422


def test_return_rejects_orders_that_are_not_shipped_or_delivered(
    client: TestClient,
    engine,
) -> None:
    order_id, item_id, _ = create_shipped_order(
        client,
        engine,
        final_status="processing",
    )

    response = submit_return(client, order_id, item_id)

    assert response.status_code == 409


def test_return_window_accepts_exact_boundary_and_rejects_expired_or_future_events(
    client: TestClient,
    engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    order_id, item_id, _ = create_shipped_order(client, engine, subject="boundary-buyer")
    fixed_now = datetime.now(UTC)

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed_now if tz else fixed_now.replace(tzinfo=None)

    import shop_api.routes.orders as orders_route

    monkeypatch.setattr(orders_route, "datetime", FrozenDateTime)
    with Session(engine) as session:
        transition = session.scalar(
            select(OrderStatusEvent).where(
                OrderStatusEvent.order_id == order_id,
                OrderStatusEvent.to_status == "delivered",
            )
        )
        assert transition is not None
        transition.created_at = fixed_now - timedelta(days=30)
        session.commit()

    boundary_response = submit_return(
        client,
        order_id,
        item_id,
        subject="boundary-buyer",
        key="boundary-key",
    )
    assert boundary_response.status_code == 201

    old_order_id, old_item_id, _ = create_shipped_order(
        client,
        engine,
        subject="expired-buyer",
    )
    with Session(engine) as session:
        transition = session.scalar(
            select(OrderStatusEvent).where(
                OrderStatusEvent.order_id == old_order_id,
                OrderStatusEvent.to_status == "delivered",
            )
        )
        assert transition is not None
        transition.created_at = fixed_now - timedelta(days=30, seconds=1)
        session.commit()

    expired_response = submit_return(
        client,
        old_order_id,
        old_item_id,
        subject="expired-buyer",
    )
    assert expired_response.status_code == 409

    future_order_id, future_item_id, _ = create_shipped_order(
        client,
        engine,
        subject="future-buyer",
    )
    with Session(engine) as session:
        transition = session.scalar(
            select(OrderStatusEvent).where(
                OrderStatusEvent.order_id == future_order_id,
                OrderStatusEvent.to_status == "delivered",
            )
        )
        assert transition is not None
        transition.created_at = fixed_now + timedelta(seconds=1)
        session.commit()

    future_response = submit_return(
        client,
        future_order_id,
        future_item_id,
        subject="future-buyer",
    )
    assert future_response.status_code == 409


def test_deleted_product_keeps_return_snapshot_without_restoring_stock(
    client: TestClient,
    engine,
) -> None:
    order_id, item_id, product_id = create_shipped_order(client, engine)
    deleted = client.delete(
        f"/api/v1/products/{product_id}",
        headers=auth_headers(client, "return-buyer-admin", ["admin"]),
    )
    assert deleted.status_code == 204
    with Session(engine) as session:
        assert session.get(Product, product_id) is None

    response = submit_return(client, order_id, item_id)

    assert response.status_code == 201
    assert response.json()["product_name"]
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(ProductReturn)) == 1
        payment = session.scalar(select(Payment).where(Payment.order_id == order_id))
        assert payment is not None and payment.status == "partially_refunded"
        item = session.get(OrderItem, item_id)
        assert item is not None and item.product_id is None


def test_return_stock_limit_failure_rolls_back_return_and_payment(
    client: TestClient,
    engine,
) -> None:
    order_id, item_id, product_id = create_shipped_order(client, engine)
    with Session(engine) as session:
        product = session.get(Product, product_id)
        assert product is not None
        product.stock = 999999
        session.commit()

    response = submit_return(client, order_id, item_id)

    assert response.status_code == 409
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(ProductReturn)) == 0
        product = session.get(Product, product_id)
        assert product is not None and product.stock == 999999
        payment = session.scalar(select(Payment).where(Payment.order_id == order_id))
        assert payment is not None and payment.status == "succeeded"


def test_reusing_return_idempotency_key_with_different_payload_conflicts(
    client: TestClient,
    engine,
) -> None:
    order_id, item_id, _ = create_shipped_order(client, engine)
    first = submit_return(client, order_id, item_id)
    conflict = submit_return(
        client,
        order_id,
        item_id,
        quantity=2,
    )

    assert first.status_code == 201
    assert conflict.status_code == 409
