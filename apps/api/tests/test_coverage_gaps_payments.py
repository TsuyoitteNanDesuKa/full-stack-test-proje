"""Coverage gap tests for payment routes: mock checkout page, webhook edge cases."""

import json

from conftest import create_checkout_request, create_test_token
from factories import product_payload
from fastapi.testclient import TestClient

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


def _create_pending_payment(client: TestClient, subject: str) -> tuple[dict, dict]:
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
    return order, payment.json()


def _webhook(client: TestClient, body: bytes, signature: str | None = None):
    return client.post(
        "/api/v1/payments/webhook",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Payment-Signature": signature or sign_webhook_body(body, WEBHOOK_SECRET),
        },
    )


def test_payment_start_rejects_malformed_idempotency_key(client: TestClient) -> None:
    buyer = _headers(client, "gap-bad-key-buyer")
    order, _ = _create_pending_payment(client, "gap-bad-key")

    response = client.post(
        f"/api/v1/orders/{order['id']}/payments",
        headers={**buyer, "Idempotency-Key": "bad key with spaces!"},
    )

    assert response.status_code == 422


def test_mock_checkout_page_rejects_invalid_token(client: TestClient) -> None:
    _, payment = _create_pending_payment(client, "gap-token")

    response = client.get(f"/api/v1/payments/mock-checkout/{payment['id']}/wrong-token")

    assert response.status_code == 404


def test_mock_checkout_page_rejects_unknown_payment(client: TestClient) -> None:
    response = client.get("/api/v1/payments/mock-checkout/999999/any-token")

    assert response.status_code == 404


def test_mock_checkout_page_renders_pending_session(client: TestClient) -> None:
    _, payment = _create_pending_payment(client, "gap-page")
    checkout_url = payment["checkout_url"]

    response = client.get(checkout_url)

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Test ödeme sayfası" in response.text
    assert f"{payment['amount']} {payment['currency']}" in response.text


def test_mock_checkout_page_reports_inactive_session_after_completion(
    client: TestClient,
) -> None:
    _, payment = _create_pending_payment(client, "gap-done")
    checkout_url = payment["checkout_url"]
    completed = client.post(checkout_url, json={"status": "succeeded"})
    assert completed.status_code == 200

    response = client.get(checkout_url)

    assert response.status_code == 200
    assert "Bu ödeme oturumu artık etkin değil" in response.text


def test_mock_checkout_completion_rejects_invalid_token(client: TestClient) -> None:
    _, payment = _create_pending_payment(client, "gap-post-token")
    bad_url = f"/api/v1/payments/mock-checkout/{payment['id']}/wrong-token"

    response = client.post(bad_url, json={"status": "succeeded"})

    assert response.status_code == 404


def test_mock_checkout_completion_rejects_unknown_payment(client: TestClient) -> None:
    response = client.post(
        "/api/v1/payments/mock-checkout/999999/any-token",
        json={"status": "succeeded"},
    )

    assert response.status_code == 404


def test_webhook_rejects_invalid_signature(client: TestClient) -> None:
    body = json.dumps({"event_id": "gap-sig", "status": "succeeded"}).encode()

    response = _webhook(client, body, signature="invalid-signature")

    assert response.status_code == 401
    assert response.json()["detail"] == "Webhook imzası geçersiz."


def test_webhook_rejects_oversized_body(client: TestClient) -> None:
    body = b"{" + b" " * 4096 + b"}"

    response = _webhook(client, body)

    assert response.status_code == 413


def test_webhook_rejects_schema_invalid_body(client: TestClient) -> None:
    body = json.dumps({"event_id": "gap-invalid-schema"}).encode()

    response = _webhook(client, body)

    assert response.status_code == 422
    assert response.json()["detail"] == "Webhook gövdesi geçersiz."


def test_webhook_for_unknown_payment_reference_returns_404(client: TestClient) -> None:
    body = json.dumps(
        {
            "event_id": "gap-unknown-ref",
            "payment_reference": "mock-does-not-exist",
            "status": "succeeded",
            "amount": "12.50",
            "currency": "TRY",
        },
        separators=(",", ":"),
    ).encode()

    response = _webhook(client, body)

    assert response.status_code == 404


def test_webhook_amount_mismatch_is_rejected(client: TestClient) -> None:
    _, payment = _create_pending_payment(client, "gap-amount")
    body = json.dumps(
        {
            "event_id": "gap-amount-event",
            "payment_reference": payment["provider_reference"],
            "status": "succeeded",
            "amount": "999.99",
            "currency": payment["currency"],
        },
        separators=(",", ":"),
    ).encode()

    response = _webhook(client, body)

    assert response.status_code == 409
    assert response.json()["detail"] == "Ödeme tutarı veya para birimi eşleşmiyor."


def test_webhook_currency_mismatch_is_rejected(client: TestClient) -> None:
    _, payment = _create_pending_payment(client, "gap-currency")
    body = json.dumps(
        {
            "event_id": "gap-currency-event",
            "payment_reference": payment["provider_reference"],
            "status": "succeeded",
            "amount": payment["amount"],
            "currency": "USD",
        },
        separators=(",", ":"),
    ).encode()

    response = _webhook(client, body)

    assert response.status_code == 409
