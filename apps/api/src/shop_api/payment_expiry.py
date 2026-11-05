import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from shop_api.models import CustomerOrder, OrderItem, Payment, Product

logger = logging.getLogger(__name__)


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

    for item in items:
        if item.product_id is not None and item.product_id in products_by_id:
            products_by_id[item.product_id].stock += item.quantity


def expire_due_payments(db: Session, now: datetime | None = None) -> int:
    expiration_time = now or datetime.now(UTC)
    payments = db.scalars(
        select(Payment)
        .where(
            Payment.status == "pending",
            Payment.expires_at <= expiration_time,
        )
        .order_by(Payment.id)
        .with_for_update(skip_locked=True)
    ).all()
    expired_count = 0
    for payment in payments:
        order = db.scalar(
            select(CustomerOrder).where(CustomerOrder.id == payment.order_id).with_for_update()
        )
        if order is None or payment.status != "pending":
            continue
        payment.status = "expired"
        payment.updated_at = expiration_time
        if order.status == "pending_payment":
            order.status = "cancelled"
            restore_order_stock(db, order.id)
        expired_count += 1

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
