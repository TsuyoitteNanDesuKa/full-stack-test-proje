"""Coverage gap tests for real webhook behaviour branches (expired, non-pending orders)."""

import json
from datetime import UTC, datetime, timedelta

from conftest import create_checkout_request, create_test_token
from factories import product_payload
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from shop_api.models import CustomerOrder, Payment
from shop_api.payment_providers import sign_webhook_body

WEBHOOK_SECRET = "local-mock-payment-webhook-secret"


def _headers(client: TestClient, subject: str, roles: list[str] | None = None) -> dict[str, str]:
    token = create_test_token(
        client,
        subject=subject,
        email=f"{subject}@example.com",
        roles=roles if roles is not None else ["buyer"],
    )
    return {"Authorization": f"Bearer {token}"}


def _pending_payment(client: TestClient, subject: str) -> dict:
    buyer = _headers(client, subject)
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
    return {**payment.json(), "order_id": order["id"]}


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


def test_success_webhook_after_expiry_is_refused_and_order_is_cancelled(
    client: TestClient, engine
) -> None:
    payment = _pending_payment(client, "webhook-expired-success")
    with Session(engine) as db:
        stored = db.get(Payment, payment["id"])
        stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()

    response = _webhook(client, payment, "expired-success-event", "succeeded")

    assert response.status_code == 200
    assert response.json()["payment"]["status"] == "expired"
    with Session(engine) as db:
        assert db.get(CustomerOrder, payment["order_id"]).status == "cancelled"


def test_success_webhook_does_not_reopen_an_already_paid_order(client: TestClient, engine) -> None:
    payment = _pending_payment(client, "webhook-already-paid")
    with Session(engine) as db:
        order = db.get(CustomerOrder, payment["order_id"])
        order.status = "processing"
        db.commit()

    response = _webhook(client, payment, "already-paid-event", "succeeded")

    assert response.status_code == 200
    assert response.json()["payment"]["status"] == "succeeded"
    with Session(engine) as db:
        assert db.get(CustomerOrder, payment["order_id"]).status == "processing"


def test_failed_webhook_on_already_processing_order_keeps_order_status(
    client: TestClient, engine
) -> None:
    payment = _pending_payment(client, "webhook-failed-processing")
    with Session(engine) as db:
        order = db.get(CustomerOrder, payment["order_id"])
        order.status = "processing"
        db.commit()

    response = _webhook(client, payment, "failed-processing-event", "failed")

    assert response.status_code == 200
    assert response.json()["payment"]["status"] == "failed"
    with Session(engine) as db:
        assert db.get(CustomerOrder, payment["order_id"]).status == "processing"


def test_event_id_reused_for_another_payment_is_a_conflict(client: TestClient) -> None:
    first = _pending_payment(client, "webhook-event-owner-a")
    second = _pending_payment(client, "webhook-event-owner-b")
    assert _webhook(client, first, "shared-event", "failed").status_code == 200

    response = _webhook(client, second, "shared-event", "failed")

    assert response.status_code == 409
    assert response.json()["detail"] == "Webhook event ID çakışması."
