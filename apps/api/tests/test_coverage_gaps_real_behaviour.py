"""Coverage gap tests: expiry skips settled payments, deleted-product cart edits."""

from datetime import UTC, datetime, timedelta

from conftest import create_checkout_request, create_test_token
from factories import product_payload
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from shop_api.models import CustomerOrder, Payment
from shop_api.payment_expiry import expire_due_payments


def _headers(client: TestClient, subject: str, roles: list[str] | None = None) -> dict[str, str]:
    token = create_test_token(
        client,
        subject=subject,
        email=f"{subject}@example.com",
        roles=roles if roles is not None else ["buyer"],
    )
    return {"Authorization": f"Bearer {token}"}


def _pending_payment(client: TestClient, subject: str) -> tuple[dict, int]:
    buyer = _headers(client, subject)
    admin = _headers(client, f"{subject}-admin", ["admin"])
    product = client.post(
        "/api/v1/products",
        json=product_payload(stock=5, price="12.50"),
        headers=admin,
    ).json()
    cart_item = client.post(
        "/api/v1/cart/items",
        json={"product_id": product["id"], "quantity": 1},
        headers=buyer,
    ).json()
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
    return {**payment.json(), "order_id": order["id"]}, cart_item["items"][0]["id"]


def test_expiry_skips_payment_that_already_settled_before_the_scan(
    client: TestClient, engine
) -> None:
    payment, _ = _pending_payment(client, "expiry-settled")
    with Session(engine) as db:
        stored = db.get(Payment, payment["id"])
        stored.status = "succeeded"
        stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()

    with Session(engine) as db:
        expired = expire_due_payments(db, payment_id=payment["id"])
        db.commit()

    assert expired == 0
    with Session(engine) as db:
        assert db.get(Payment, payment["id"]).status == "succeeded"
        assert db.get(CustomerOrder, payment["order_id"]).status == "pending_payment"


def test_cart_quantity_update_on_deleted_product_is_refused(client: TestClient) -> None:
    buyer = _headers(client, "cart-deleted-product")
    admin = _headers(client, "cart-deleted-product-admin", ["admin"])
    product = client.post(
        "/api/v1/products",
        json=product_payload(stock=5, price="12.50"),
        headers=admin,
    ).json()
    cart_item_id = client.post(
        "/api/v1/cart/items",
        json={"product_id": product["id"], "quantity": 1},
        headers=buyer,
    ).json()["items"][0]["id"]
    assert client.delete(f"/api/v1/products/{product['id']}", headers=admin).status_code == 204

    response = client.put(
        f"/api/v1/cart/items/{cart_item_id}",
        json={"quantity": 2},
        headers=buyer,
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Silinmiş ürün sepetten yalnızca kaldırılabilir."
