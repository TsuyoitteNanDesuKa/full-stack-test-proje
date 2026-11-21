"""Coverage gap tests for mock payment checkout and webhook defensive branches."""

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
    return payment.json()


def test_mock_checkout_completion_rejects_wrong_token_without_changing_payment(
    client: TestClient,
) -> None:
    payment = _pending_payment(client, "branch-wrong-token")

    response = client.post(
        f"/api/v1/payments/mock-checkout/{payment['id']}/not-the-token",
        json={"status": "succeeded"},
    )

    assert response.status_code == 404
    after = client.get(
        f"/api/v1/orders/{payment['order_id']}/payments/{payment['id']}",
        headers=_headers(client, "branch-wrong-token"),
    )
    assert after.json()["status"] == "pending"


def test_mock_checkout_completion_rejects_unknown_payment_id(client: TestClient) -> None:
    response = client.post(
        "/api/v1/payments/mock-checkout/987654/some-token",
        json={"status": "succeeded"},
    )

    assert response.status_code == 404


def test_mock_checkout_page_is_hidden_when_provider_is_not_mock(client: TestClient) -> None:
    payment = _pending_payment(client, "branch-non-mock-provider")
    checkout_url = payment["checkout_url"]

    class NonMockProvider:
        name = "stripe"

    client.app.state.payment_provider = NonMockProvider()

    response = client.get(checkout_url)

    assert response.status_code == 404
    assert response.json()["detail"] == "Ödeme sayfası bulunamadı."


def test_webhook_with_signature_for_different_body_is_rejected(client: TestClient) -> None:
    body = json.dumps({"event_id": "branch-sig-a", "status": "succeeded"}).encode()
    other_body = json.dumps({"event_id": "branch-sig-b", "status": "succeeded"}).encode()

    response = client.post(
        "/api/v1/payments/webhook",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Payment-Signature": sign_webhook_body(other_body, WEBHOOK_SECRET),
        },
    )

    assert response.status_code == 401
