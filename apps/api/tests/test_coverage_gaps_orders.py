"""Coverage gap tests for buyer order cancellation and product return edge branches."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_admin_orders import auth_headers, create_order

from shop_api.models import CustomerOrder, Payment


def test_cancel_rejects_pending_order_whose_payment_already_succeeded(
    client: TestClient, engine
) -> None:
    headers = auth_headers(client, "gap-cancel-pending-paid")
    order_id, _, _ = create_order(client, headers, start_payment=False)
    with Session(engine) as db:
        payment = Payment(
            order_id=order_id,
            owner_subject="gap-cancel-pending-paid",
            provider="mock",
            provider_reference="gap-pending-paid-ref",
            idempotency_key="gap-pending-paid-key",
            status="succeeded",
            amount=db.get(CustomerOrder, order_id).total_amount,
            currency="TRY",
            expires_at=db.get(CustomerOrder, order_id).created_at,
            created_at=db.get(CustomerOrder, order_id).created_at,
            updated_at=db.get(CustomerOrder, order_id).created_at,
        )
        db.add(payment)
        db.commit()

    response = client.post(f"/api/v1/orders/{order_id}/cancel", json={}, headers=headers)

    assert response.status_code == 409
    assert response.json()["detail"] == "Ödeme durumu iptale uygun değil."
    with Session(engine) as db:
        assert db.get(CustomerOrder, order_id).status == "pending_payment"


def test_cancel_rejects_paid_order_without_successful_payment(client: TestClient, engine) -> None:
    headers = auth_headers(client, "gap-cancel-paid-no-payment")
    order_id, _, _ = create_order(client, headers, start_payment=False)
    with Session(engine) as db:
        order = db.get(CustomerOrder, order_id)
        order.status = "paid"
        db.commit()

    response = client.post(f"/api/v1/orders/{order_id}/cancel", json={}, headers=headers)

    assert response.status_code == 409
    assert response.json()["detail"] == "Ödeme durumu iptale uygun değil."


def test_cancel_rejects_order_already_cancelled_by_admin(client: TestClient, engine) -> None:
    headers = auth_headers(client, "gap-cancel-admin-first")
    order_id, _, _ = create_order(client, headers, start_payment=True)
    admin = auth_headers(client, "gap-cancel-admin", ["admin"])
    assert (
        client.post(
            f"/api/v1/admin/orders/{order_id}/refund",
            headers=admin,
            json={"reason": "Admin first"},
        ).status_code
        == 200
    )

    response = client.post(f"/api/v1/orders/{order_id}/cancel", json={}, headers=headers)

    assert response.status_code == 409


def test_cancel_rejects_order_in_non_cancellable_state(client: TestClient, engine) -> None:
    headers = auth_headers(client, "gap-cancel-delivered-state")
    order_id, _, _ = create_order(client, headers, start_payment=True)
    with Session(engine) as db:
        order = db.get(CustomerOrder, order_id)
        order.status = "delivered"
        db.commit()

    response = client.post(f"/api/v1/orders/{order_id}/cancel", json={}, headers=headers)

    assert response.status_code == 409
    assert response.json()["detail"] == "Sipariş bu aşamada iptal edilemez."
