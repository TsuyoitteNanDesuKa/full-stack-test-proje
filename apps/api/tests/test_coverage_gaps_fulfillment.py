"""Coverage gap tests for order fulfillment status helpers."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_seller_orders import create_paid_multi_seller_order

from shop_api.models import CustomerOrder, OrderFulfillment, OrderFulfillmentEvent, OrderStatusEvent
from shop_api.order_fulfillment import (
    advance_order_fulfillments,
    set_order_fulfillments_status,
    synchronize_parent_order_status,
)


def _fulfillments(db: Session, order_id: int) -> list[OrderFulfillment]:
    return list(
        db.scalars(
            select(OrderFulfillment)
            .where(OrderFulfillment.order_id == order_id)
            .order_by(OrderFulfillment.id)
        ).all()
    )


def test_synchronize_skips_pending_payment_and_cancelled_orders(client, engine) -> None:
    order, _, _ = create_paid_multi_seller_order(client, engine)
    with Session(engine) as db:
        stored = db.get(CustomerOrder, order["id"])
        stored.status = "pending_payment"
        synchronize_parent_order_status(db, stored)
        assert stored.status == "pending_payment"

        stored.status = "cancelled"
        synchronize_parent_order_status(db, stored)
        assert stored.status == "cancelled"


def test_synchronize_returns_early_when_order_has_no_fulfillments(client, engine) -> None:
    order, _, _ = create_paid_multi_seller_order(client, engine)
    with Session(engine) as db:
        stored = db.get(CustomerOrder, order["id"])
        fulfillment_ids = [item.id for item in _fulfillments(db, order["id"])]
        db.query(OrderFulfillmentEvent).filter(
            OrderFulfillmentEvent.fulfillment_id.in_(fulfillment_ids)
        ).delete(synchronize_session=False)
        db.query(OrderFulfillment).filter(OrderFulfillment.id.in_(fulfillment_ids)).delete(
            synchronize_session=False
        )
        db.flush()
        previous = stored.status

        synchronize_parent_order_status(db, stored)

        assert stored.status == previous


def test_synchronize_cancels_parent_when_any_fulfillment_is_cancelled(client, engine) -> None:
    order, _, _ = create_paid_multi_seller_order(client, engine)
    with Session(engine) as db:
        stored = db.get(CustomerOrder, order["id"])
        first, *_ = _fulfillments(db, order["id"])
        first.status = "cancelled"
        db.flush()

        synchronize_parent_order_status(db, stored, actor_subject="sync-test")
        db.flush()

        assert stored.status == "cancelled"
        event = db.scalar(
            select(OrderStatusEvent).where(
                OrderStatusEvent.order_id == order["id"],
                OrderStatusEvent.action == "fulfillment_status_changed",
                OrderStatusEvent.to_status == "cancelled",
            )
        )
        assert event is not None
        assert event.actor_subject == "sync-test"


def test_synchronize_leaves_order_unchanged_when_aggregate_matches(client, engine) -> None:
    order, _, _ = create_paid_multi_seller_order(client, engine)
    with Session(engine) as db:
        stored = db.get(CustomerOrder, order["id"])
        assert stored.status == "paid"
        events_before = len(
            db.scalars(
                select(OrderStatusEvent).where(OrderStatusEvent.order_id == order["id"])
            ).all()
        )

        synchronize_parent_order_status(db, stored)
        db.flush()

        assert stored.status == "paid"
        events_after = len(
            db.scalars(
                select(OrderStatusEvent).where(OrderStatusEvent.order_id == order["id"])
            ).all()
        )
        assert events_after == events_before


def test_advance_rejects_order_without_matching_fulfillment_group(client, engine) -> None:
    order, _, _ = create_paid_multi_seller_order(client, engine)
    with Session(engine) as db:
        stored = db.get(CustomerOrder, order["id"])
        for fulfillment in _fulfillments(db, order["id"]):
            fulfillment.status = "shipped"
        db.flush()

        with pytest.raises(RuntimeError, match="no matching fulfillment group"):
            advance_order_fulfillments(
                db,
                order=stored,
                target_status="processing",
                actor_subject="admin",
                now=stored.created_at,
            )


def test_advance_moves_matching_group_and_records_admin_events(client, engine) -> None:
    order, _, _ = create_paid_multi_seller_order(client, engine)
    with Session(engine) as db:
        stored = db.get(CustomerOrder, order["id"])
        advance_order_fulfillments(
            db,
            order=stored,
            target_status="processing",
            actor_subject="admin-advance",
            now=stored.created_at,
        )
        db.flush()

        fulfillments = _fulfillments(db, order["id"])
        assert {item.status for item in fulfillments} == {"processing"}
        events = db.scalars(
            select(OrderFulfillmentEvent).where(
                OrderFulfillmentEvent.action == "admin_status_changed",
                OrderFulfillmentEvent.actor_subject == "admin-advance",
            )
        ).all()
        assert len(events) == len(fulfillments)


def test_set_status_with_from_status_only_updates_matching_fulfillments(client, engine) -> None:
    order, _, _ = create_paid_multi_seller_order(client, engine)
    with Session(engine) as db:
        first, second = _fulfillments(db, order["id"])
        first.status = "processing"
        db.flush()

        set_order_fulfillments_status(
            db,
            order_id=order["id"],
            target_status="shipped",
            action="seller_status_changed",
            from_status="paid",
        )
        db.flush()

        assert db.get(OrderFulfillment, first.id).status == "processing"
        assert db.get(OrderFulfillment, second.id).status == "shipped"
