"""Coverage gap tests for order route behaviour: admin lookups, buyer cancel edge states."""

from conftest import create_test_token
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_admin_orders import auth_headers as admin_auth_headers
from test_admin_orders import create_order

from shop_api.models import CustomerOrder


def _buyer(client: TestClient, subject: str) -> dict[str, str]:
    token = create_test_token(
        client,
        subject=subject,
        email=f"{subject}@example.com",
        roles=["buyer"],
    )
    return {"Authorization": f"Bearer {token}"}


def test_admin_order_detail_returns_404_for_unknown_order(client: TestClient) -> None:
    admin = admin_auth_headers(client, "route-gap-admin", ["admin"])

    response = client.get("/api/v1/admin/orders/987654", headers=admin)

    assert response.status_code == 404
    assert response.json()["detail"] == "Sipariş bulunamadı."


def test_admin_status_update_returns_404_for_unknown_order(client: TestClient) -> None:
    admin = admin_auth_headers(client, "route-gap-admin-patch", ["admin"])

    response = client.patch(
        "/api/v1/admin/orders/987654/status",
        json={"status": "processing"},
        headers=admin,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Sipariş bulunamadı."


def test_buyer_cannot_cancel_an_order_already_cancelled_by_admin(
    client: TestClient, engine
) -> None:
    subject = "route-gap-cancel-admin-first"
    headers = _buyer(client, subject)
    order_id, _, _ = create_order(client, headers, start_payment=False)
    with Session(engine) as db:
        order = db.get(CustomerOrder, order_id)
        order.status = "cancelled"
        db.commit()

    response = client.post(f"/api/v1/orders/{order_id}/cancel", json={}, headers=headers)

    assert response.status_code == 409
    assert response.json()["detail"] == "Sipariş zaten iptal edilmiş."


def test_buyer_cancel_of_paid_order_without_payment_record_is_refused(
    client: TestClient, engine
) -> None:
    subject = "route-gap-paid-no-payment"
    headers = _buyer(client, subject)
    order_id, _, _ = create_order(client, headers, start_payment=False)
    with Session(engine) as db:
        order = db.get(CustomerOrder, order_id)
        order.status = "paid"
        db.commit()

    response = client.post(f"/api/v1/orders/{order_id}/cancel", json={}, headers=headers)

    assert response.status_code == 409
    assert response.json()["detail"] == "Ödeme durumu iptale uygun değil."
