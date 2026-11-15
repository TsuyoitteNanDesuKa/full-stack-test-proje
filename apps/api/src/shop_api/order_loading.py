from collections.abc import Sequence
from dataclasses import dataclass, field
from itertools import batched

from sqlalchemy import select
from sqlalchemy.orm import Session

from shop_api.models import (
    CustomerOrder,
    OrderFulfillment,
    OrderFulfillmentEvent,
    OrderItem,
    OrderStatusEvent,
    Payment,
    ProductReturn,
)

BATCH_SIZE = 500


@dataclass
class FulfillmentData:
    items: list[OrderItem] = field(default_factory=list)
    events: list[OrderFulfillmentEvent] = field(default_factory=list)


@dataclass
class OrderData:
    items: list[OrderItem] = field(default_factory=list)
    returns: list[ProductReturn] = field(default_factory=list)
    fulfillments: list[OrderFulfillment] = field(default_factory=list)
    events: list[OrderStatusEvent] = field(default_factory=list)
    payment: Payment | None = None


def load_fulfillment_data(
    db: Session, fulfillments: Sequence[OrderFulfillment]
) -> dict[int, FulfillmentData]:
    result = {fulfillment.id: FulfillmentData() for fulfillment in fulfillments}
    for ids in batched(result, BATCH_SIZE, strict=False):
        for item in db.scalars(
            select(OrderItem).where(OrderItem.fulfillment_id.in_(ids)).order_by(OrderItem.id)
        ):
            if item.fulfillment_id is not None:
                result[item.fulfillment_id].items.append(item)
        for event in db.scalars(
            select(OrderFulfillmentEvent)
            .where(OrderFulfillmentEvent.fulfillment_id.in_(ids))
            .order_by(OrderFulfillmentEvent.id)
        ):
            result[event.fulfillment_id].events.append(event)
    return result


def load_order_data(
    db: Session, orders: Sequence[CustomerOrder], *, include_payment: bool = False
) -> tuple[dict[int, OrderData], dict[int, FulfillmentData]]:
    result = {order.id: OrderData() for order in orders}
    fulfillments: list[OrderFulfillment] = []
    for ids in batched(result, BATCH_SIZE, strict=False):
        for item in db.scalars(
            select(OrderItem).where(OrderItem.order_id.in_(ids)).order_by(OrderItem.id)
        ):
            result[item.order_id].items.append(item)
        for product_return in db.scalars(
            select(ProductReturn).where(ProductReturn.order_id.in_(ids)).order_by(ProductReturn.id)
        ):
            result[product_return.order_id].returns.append(product_return)
        for fulfillment in db.scalars(
            select(OrderFulfillment)
            .where(OrderFulfillment.order_id.in_(ids))
            .order_by(OrderFulfillment.id)
        ):
            result[fulfillment.order_id].fulfillments.append(fulfillment)
            fulfillments.append(fulfillment)
        for event in db.scalars(
            select(OrderStatusEvent)
            .where(OrderStatusEvent.order_id.in_(ids))
            .order_by(OrderStatusEvent.id)
        ):
            result[event.order_id].events.append(event)
        if include_payment:
            for payment in db.scalars(select(Payment).where(Payment.order_id.in_(ids))):
                result[payment.order_id].payment = payment
    return result, load_fulfillment_data(db, fulfillments)
