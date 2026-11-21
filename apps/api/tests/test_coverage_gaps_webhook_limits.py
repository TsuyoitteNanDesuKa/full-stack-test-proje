"""Coverage gap tests: webhook failure restoring stock above the stock ceiling, naive expiry timestamp."""

import json
from datetime import datetime, timedelta

from conftest import create_checkout_request, create_test_token
from factories import product_payload
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from shop_api.models import CustomerOrder, OrderItem, Payment, Product
from shop_api.payment_providers import sign_webhook_body

WEBHOOK_SECRET = "local-mock-payment-webhook-secret"


def _headers(client: TestClient, subject: str, roles: list[str]) -> dict[str, str]:
    token = create_test_token(
        client,
        subject=subject,
        email=f"{subject}@example.com",
        roles=roles,
    )
    return {"Authorization": f"Bearer {token}"}


def _pending_payment(client: TestClient, subject: str) -> dict:
    buyer = _headers(client, subject, ["buyer"])
    admin = _headers(client, f"{subject}-admin", ["admin"])
    product = client.post(
        "/api/v1/products",
        json=product_payload(stock=5, price="12.50"),
        headers=admin,
    ).json()
    client.post(
        "/api/v1/cart/items",
        json={"product_id": product["id"], "quantity": 1},
        headers=buyer,
    )
    order = client.post(
        "/api/v1/orders",
        json=create_checkout_request(client, buyer),
        headers={**buyer, "Idempotency-Key": f"order-{subject}"},
    ).json()
    payment = client.post(
        f"/api/v1/orders/{order['id']}/payments",
        headers={**buyer, "Idempotency-Key": f"pay-{subject}"},
    )
    assert payment.status_code == 201
    return {**payment.json(), "order_id": order["id"], "product_id": product["id"]}


def _webhook(client: TestClient, payment: dict, event_id: str, result: str):
    body = json.dumps(
        {
            "event_id": event_id,
            "payment_reference": payment["provider_reference"],
            "status": result,
            "amount": payment["amount"],
            "currency": payment["currency"],
        },
        separators=(",", ":"),
    ).encode()
    return client.post(
        "/api/v1/payments/webhook",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Payment-Signature": sign_webhook_body(body, WEBHOOK_SECRET),
        },
    )


def test_failed_webhook_is_refused_when_restoring_stock_would_exceed_limit(
    client: TestClient, engine
) -> None:
    payment = _pending_payment(client, "limit-failed-webhook")
    with Session(engine) as db:
        product = db.get(Product, payment["product_id"])
        product.stock = 999999
        db.commit()

    response = _webhook(client, payment, "limit-failed-event", "failed")

    assert response.status_code == 409
    assert response.json()["detail"] == "Stok sınırı nedeniyle sipariş kapatılamadı."
    with Session(engine) as db:
        assert db.get(CustomerOrder, payment["order_id"]).status == "pending_payment"
        assert db.get(Payment, payment["id"]).status == "pending"


def test_success_webhook_accepts_naive_expiry_timestamp(client: TestClient, engine) -> None:
    payment = _pending_payment(client, "naive-expiry")
    with Session(engine) as db:
        stored = db.get(Payment, payment["id"])
        stored.expires_at = (datetime.now() + timedelta(minutes=5)).replace(tzinfo=None)
        db.commit()

    response = _webhook(client, payment, "naive-expiry-event", "succeeded")

    assert response.status_code == 200
    assert response.json()["payment"]["status"] == "succeeded"
    with Session(engine) as db:
        assert db.get(CustomerOrder, payment["order_id"]).status == "paid"
        assert db.query(OrderItem).filter(OrderItem.order_id == payment["order_id"]).count() == 1
