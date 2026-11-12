from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from shop_api.models import (
    CustomerOrder,
    OrderFulfillment,
    OrderFulfillmentEvent,
    OrderItem,
    Product,
    SellerApplication,
)
from shop_api.order_lifecycle import record_order_status_event

FULFILLMENT_STATUSES = (
    "pending_payment",
    "paid",
    "processing",
    "shipped",
    "delivered",
)
NEXT_FULFILLMENT_STATUS = {
    "paid": "processing",
    "processing": "shipped",
    "shipped": "delivered",
}


def create_order_fulfillments(
    db: Session,
    *,
    order: CustomerOrder,
    products_by_id: dict[int, Product],
    order_items: list[OrderItem],
    now: datetime,
) -> None:
    seller_subjects = {
        product.seller_subject
        for product in products_by_id.values()
        if product.seller_subject is not None
    }
    applications = (
        db.scalars(
            select(SellerApplication).where(
                SellerApplication.owner_subject.in_(seller_subjects),
                SellerApplication.status == "approved",
            )
        ).all()
        if seller_subjects
        else []
    )
    applications_by_subject = {
        application.owner_subject: application for application in applications
    }
    if seller_subjects != applications_by_subject.keys():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Sepetindeki bir satıcının mağazası artık etkin değil.",
        )

    fulfillment_by_seller: dict[str | None, OrderFulfillment] = {}
    for seller_subject in {
        products_by_id[item.product_id].seller_subject
        for item in order_items
        if item.product_id is not None
    }:
        application = applications_by_subject.get(seller_subject) if seller_subject else None
        fulfillment = OrderFulfillment(
            order_id=order.id,
            seller_subject=seller_subject,
            store_name=application.store_name if application else "Liva",
            status="pending_payment",
            created_at=now,
            updated_at=now,
        )
        db.add(fulfillment)
        fulfillment_by_seller[seller_subject] = fulfillment

    db.flush()
    for fulfillment in fulfillment_by_seller.values():
        record_fulfillment_event(
            db,
            fulfillment=fulfillment,
            action="created",
            from_status=None,
            to_status=fulfillment.status,
            actor_subject=order.owner_subject,
            created_at=now,
        )
    for item in order_items:
        if item.product_id is None:
            raise RuntimeError("Order item has no product while creating its fulfillment.")
        seller_subject = products_by_id[item.product_id].seller_subject
        item.fulfillment_id = fulfillment_by_seller[seller_subject].id


def record_fulfillment_event(
    db: Session,
    *,
    fulfillment: OrderFulfillment,
    action: str,
    from_status: str | None,
    to_status: str,
    actor_subject: str | None = None,
    created_at: datetime | None = None,
) -> None:
    db.add(
        OrderFulfillmentEvent(
            fulfillment_id=fulfillment.id,
            actor_subject=actor_subject,
            action=action,
            from_status=from_status,
            to_status=to_status,
            created_at=created_at or datetime.now(UTC),
        )
    )


def set_order_fulfillments_status(
    db: Session,
    *,
    order_id: int,
    target_status: str,
    action: str,
    actor_subject: str | None = None,
    from_status: str | None = None,
    created_at: datetime | None = None,
) -> None:
    now = created_at or datetime.now(UTC)
    statement = (
        select(OrderFulfillment)
        .where(OrderFulfillment.order_id == order_id)
        .order_by(OrderFulfillment.id)
        .with_for_update()
    )
    fulfillments = db.scalars(statement).all()
    for fulfillment in fulfillments:
        if from_status is not None and fulfillment.status != from_status:
            continue
        previous_status = fulfillment.status
        fulfillment.status = target_status
        fulfillment.updated_at = now
        record_fulfillment_event(
            db,
            fulfillment=fulfillment,
            action=action,
            from_status=previous_status,
            to_status=target_status,
            actor_subject=actor_subject,
            created_at=now,
        )


def synchronize_parent_order_status(
    db: Session,
    order: CustomerOrder,
    *,
    actor_subject: str | None = None,
    created_at: datetime | None = None,
) -> None:
    if order.status in {"pending_payment", "cancelled"}:
        return
    fulfillments = db.scalars(
        select(OrderFulfillment)
        .where(OrderFulfillment.order_id == order.id)
        .order_by(OrderFulfillment.id)
    ).all()
    if not fulfillments:
        return
    if any(fulfillment.status == "cancelled" for fulfillment in fulfillments):
        target_status = "cancelled"
    else:
        target_status = min(
            (fulfillment.status for fulfillment in fulfillments),
            key=FULFILLMENT_STATUSES.index,
        )
    if target_status == order.status:
        return

    previous_status = order.status
    order.status = target_status
    record_order_status_event(
        db,
        order_id=order.id,
        action="fulfillment_status_changed",
        from_status=previous_status,
        to_status=target_status,
        actor_subject=actor_subject,
        created_at=created_at or datetime.now(UTC),
    )


def advance_order_fulfillments(
    db: Session,
    *,
    order: CustomerOrder,
    target_status: str,
    actor_subject: str,
    now: datetime,
) -> None:
    fulfillments = db.scalars(
        select(OrderFulfillment)
        .where(
            OrderFulfillment.order_id == order.id,
            OrderFulfillment.status == order.status,
        )
        .order_by(OrderFulfillment.id)
        .with_for_update()
    ).all()
    if not fulfillments:
        raise RuntimeError("Order status has no matching fulfillment group.")
    for fulfillment in fulfillments:
        previous_status = fulfillment.status
        fulfillment.status = target_status
        fulfillment.updated_at = now
        record_fulfillment_event(
            db,
            fulfillment=fulfillment,
            action="admin_status_changed",
            from_status=previous_status,
            to_status=target_status,
            actor_subject=actor_subject,
            created_at=now,
        )
