import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from conftest import create_checkout_request, create_test_token
from factories import product_payload
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shop_api.models import CustomerOrder, OrderItem, Payment, PaymentWebhookEvent, Product
from shop_api.payment_expiry import expire_due_payments
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


def create_order(client: TestClient, buyer_headers: dict[str, str]) -> tuple[int, int]:
    product_response = client.post(
        "/api/v1/products",
        json=product_payload(stock=5, price="12.50"),
        headers=auth_headers(client, "payment-admin", ["admin"]),
    )
    assert product_response.status_code == 201
    product = product_response.json()
    add_response = client.post(
        "/api/v1/cart/items",
        json={"product_id": product["id"], "quantity": 2},
        headers=buyer_headers,
    )
    assert add_response.status_code == 200
    order_response = client.post(
        "/api/v1/orders",
        json=create_checkout_request(client, buyer_headers),
        headers={**buyer_headers, "Idempotency-Key": f"order-{product['id']}"},
    )
    assert order_response.status_code == 201
    return order_response.json()["id"], product["id"]


def start_payment(
    client: TestClient,
    headers: dict[str, str],
    order_id: int,
    key: str = "payment-key",
):
    return client.post(
        f"/api/v1/orders/{order_id}/payments",
        headers={**headers, "Idempotency-Key": key},
    )


def send_webhook(
    client: TestClient,
    payment: dict[str, object],
    *,
    event_id: str,
    result: str,
    amount: str | None = None,
    currency: str = "TRY",
):
    body = json.dumps(
        {
            "event_id": event_id,
            "payment_reference": payment["provider_reference"],
            "status": result,
            "amount": amount or str(payment["amount"]),
            "currency": currency,
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


def test_buyer_starts_payment_and_same_key_replays_hosted_session(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "payment-start-buyer")
    order_id, _ = create_order(client, headers)

    first = start_payment(client, headers, order_id)
    replay = start_payment(client, headers, order_id)

    assert first.status_code == 201
    assert first.json()["status"] == "pending"
    assert first.json()["amount"] == "74.90"
    assert first.json()["currency"] == "TRY"
    assert first.json()["checkout_url"].startswith("/api/v1/payments/mock-checkout/")
    assert replay.status_code == 200
    assert replay.json() == first.json()
    assert (
        client.get(
            f"/api/v1/orders/{order_id}/payments/{first.json()['id']}",
            headers=headers,
        ).json()
        == first.json()
    )


def test_payment_requires_order_owner_and_pending_order(client: TestClient) -> None:
    owner_headers = auth_headers(client, "payment-owner")
    other_headers = auth_headers(client, "payment-other")
    order_id, _ = create_order(client, owner_headers)

    assert start_payment(client, other_headers, order_id).status_code == 404
    seller_headers = auth_headers(client, "payment-seller", ["seller"])
    assert start_payment(client, seller_headers, order_id).status_code == 403
    payment = start_payment(client, owner_headers, order_id).json()
    assert start_payment(client, owner_headers, order_id, "different-key").status_code == 409
    assert start_payment(client, owner_headers, order_id + 100, "missing-order").status_code == 404
    assert (
        client.get(
            f"/api/v1/orders/{order_id}/payments/{payment['id']}",
            headers=other_headers,
        ).status_code
        == 404
    )
    assert (
        start_payment(
            client,
            owner_headers,
            order_id,
            "reused-key",
        ).status_code
        == 409
    )


def test_success_webhook_is_signed_idempotent_and_does_not_restore_stock(
    client: TestClient,
    engine,
) -> None:
    headers = auth_headers(client, "payment-success-buyer")
    order_id, product_id = create_order(client, headers)
    payment = start_payment(client, headers, order_id).json()

    first = send_webhook(client, payment, event_id="success-event", result="succeeded")
    replay = send_webhook(client, payment, event_id="success-event", result="succeeded")

    assert first.status_code == 200
    assert first.json()["payment"]["status"] == "succeeded"
    assert replay.status_code == 200
    assert replay.json()["duplicate"] is True
    order = client.get(f"/api/v1/orders/{order_id}", headers=headers).json()
    assert order["status"] == "paid"
    with Session(engine) as session:
        product = session.get(Product, product_id)
        assert product is not None and product.stock == 3
        assert session.scalar(select(func.count()).select_from(PaymentWebhookEvent)) == 1


def test_failed_and_cancelled_webhooks_restore_order_stock_once(
    client: TestClient,
    engine,
) -> None:
    for result in ("failed", "cancelled"):
        headers = auth_headers(client, f"payment-{result}-buyer")
        order_id, product_id = create_order(client, headers)
        payment = start_payment(client, headers, order_id).json()

        response = send_webhook(
            client,
            payment,
            event_id=f"{result}-event",
            result=result,
        )
        duplicate = send_webhook(
            client,
            payment,
            event_id=f"{result}-event",
            result=result,
        )

        assert response.status_code == 200
        assert response.json()["payment"]["status"] == result
        assert duplicate.json()["duplicate"] is True
        assert (
            client.get(f"/api/v1/orders/{order_id}", headers=headers).json()["status"]
            == "cancelled"
        )
        with Session(engine) as session:
            product = session.get(Product, product_id)
            assert product is not None and product.stock == 5


def test_webhook_rejects_bad_signature_unknown_payment_and_mismatched_total(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "payment-invalid-hook-buyer")
    order_id, _ = create_order(client, headers)
    payment = start_payment(client, headers, order_id).json()
    payload = {
        "event_id": "invalid-test-event",
        "payment_reference": payment["provider_reference"],
        "status": "succeeded",
        "amount": "25.00",
        "currency": "TRY",
    }
    body = json.dumps(payload, separators=(",", ":")).encode()
    bad_signature = client.post(
        "/api/v1/payments/webhook",
        content=body,
        headers={"X-Payment-Signature": "0" * 64},
    )
    assert bad_signature.status_code == 401

    assert (
        send_webhook(
            client,
            payment,
            event_id="wrong-amount",
            result="succeeded",
            amount="24.99",
        ).status_code
        == 409
    )
    payload["event_id"] = "unknown-reference"
    payload["payment_reference"] = "unknown-payment"
    body = json.dumps(payload, separators=(",", ":")).encode()
    unknown = client.post(
        "/api/v1/payments/webhook",
        content=body,
        headers={
            "X-Payment-Signature": sign_webhook_body(body, WEBHOOK_SECRET),
        },
    )
    assert unknown.status_code == 404


def test_webhook_rejects_event_id_reuse_and_ignores_out_of_order_result(
    client: TestClient,
    engine,
) -> None:
    headers = auth_headers(client, "payment-ordering-buyer")
    order_id, product_id = create_order(client, headers)
    payment = start_payment(client, headers, order_id).json()

    failed = send_webhook(client, payment, event_id="same-event", result="failed")
    reused = send_webhook(client, payment, event_id="same-event", result="succeeded")
    late_success = send_webhook(client, payment, event_id="late-success", result="succeeded")

    assert failed.json()["payment"]["status"] == "failed"
    assert reused.status_code == 409
    assert late_success.json()["payment"]["status"] == "failed"
    with Session(engine) as session:
        product = session.get(Product, product_id)
        assert product is not None and product.stock == 5
        assert session.scalar(select(func.count()).select_from(PaymentWebhookEvent)) == 2


def test_mock_hosted_checkout_accepts_test_result_without_card_fields(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "payment-hosted-checkout-buyer")
    order_id, _ = create_order(client, headers)
    payment = start_payment(client, headers, order_id).json()
    checkout_url = payment["checkout_url"]

    page = client.get(checkout_url)
    assert page.status_code == 200
    assert "sandbox" in page.text.lower()
    assert 'name="card' not in page.text
    bad_token_url = checkout_url.rsplit("/", 1)[0] + "/invalid"
    assert client.get(bad_token_url).status_code == 404

    completed = client.post(checkout_url, json={"status": "succeeded"})

    assert completed.status_code == 200
    assert completed.json()["status"] == "succeeded"


def test_expired_payment_restores_stock_exactly_once(client: TestClient, engine) -> None:
    headers = auth_headers(client, "payment-expiry-buyer")
    order_id, product_id = create_order(client, headers)
    payment_body = start_payment(client, headers, order_id).json()
    with Session(engine) as session:
        payment = session.get(Payment, payment_body["id"])
        assert payment is not None
        payment.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()

    with Session(engine) as session:
        assert expire_due_payments(session) == 1
    with Session(engine) as session:
        assert expire_due_payments(session) == 0
        payment = session.get(Payment, payment_body["id"])
        order = session.get(CustomerOrder, order_id)
        product = session.get(Product, product_id)
        assert payment is not None and payment.status == "expired"
        assert order is not None and order.status == "cancelled"
        assert product is not None and product.stock == 5

    assert (
        client.get(
            f"/api/v1/orders/{order_id}/payments/{payment_body['id']}",
            headers=headers,
        ).json()["status"]
        == "expired"
    )


def test_expiry_stock_capacity_failure_rolls_back_and_returns_conflict(
    client: TestClient,
    engine,
) -> None:
    headers = auth_headers(client, "payment-expiry-capacity-buyer")
    order_id, product_id = create_order(client, headers)
    payment_body = start_payment(client, headers, order_id).json()
    with Session(engine) as session:
        payment = session.get(Payment, payment_body["id"])
        product = session.get(Product, product_id)
        assert payment is not None and product is not None
        payment.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        product.stock = 999999
        session.commit()

    response = client.get(
        f"/api/v1/orders/{order_id}/payments/{payment_body['id']}",
        headers=headers,
    )
    assert response.status_code == 409
    with Session(engine) as session:
        payment = session.get(Payment, payment_body["id"])
        order = session.get(CustomerOrder, order_id)
        product = session.get(Product, product_id)
        assert payment is not None and payment.status == "pending"
        assert order is not None and order.status == "pending_payment"
        assert product is not None and product.stock == 999999


def test_expiry_skips_deleted_products_and_keeps_snapshot(client: TestClient, engine) -> None:
    headers = auth_headers(client, "payment-deleted-product-buyer")
    order_id, product_id = create_order(client, headers)
    payment_body = start_payment(client, headers, order_id).json()
    with Session(engine) as session:
        payment = session.get(Payment, payment_body["id"])
        assert payment is not None
        payment.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        session.commit()
    client.delete(
        f"/api/v1/products/{product_id}",
        headers=auth_headers(client, "payment-admin", ["admin"]),
    )

    with Session(engine) as session:
        assert expire_due_payments(session) == 1
        items = session.scalars(select(OrderItem).where(OrderItem.order_id == order_id)).all()
        assert len(items) == 1
        assert items[0].product_id is None
        assert items[0].product_name


def test_payment_expiry_uses_configured_two_minute_window(client: TestClient) -> None:
    headers = auth_headers(client, "payment-expiry-window-buyer")
    order_id, _ = create_order(client, headers)
    payment = start_payment(client, headers, order_id).json()
    created_at = datetime.fromisoformat(payment["created_at"])
    expires_at = datetime.fromisoformat(payment["expires_at"])
    assert Decimal(str((expires_at - created_at).total_seconds())) == Decimal("120.0")


def test_webhook_rejects_invalid_json_and_oversized_body(client: TestClient) -> None:
    invalid = client.post(
        "/api/v1/payments/webhook",
        content=b"not-json",
        headers={
            "X-Payment-Signature": sign_webhook_body(b"not-json", WEBHOOK_SECRET),
        },
    )
    assert invalid.status_code == 422
    oversized_body = b"x" * 4097
    oversized = client.post(
        "/api/v1/payments/webhook",
        content=oversized_body,
        headers={
            "X-Payment-Signature": sign_webhook_body(oversized_body, WEBHOOK_SECRET),
        },
    )
    assert oversized.status_code == 413


def test_webhook_event_digest_is_persisted_without_raw_payment_data(
    client: TestClient,
    engine,
) -> None:
    headers = auth_headers(client, "payment-digest-buyer")
    order_id, _ = create_order(client, headers)
    payment = start_payment(client, headers, order_id).json()
    response = send_webhook(client, payment, event_id="digest-event", result="succeeded")
    assert response.status_code == 200
    with Session(engine) as session:
        event = session.scalar(select(PaymentWebhookEvent))
        assert event is not None
        assert len(event.payload_sha256) == 64
        assert session.scalar(select(func.count()).select_from(Payment)) == 1
        assert session.scalar(select(func.count()).select_from(CustomerOrder)) == 1
