from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from shop_api.database import get_db
from shop_api.dependencies import get_current_user
from shop_api.models import (
    CustomerOrder,
    OrderFulfillment,
    OrderFulfillmentEvent,
    OrderItem,
    SellerApplication,
)
from shop_api.order_fulfillment import (
    NEXT_FULFILLMENT_STATUS,
    record_fulfillment_event,
    synchronize_parent_order_status,
)
from shop_api.schemas import (
    OrderAddressSnapshot,
    OrderItemResponse,
    SellerOrderResponse,
    SellerOrderStatusRequest,
)
from shop_api.security import AuthenticatedUser

router = APIRouter(prefix="/api/v1/seller/orders", tags=["seller orders"])


def _require_approved_seller(user: AuthenticatedUser, db: Session) -> None:
    if "seller" not in user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlem için satıcı yetkisi gereklidir.",
        )
    approved_application = db.scalar(
        select(SellerApplication.id).where(
            SellerApplication.owner_subject == user.subject,
            SellerApplication.status == "approved",
        )
    )
    if approved_application is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Satıcı başvurunuz onaylanmadan sipariş işlemi yapamazsınız.",
        )


def _seller_order_response(
    db: Session,
    fulfillment: OrderFulfillment,
    order: CustomerOrder,
) -> SellerOrderResponse:
    items = db.scalars(
        select(OrderItem).where(OrderItem.fulfillment_id == fulfillment.id).order_by(OrderItem.id)
    ).all()
    events = db.scalars(
        select(OrderFulfillmentEvent)
        .where(OrderFulfillmentEvent.fulfillment_id == fulfillment.id)
        .order_by(OrderFulfillmentEvent.id)
    ).all()
    return SellerOrderResponse(
        id=fulfillment.id,
        order_id=order.id,
        store_name=fulfillment.store_name,
        status=fulfillment.status,
        created_at=fulfillment.created_at,
        updated_at=fulfillment.updated_at,
        shipping_address=(
            OrderAddressSnapshot(
                label=order.shipping_address_label,
                recipient_name=order.shipping_recipient_name,
                phone=order.shipping_phone,
                city=order.shipping_city,
                district=order.shipping_district,
                address_line=order.shipping_address_line,
                postal_code=order.shipping_postal_code,
            )
            if order.shipping_recipient_name is not None
            and order.shipping_address_label is not None
            and order.shipping_phone is not None
            and order.shipping_city is not None
            and order.shipping_district is not None
            and order.shipping_address_line is not None
            else None
        ),
        items=[OrderItemResponse.model_validate(item) for item in items],
        history=[
            {
                "action": event.action,
                "from_status": event.from_status,
                "to_status": event.to_status,
                "created_at": event.created_at,
            }
            for event in events
        ],
    )


@router.get("", response_model=list[SellerOrderResponse])
def list_seller_orders(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[SellerOrderResponse]:
    _require_approved_seller(current_user, db)
    fulfillments = db.scalars(
        select(OrderFulfillment)
        .where(OrderFulfillment.seller_subject == current_user.subject)
        .order_by(OrderFulfillment.created_at.desc(), OrderFulfillment.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    orders_by_id = (
        {
            order.id: order
            for order in db.scalars(
                select(CustomerOrder).where(
                    CustomerOrder.id.in_({fulfillment.order_id for fulfillment in fulfillments})
                )
            ).all()
        }
        if fulfillments
        else {}
    )
    return [
        _seller_order_response(db, fulfillment, orders_by_id[fulfillment.order_id])
        for fulfillment in fulfillments
    ]


@router.get("/{fulfillment_id}", response_model=SellerOrderResponse)
def get_seller_order(
    fulfillment_id: int,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SellerOrderResponse:
    _require_approved_seller(current_user, db)
    fulfillment = db.scalar(
        select(OrderFulfillment).where(
            OrderFulfillment.id == fulfillment_id,
            OrderFulfillment.seller_subject == current_user.subject,
        )
    )
    if fulfillment is None:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı.")
    order = db.get(CustomerOrder, fulfillment.order_id)
    if order is None:
        raise RuntimeError("Order fulfillment references a missing order.")
    return _seller_order_response(db, fulfillment, order)


@router.patch("/{fulfillment_id}/status", response_model=SellerOrderResponse)
def update_seller_order_status(
    fulfillment_id: int,
    payload: SellerOrderStatusRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SellerOrderResponse:
    _require_approved_seller(current_user, db)
    order_id = db.scalar(
        select(OrderFulfillment.order_id).where(
            OrderFulfillment.id == fulfillment_id,
            OrderFulfillment.seller_subject == current_user.subject,
        )
    )
    if order_id is None:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı.")
    order = db.scalar(select(CustomerOrder).where(CustomerOrder.id == order_id).with_for_update())
    if order is None:
        raise RuntimeError("Order fulfillment references a missing order.")
    fulfillment = db.scalar(
        select(OrderFulfillment)
        .where(
            OrderFulfillment.id == fulfillment_id,
            OrderFulfillment.seller_subject == current_user.subject,
        )
        .with_for_update()
    )
    if fulfillment is None:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı.")

    target_status = payload.status
    if fulfillment.status == target_status:
        return _seller_order_response(db, fulfillment, order)
    next_status = NEXT_FULFILLMENT_STATUS.get(fulfillment.status)
    if target_status != next_status:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Sipariş durumu yalnızca izin verilen sıradaki aşamaya ilerletilebilir.",
        )

    now = datetime.now(UTC)
    previous_fulfillment_status = fulfillment.status
    fulfillment.status = target_status.value
    fulfillment.updated_at = now
    record_fulfillment_event(
        db,
        fulfillment=fulfillment,
        action="seller_status_changed",
        from_status=previous_fulfillment_status,
        to_status=target_status.value,
        actor_subject=current_user.subject,
        created_at=now,
    )
    synchronize_parent_order_status(
        db,
        order,
        actor_subject=current_user.subject,
        created_at=now,
    )
    db.commit()
    db.refresh(fulfillment)
    db.refresh(order)
    return _seller_order_response(db, fulfillment, order)
