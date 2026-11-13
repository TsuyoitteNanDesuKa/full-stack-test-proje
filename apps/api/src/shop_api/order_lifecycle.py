from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from shop_api.models import OrderStatusEvent
from shop_api.schemas import AdminOrderStatusEventResponse, OrderStatusEventResponse

RETURN_ELIGIBILITY_ACTIONS = ("admin_status_changed", "fulfillment_status_changed")


def record_order_status_event(
    db: Session,
    *,
    order_id: int,
    action: str,
    from_status: str | None,
    to_status: str,
    actor_subject: str | None = None,
    reason: str | None = None,
    created_at: datetime | None = None,
) -> None:
    db.add(
        OrderStatusEvent(
            order_id=order_id,
            actor_subject=actor_subject,
            action=action,
            from_status=from_status,
            to_status=to_status,
            reason=reason,
            created_at=created_at or datetime.now(UTC),
        )
    )


def order_status_history(
    db: Session,
    order_id: int,
    *,
    include_actor: bool = False,
) -> list[OrderStatusEventResponse] | list[AdminOrderStatusEventResponse]:
    events = db.scalars(
        select(OrderStatusEvent)
        .where(OrderStatusEvent.order_id == order_id)
        .order_by(OrderStatusEvent.id)
    ).all()
    if include_actor:
        return [
            AdminOrderStatusEventResponse(
                action=event.action,
                from_status=event.from_status,
                to_status=event.to_status,
                reason=event.reason,
                created_at=event.created_at,
                actor_subject=event.actor_subject,
            )
            for event in events
        ]
    return [
        OrderStatusEventResponse(
            action=event.action,
            from_status=event.from_status,
            to_status=event.to_status,
            reason=event.reason,
            created_at=event.created_at,
        )
        for event in events
    ]
