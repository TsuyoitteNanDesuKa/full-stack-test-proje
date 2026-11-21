"""Coverage gap tests: checkout without a cart, repeated buyer cancellation, payment-state guard."""

from datetime import UTC, datetime

from conftest import create_test_token
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_admin_orders import create_order

from shop_api.models import CustomerOrder, Payment


def _buyer(client: TestClient, subject: str) -> dict[str, str]:
    token = create_test_token(
        client,
        subject=subject,
        email=f"{subject}@example.com",
        roles=["buyer"],
    )
    return {"Authorization": f"Bearer {token}"}


def test_checkout_without_any_cart_is_refused(client: TestClient) -> None:
    buyer = _buyer(client, "order-gap-no-cart")
    address = client.post(
        "/api/v1/addresses",
        json={
            "label": "Ev",
            "recipient_name": "Ada Buyer",
            "phone": "+905551234567",
            "city": "Istanbul",
            "district": "Kadikoy",
            "address_line": "Example Street 1",
            "postal_code": None,
            "is_default": True,
        },
        headers=buyer,
    )
    assert address.status_code == 201

    response = client.post(
        "/api/v1/orders",
        json={"address_id": address.json()["id"], "delivery_method": "standard"},
        headers={**buyer, "Idempotency-Key": "order-gap-no-cart-key"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Sipariş oluşturmak için sepetinde ürün olmalıdır."


def test_repeated_buyer_cancellation_returns_the_same_cancelled_order(
    client: TestClient, engine
) -> None:
    subject = "order-gap-repeat-cancel"
    headers = _buyer(client, subject)
    order_id, _, _ = create_order(client, headers, start_payment=False)

    first = client.post(
        f"/api/v1/orders/{order_id}/cancel",
        json={"reason": "Changed my mind"},
        headers=headers,
    )
    assert first.status_code == 200

    second = client.post(
        f"/api/v1/orders/{order_id}/cancel",
        json={"reason": "Changed my mind"},
        headers=headers,
    )

    assert second.status_code == 200
    assert second.json()["status"] == "cancelled"
    with Session(engine) as db:
        assert db.get(CustomerOrder, order_id).status == "cancelled"


def test_buyer_cancel_is_refused_when_pending_order_has_a_non_pending_payment(
    client: TestClient, engine
) -> None:
    subject = "order-gap-failed-payment"
    headers = _buyer(client, subject)
    order_id, _, _ = create_order(client, headers, start_payment=True)
    with Session(engine) as db:
        payment = db.query(Payment).filter(Payment.order_id == order_id).one()
        payment.status = "failed"
        payment.updated_at = datetime.now(UTC)
        order = db.get(CustomerOrder, order_id)
        order.status = "pending_payment"
        db.commit()

    response = client.post(f"/api/v1/orders/{order_id}/cancel", json={}, headers=headers)

    assert response.status_code == 409
    assert response.json()["detail"] == "Ödeme durumu iptale uygun değil."
