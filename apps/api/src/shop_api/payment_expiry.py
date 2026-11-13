import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from shop_api.models import CustomerOrder, OrderItem, Payment, Product
from shop_api.order_fulfillment import set_order_fulfillments_status
from shop_api.order_lifecycle import record_order_status_event

logger = logging.getLogger(__name__)


class StockRestorationError(Exception):
    pass


def restore_order_stock(db: Session, order_id: int) -> None:
    items = db.scalars(
        select(OrderItem)
        .where(OrderItem.order_id == order_id)
        .order_by(OrderItem.product_id)
        .with_for_update()
    ).all()
    product_ids = sorted({item.product_id for item in items if item.product_id is not None})
    products = db.scalars(
        select(Product).where(Product.id.in_(product_ids)).order_by(Product.id).with_for_update()
    ).all()
    products_by_id = {product.id: product for product in products}

    quantities_by_product: dict[int, int] = {}
    for item in items:
        if item.product_id is not None and item.product_id in products_by_id:
            quantities_by_product[item.product_id] = (
                quantities_by_product.get(item.product_id, 0) + item.quantity
            )

    for product_id, quantity in quantities_by_product.items():
        if products_by_id[product_id].stock + quantity > 999999:
            raise StockRestorationError("Returning this order would exceed the stock limit.")

    for product_id, quantity in quantities_by_product.items():
        products_by_id[product_id].stock += quantity


def expire_due_payments(
    db: Session, now: datetime | None = None, *, payment_id: int | None = None
) -> int:
    expiration_time = now or datetime.now(UTC)
    statement = (
        select(Payment)
        .where(
            Payment.status == "pending",
            Payment.expires_at <= expiration_time,
        )
        .order_by(Payment.id)
    )
    if payment_id is not None:
        statement = statement.where(Payment.id == payment_id)
    payments = db.scalars(statement.with_for_update(skip_locked=payment_id is None)).all()
    expired_count = 0
    for payment in payments:
        current_payment_id = payment.id
        try:
            with db.begin_nested():
                order = db.scalar(
                    select(CustomerOrder)
                    .where(CustomerOrder.id == payment.order_id)
                    .with_for_update()
                )
                if order is None or payment.status != "pending":
                    continue
                payment.status = "expired"
                payment.updated_at = expiration_time
                if order.status == "pending_payment":
                    previous_status = order.status
                    order.status = "cancelled"
                    restore_order_stock(db, order.id)
                    set_order_fulfillments_status(
                        db,
                        order_id=order.id,
                        target_status="cancelled",
                        action="payment_expired",
                        created_at=expiration_time,
                    )
                    record_order_status_event(
                        db,
                        order_id=order.id,
                        action="payment_expired",
                        from_status=previous_status,
                        to_status=order.status,
                        created_at=expiration_time,
                    )
            expired_count += 1
        except StockRestorationError:
            if payment_id is not None:
                raise
            logger.warning("Payment %s expiry failed: stock limit exceeded.", current_payment_id)

    if expired_count:
        db.commit()
    return expired_count


def _expire_in_session(session_factory: Callable[[], Session]) -> None:
    with session_factory() as db:
        expire_due_payments(db)


async def payment_expiry_worker(
    session_factory: Callable[[], Session],
    interval_seconds: int = 5,
) -> None:
    while True:
        try:
            await asyncio.to_thread(_expire_in_session, session_factory)
        except Exception:
            logger.exception("Payment expiry sweep failed.")
        await asyncio.sleep(interval_seconds)
