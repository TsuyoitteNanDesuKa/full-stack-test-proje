"""Coverage gap tests: expiry of already-settled payments and refund amount ceiling."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from conftest import create_test_token
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_product_returns import create_shipped_order, submit_return

from shop_api.models import CustomerOrder, Payment
from shop_api.payment_expiry import expire_due_payments


def _headers(client: TestClient, subject: str) -> dict[str, str]:
    token = create_test_token(
        client,
        subject=subject,
        email=f"{subject}@example.com",
        roles=["buyer"],
    )
    return {"Authorization": f"Bearer {token}"}


def test_expiry_leaves_order_alone_when_payment_settled_but_order_still_pending(
    client: TestClient, engine
) -> None:
    subject = "expiry-settled-order-pending"
    order_id, _, _ = create_shipped_order(client, engine, subject=subject)
    with Session(engine) as db:
        payment = db.query(Payment).filter(Payment.order_id == order_id).one()
        order = db.get(CustomerOrder, order_id)
        payment.status = "succeeded"
        payment.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        order.status = "pending_payment"
        db.commit()
        payment_id = payment.id

    with Session(engine) as db:
        expired = expire_due_payments(db, payment_id=payment_id)
        db.commit()

    assert expired == 0
    with Session(engine) as db:
        assert db.get(Payment, payment_id).status == "succeeded"
        assert db.get(CustomerOrder, order_id).status == "pending_payment"


def test_refund_is_refused_when_cumulative_amount_would_exceed_payment(
    client: TestClient, engine
) -> None:
    subject = "refund-ceiling-buyer"
    order_id, item_id, _ = create_shipped_order(client, engine, subject=subject, quantity=2)
    with Session(engine) as db:
        payment = db.query(Payment).filter(Payment.order_id == order_id).one()
        payment.amount = Decimal("10.00")
        db.commit()

    response = submit_return(client, order_id, item_id, subject=subject, quantity=2)

    assert response.status_code == 409
    assert response.json()["detail"] == "İade tutarı sipariş ödeme tutarını aşamaz."
