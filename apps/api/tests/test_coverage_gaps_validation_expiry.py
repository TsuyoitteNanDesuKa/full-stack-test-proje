"""Coverage gap tests: refund reason trimming, Turkish phone normalization, expiry for non-pending orders."""

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from shop_api.models import CustomerOrder, Payment
from shop_api.payment_expiry import expire_due_payments
from shop_api.schemas import AdminOrderRefundRequest, AddressRequest


def test_refund_reason_is_trimmed_before_length_check() -> None:
    with pytest.raises(ValidationError):
        AdminOrderRefundRequest(reason="     ab")


def test_refund_reason_is_stripped_when_long_enough() -> None:
    request = AdminOrderRefundRequest(reason="   Musteri talebi   ")

    assert request.reason == "Musteri talebi"


@pytest.mark.parametrize(
    "phone",
    ["+90 555 123 45 67", "00905551234567", "05551234567", "5551234567"],
)
def test_turkish_phone_formats_are_normalized(phone: str) -> None:
    request = _address(phone=phone)

    assert request.phone == "+905551234567"


def test_postal_code_blank_string_is_normalized_to_none() -> None:
    request = _address(postal_code="   ")

    assert request.postal_code is None


def _address(**overrides) -> AddressRequest:
    data = {
        "label": "Ev",
        "recipient_name": "Ada Buyer",
        "phone": "05551234567",
        "city": "Istanbul",
        "district": "Kadikoy",
        "address_line": "Example Street 1",
        "postal_code": None,
        "is_default": False,
    }
    data.update(overrides)
    return AddressRequest(**data)


def test_expiry_marks_payment_expired_without_touching_a_paid_order(
    client, engine
) -> None:
    from test_admin_orders import auth_headers, create_order

    headers = auth_headers(client, "expiry-paid-order-gap")
    order_id, _, _ = create_order(client, headers, start_payment=True)
    from sqlalchemy.orm import Session

    with Session(engine) as db:
        payment = db.query(Payment).filter(Payment.order_id == order_id).one()
        payment.status = "pending"
        payment.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        order = db.get(CustomerOrder, order_id)
        order.status = "paid"
        db.commit()
        payment_id = payment.id

    with Session(engine) as db:
        expired = expire_due_payments(db, payment_id=payment_id)
        db.commit()

    assert expired == 1
    with Session(engine) as db:
        assert db.get(Payment, payment_id).status == "expired"
        assert db.get(CustomerOrder, order_id).status == "paid"
