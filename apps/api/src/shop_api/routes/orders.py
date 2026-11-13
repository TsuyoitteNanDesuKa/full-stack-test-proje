import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shop_api.database import get_db
from shop_api.dependencies import get_admin_user, get_current_user
from shop_api.models import (
    Cart,
    CartItem,
    CustomerAddress,
    CustomerOrder,
    OrderFulfillment,
    OrderFulfillmentEvent,
    OrderItem,
    OrderStatusEvent,
    Payment,
    Product,
    ProductReturn,
)
from shop_api.order_fulfillment import (
    advance_order_fulfillments,
    create_order_fulfillments,
    set_order_fulfillments_status,
)
from shop_api.order_lifecycle import (
    RETURN_ELIGIBILITY_ACTIONS,
    order_status_history,
    record_order_status_event,
)
from shop_api.payment_expiry import StockRestorationError, restore_order_stock
from shop_api.schemas import (
    AdminOrderFulfillmentResponse,
    AdminOrderRefundRequest,
    AdminOrderResponse,
    AdminOrderStatusRequest,
    DeliveryMethod,
    OrderAddressSnapshot,
    OrderCancellationRequest,
    OrderCreateRequest,
    OrderFulfillmentResponse,
    OrderItemResponse,
    OrderResponse,
    OrderStatus,
    PaymentStatus,
    ProductReturnRequest,
    ProductReturnResponse,
)
from shop_api.security import AuthenticatedUser

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])
admin_router = APIRouter(prefix="/api/v1/admin/orders", tags=["admin orders"])
IDEMPOTENCY_KEY_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
STANDARD_DELIVERY_FEE = Decimal("49.90")
EXPRESS_DELIVERY_FEE = Decimal("89.90")
FREE_STANDARD_DELIVERY_THRESHOLD = Decimal("1000.00")


def _require_buyer(user: AuthenticatedUser) -> None:
    if "buyer" not in user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sipariş için alıcı hesabı gereklidir.",
        )


def _order_response(
    db: Session,
    order: CustomerOrder,
    *,
    admin: bool = False,
) -> OrderResponse | AdminOrderResponse:
    items = db.scalars(
        select(OrderItem).where(OrderItem.order_id == order.id).order_by(OrderItem.id)
    ).all()
    returns = db.scalars(
        select(ProductReturn).where(ProductReturn.order_id == order.id).order_by(ProductReturn.id)
    ).all()
    fulfillments = db.scalars(
        select(OrderFulfillment)
        .where(OrderFulfillment.order_id == order.id)
        .order_by(OrderFulfillment.id)
    ).all()
    fulfillment_ids = [fulfillment.id for fulfillment in fulfillments]
    fulfillment_items = (
        db.scalars(
            select(OrderItem)
            .where(OrderItem.fulfillment_id.in_(fulfillment_ids))
            .order_by(OrderItem.id)
        ).all()
        if fulfillment_ids
        else []
    )
    fulfillment_events = (
        db.scalars(
            select(OrderFulfillmentEvent)
            .where(OrderFulfillmentEvent.fulfillment_id.in_(fulfillment_ids))
            .order_by(OrderFulfillmentEvent.id)
        ).all()
        if fulfillment_ids
        else []
    )
    items_by_fulfillment: dict[int, list[OrderItem]] = {}
    for item in fulfillment_items:
        if item.fulfillment_id is not None:
            items_by_fulfillment.setdefault(item.fulfillment_id, []).append(item)
    events_by_fulfillment: dict[int, list[OrderFulfillmentEvent]] = {}
    for event in fulfillment_events:
        events_by_fulfillment.setdefault(event.fulfillment_id, []).append(event)
    fulfillment_responses = []
    for fulfillment in fulfillments:
        fulfillment_data = {
            "id": fulfillment.id,
            "store_name": fulfillment.store_name,
            "status": fulfillment.status,
            "items": [
                OrderItemResponse.model_validate(item)
                for item in items_by_fulfillment.get(fulfillment.id, [])
            ],
            "history": [
                {
                    "action": event.action,
                    "from_status": event.from_status,
                    "to_status": event.to_status,
                    "created_at": event.created_at,
                    **({"actor_subject": event.actor_subject} if admin else {}),
                }
                for event in events_by_fulfillment.get(fulfillment.id, [])
            ],
        }
        fulfillment_responses.append(
            AdminOrderFulfillmentResponse(**fulfillment_data)
            if admin
            else OrderFulfillmentResponse(**fulfillment_data)
        )
    items_by_id = {item.id: item for item in items}
    response_data = {
        "id": order.id,
        "status": order.status,
        "item_subtotal": sum((item.line_total for item in items), Decimal("0.00")),
        "total_amount": order.total_amount,
        "shipping_address": (
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
        "delivery_method": order.delivery_method,
        "delivery_fee": order.delivery_fee or Decimal("0.00"),
        "created_at": order.created_at,
        "items": [
            OrderItemResponse(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product_name,
                unit_price=item.unit_price,
                quantity=item.quantity,
                line_total=item.line_total,
            )
            for item in items
        ],
        "fulfillments": fulfillment_responses,
        "returns": [
            ProductReturnResponse(
                id=product_return.id,
                order_item_id=product_return.order_item_id,
                product_name=items_by_id[product_return.order_item_id].product_name,
                quantity=product_return.quantity,
                reason=product_return.reason,
                status=product_return.status,
                refund_amount=product_return.refund_amount,
                created_at=product_return.created_at,
            )
            for product_return in returns
        ],
        "history": order_status_history(db, order.id, include_actor=admin),
    }
    if admin:
        payment = db.scalar(select(Payment).where(Payment.order_id == order.id))
        return AdminOrderResponse(
            **response_data,
            owner_subject=order.owner_subject,
            payment_status=payment.status if payment is not None else None,
        )
    return OrderResponse(**response_data)


def _get_order(db: Session, order_id: int, *, for_update: bool = False) -> CustomerOrder:
    statement = select(CustomerOrder).where(CustomerOrder.id == order_id)
    if for_update:
        statement = statement.with_for_update()
    order = db.scalar(statement)
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sipariş bulunamadı.",
        )
    return order


def _get_order_for_update(db: Session, order_id: int) -> CustomerOrder:
    return _get_order(db, order_id, for_update=True)


def _admin_order_response(db: Session, order: CustomerOrder) -> AdminOrderResponse:
    response = _order_response(db, order, admin=True)
    if not isinstance(response, AdminOrderResponse):
        raise RuntimeError("Admin order serialization failed.")
    return response


def _product_return_response(
    db: Session,
    product_return: ProductReturn,
) -> ProductReturnResponse:
    order_item = db.get(OrderItem, product_return.order_item_id)
    if order_item is None:
        raise RuntimeError("Product return references a missing order item.")
    return ProductReturnResponse(
        id=product_return.id,
        order_item_id=product_return.order_item_id,
        product_name=order_item.product_name,
        quantity=product_return.quantity,
        reason=product_return.reason,
        status=product_return.status,
        refund_amount=product_return.refund_amount,
        created_at=product_return.created_at,
    )


def _get_owned_order(db: Session, owner_subject: str, order_id: int) -> CustomerOrder:
    order = db.scalar(
        select(CustomerOrder).where(
            CustomerOrder.id == order_id,
            CustomerOrder.owner_subject == owner_subject,
        )
    )
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sipariş bulunamadı.",
        )
    return order


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreateRequest,
    response: Response,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)],
) -> OrderResponse:
    _require_buyer(current_user)
    if not IDEMPOTENCY_KEY_PATTERN.fullmatch(idempotency_key):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Idempotency-Key geçersiz biçimde.",
        )

    existing_order = db.scalar(
        select(CustomerOrder).where(
            CustomerOrder.owner_subject == current_user.subject,
            CustomerOrder.idempotency_key == idempotency_key,
        )
    )
    if existing_order is not None:
        response.status_code = status.HTTP_200_OK
        return _order_response(db, existing_order)

    address = db.scalar(
        select(CustomerAddress)
        .where(
            CustomerAddress.id == payload.address_id,
            CustomerAddress.owner_subject == current_user.subject,
        )
        .with_for_update()
    )
    if address is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Teslimat adresi bulunamadı.",
        )

    cart = db.scalar(
        select(Cart).where(Cart.owner_subject == current_user.subject).with_for_update()
    )
    if cart is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Sipariş oluşturmak için sepetinde ürün olmalıdır.",
        )

    existing_order = db.scalar(
        select(CustomerOrder).where(
            CustomerOrder.owner_subject == current_user.subject,
            CustomerOrder.idempotency_key == idempotency_key,
        )
    )
    if existing_order is not None:
        response.status_code = status.HTTP_200_OK
        return _order_response(db, existing_order)

    cart_items = db.scalars(
        select(CartItem).where(CartItem.cart_id == cart.id).order_by(CartItem.id).with_for_update()
    ).all()
    if not cart_items:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Sipariş oluşturmak için sepetinde ürün olmalıdır.",
        )
    if any(item.product_id is None for item in cart_items):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Sepetinde artık mevcut olmayan ürün var. Devam etmeden önce kaldır.",
        )

    product_ids = sorted(item.product_id for item in cart_items if item.product_id is not None)
    products = db.scalars(
        select(Product).where(Product.id.in_(product_ids)).order_by(Product.id).with_for_update()
    ).all()
    products_by_id = {product.id: product for product in products}

    for item in cart_items:
        product = products_by_id.get(item.product_id)
        if product is None or item.quantity > product.stock:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Sepetindeki ürünlerden biri artık mevcut değil veya yeterli stokta değil.",
            )

    now = datetime.now(UTC)
    order_items: list[OrderItem] = []
    item_subtotal = Decimal("0.00")
    for item in cart_items:
        product = products_by_id[item.product_id]
        line_total = product.price * item.quantity
        item_subtotal += line_total
        order_items.append(
            OrderItem(
                product_id=product.id,
                product_name=product.name,
                unit_price=product.price,
                quantity=item.quantity,
                line_total=line_total,
            )
        )
        product.stock -= item.quantity

    delivery_fee = (
        Decimal("0.00")
        if payload.delivery_method == DeliveryMethod.STANDARD
        and item_subtotal >= FREE_STANDARD_DELIVERY_THRESHOLD
        else (
            STANDARD_DELIVERY_FEE
            if payload.delivery_method == DeliveryMethod.STANDARD
            else EXPRESS_DELIVERY_FEE
        )
    )
    order = CustomerOrder(
        owner_subject=current_user.subject,
        idempotency_key=idempotency_key,
        status="pending_payment",
        total_amount=item_subtotal + delivery_fee,
        created_at=now,
        shipping_address_label=address.label,
        shipping_recipient_name=address.recipient_name,
        shipping_phone=address.phone,
        shipping_city=address.city,
        shipping_district=address.district,
        shipping_address_line=address.address_line,
        shipping_postal_code=address.postal_code,
        delivery_method=payload.delivery_method,
        delivery_fee=delivery_fee,
    )
    db.add(order)
    db.flush()
    create_order_fulfillments(
        db,
        order=order,
        products_by_id=products_by_id,
        order_items=order_items,
        now=now,
    )
    record_order_status_event(
        db,
        order_id=order.id,
        action="created",
        from_status=None,
        to_status=order.status,
        actor_subject=current_user.subject,
        created_at=now,
    )
    for item in order_items:
        item.order_id = order.id
        db.add(item)
    for item in cart_items:
        db.delete(item)
    cart.updated_at = now
    db.commit()
    db.refresh(order)

    return _order_response(db, order)


@router.get("", response_model=list[OrderResponse])
def list_my_orders(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[OrderResponse]:
    _require_buyer(current_user)
    orders = db.scalars(
        select(CustomerOrder)
        .where(CustomerOrder.owner_subject == current_user.subject)
        .order_by(CustomerOrder.created_at.desc(), CustomerOrder.id.desc())
    ).all()
    return [_order_response(db, order) for order in orders]


@router.get("/{order_id}", response_model=OrderResponse)
def get_my_order(
    order_id: int,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> OrderResponse:
    _require_buyer(current_user)
    return _order_response(db, _get_owned_order(db, current_user.subject, order_id))


@router.post("/{order_id}/cancel", response_model=OrderResponse)
def cancel_my_order(
    order_id: int,
    payload: OrderCancellationRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> OrderResponse:
    _require_buyer(current_user)
    _get_owned_order(db, current_user.subject, order_id)

    # Payment callbacks lock payment before order; retry if payment was created in between.
    while True:
        payment = db.scalar(select(Payment).where(Payment.order_id == order_id).with_for_update())
        order = db.scalar(
            select(CustomerOrder)
            .where(
                CustomerOrder.id == order_id, CustomerOrder.owner_subject == current_user.subject
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if order is None:
            raise HTTPException(status_code=404, detail="Sipariş bulunamadı.")
        if (
            payment is not None
            or db.scalar(select(Payment.id).where(Payment.order_id == order_id)) is None
        ):
            break
        db.rollback()

    if order.status == OrderStatus.CANCELLED:
        cancelled_by_buyer = db.scalar(
            select(OrderStatusEvent.id).where(
                OrderStatusEvent.order_id == order.id,
                OrderStatusEvent.action == "buyer_cancelled",
            )
        )
        if cancelled_by_buyer is not None:
            return _order_response(db, order)
        raise HTTPException(status_code=409, detail="Sipariş zaten iptal edilmiş.")

    if order.status not in {OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, OrderStatus.PROCESSING}:
        raise HTTPException(status_code=409, detail="Sipariş bu aşamada iptal edilemez.")
    if order.status == OrderStatus.PENDING_PAYMENT:
        if payment is not None and payment.status != PaymentStatus.PENDING:
            raise HTTPException(status_code=409, detail="Ödeme durumu iptale uygun değil.")
    elif payment is None or payment.status != PaymentStatus.SUCCEEDED:
        raise HTTPException(status_code=409, detail="Ödeme durumu iptale uygun değil.")

    advanced = db.scalar(
        select(OrderFulfillment.id)
        .where(
            OrderFulfillment.order_id == order.id,
            OrderFulfillment.status.in_({OrderStatus.SHIPPED.value, OrderStatus.DELIVERED.value}),
        )
        .limit(1)
    )
    if advanced is not None:
        raise HTTPException(
            status_code=409, detail="Kargoya verilen paket nedeniyle sipariş iptal edilemez."
        )

    now = datetime.now(UTC)
    previous_status = order.status
    order.status = OrderStatus.CANCELLED
    if payment is not None:
        payment.status = (
            PaymentStatus.CANCELLED
            if previous_status == OrderStatus.PENDING_PAYMENT
            else PaymentStatus.REFUNDED
        )
        payment.updated_at = now
    try:
        restore_order_stock(db, order.id)
    except StockRestorationError as error:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Stok sınırı nedeniyle sipariş iptal edilemedi."
        ) from error
    set_order_fulfillments_status(
        db,
        order_id=order.id,
        target_status=OrderStatus.CANCELLED.value,
        action="buyer_cancelled",
        actor_subject=current_user.subject,
        created_at=now,
    )
    record_order_status_event(
        db,
        order_id=order.id,
        action="buyer_cancelled",
        from_status=previous_status,
        to_status=order.status,
        actor_subject=current_user.subject,
        reason=payload.reason,
        created_at=now,
    )
    db.commit()
    db.refresh(order)
    return _order_response(db, order)


@router.post(
    "/{order_id}/returns",
    response_model=ProductReturnResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_product_return(
    order_id: int,
    payload: ProductReturnRequest,
    response: Response,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)],
) -> ProductReturnResponse:
    _require_buyer(current_user)
    if not IDEMPOTENCY_KEY_PATTERN.fullmatch(idempotency_key):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Idempotency-Key geçersiz biçimde.",
        )

    owned_id = db.scalar(
        select(CustomerOrder.id).where(
            CustomerOrder.id == order_id,
            CustomerOrder.owner_subject == current_user.subject,
        )
    )
    if owned_id is None:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı.")
    payment = db.scalar(select(Payment).where(Payment.order_id == order_id).with_for_update())
    order = db.scalar(
        select(CustomerOrder)
        .where(
            CustomerOrder.id == order_id,
            CustomerOrder.owner_subject == current_user.subject,
        )
        .with_for_update()
    )
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sipariş bulunamadı.",
        )

    existing_return = db.scalar(
        select(ProductReturn).where(
            ProductReturn.owner_subject == current_user.subject,
            ProductReturn.idempotency_key == idempotency_key,
        )
    )
    if existing_return is not None:
        if (
            existing_return.order_id != order.id
            or existing_return.order_item_id != payload.order_item_id
            or existing_return.quantity != payload.quantity
            or existing_return.reason != payload.reason
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency-Key farklı bir iade isteği için kullanılmış.",
            )
        response.status_code = status.HTTP_200_OK
        return _product_return_response(db, existing_return)

    if order.status not in {OrderStatus.SHIPPED, OrderStatus.DELIVERED}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Yalnızca kargoya verilmiş veya teslim edilmiş sipariş iade edilebilir.",
        )

    order_item = db.scalar(
        select(OrderItem)
        .where(
            OrderItem.id == payload.order_item_id,
            OrderItem.order_id == order.id,
        )
        .with_for_update()
    )
    if order_item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sipariş kalemi bulunamadı.",
        )

    now = datetime.now(UTC)
    eligible_status_event = db.scalar(
        select(OrderStatusEvent)
        .where(
            OrderStatusEvent.order_id == order.id,
            OrderStatusEvent.action.in_(RETURN_ELIGIBILITY_ACTIONS),
            OrderStatusEvent.to_status == order.status,
        )
        .order_by(OrderStatusEvent.id.desc())
    )
    if eligible_status_event is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Siparişin iade süresi belirlenemedi.",
        )
    eligible_since = eligible_status_event.created_at
    if eligible_since.tzinfo is None:
        eligible_since = eligible_since.replace(tzinfo=UTC)
    if eligible_since > now or now - eligible_since > timedelta(days=30):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="İade talebi, kargo/teslim tarihinden itibaren 30 gün içinde yapılmalıdır.",
        )

    if payment is None or payment.status not in {
        PaymentStatus.SUCCEEDED,
        PaymentStatus.PARTIALLY_REFUNDED,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="İade için sipariş ödemesinin başarılı olması gerekir.",
        )

    returned_quantity = (
        db.scalar(
            select(func.coalesce(func.sum(ProductReturn.quantity), 0)).where(
                ProductReturn.order_item_id == order_item.id
            )
        )
        or 0
    )
    if returned_quantity + payload.quantity > order_item.quantity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="İade miktarı kalan ürün adedini aşamaz.",
        )

    product = None
    if order_item.product_id is not None:
        product = db.scalar(
            select(Product).where(Product.id == order_item.product_id).with_for_update()
        )
    if product is not None and product.stock + payload.quantity > 999999:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stok sınırı nedeniyle iade tamamlanamadı.",
        )

    refund_amount = order_item.unit_price * payload.quantity
    refunded_before = db.scalar(
        select(func.coalesce(func.sum(ProductReturn.refund_amount), 0)).where(
            ProductReturn.order_id == order.id
        )
    ) or Decimal("0.00")
    refunded_after = refunded_before + refund_amount
    if refunded_after > payment.amount:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="İade tutarı sipariş ödeme tutarını aşamaz.",
        )

    product_return = ProductReturn(
        order_id=order.id,
        order_item_id=order_item.id,
        owner_subject=current_user.subject,
        idempotency_key=idempotency_key,
        quantity=payload.quantity,
        reason=payload.reason,
        status="approved",
        refund_amount=refund_amount,
        created_at=now,
    )
    db.add(product_return)
    if product is not None:
        product.stock += payload.quantity
    payment.status = (
        PaymentStatus.REFUNDED
        if refunded_after == payment.amount
        else PaymentStatus.PARTIALLY_REFUNDED
    )
    payment.updated_at = now
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        replay = db.scalar(
            select(ProductReturn).where(
                ProductReturn.owner_subject == current_user.subject,
                ProductReturn.idempotency_key == idempotency_key,
            )
        )
        if replay is None:
            raise
        if (
            replay.order_id != order_id
            or replay.order_item_id != payload.order_item_id
            or replay.quantity != payload.quantity
            or replay.reason != payload.reason
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency-Key farklı bir iade isteği için kullanılmış.",
            ) from error
        response.status_code = status.HTTP_200_OK
        return _product_return_response(db, replay)
    db.refresh(product_return)
    return _product_return_response(db, product_return)


@admin_router.get("", response_model=list[AdminOrderResponse])
def list_orders_for_admin(
    _admin: Annotated[AuthenticatedUser, Depends(get_admin_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    status_filter: Annotated[OrderStatus | None, Query(alias="status")] = None,
) -> list[AdminOrderResponse]:
    statement = select(CustomerOrder)
    if status_filter is not None:
        statement = statement.where(CustomerOrder.status == status_filter)
    orders = db.scalars(
        statement.order_by(CustomerOrder.created_at.desc(), CustomerOrder.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return [_admin_order_response(db, order) for order in orders]


@admin_router.get("/{order_id}", response_model=AdminOrderResponse)
def get_order_for_admin(
    order_id: int,
    _admin: Annotated[AuthenticatedUser, Depends(get_admin_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AdminOrderResponse:
    return _admin_order_response(db, _get_order(db, order_id))


@admin_router.patch("/{order_id}/status", response_model=AdminOrderResponse)
def update_order_status(
    order_id: int,
    payload: AdminOrderStatusRequest,
    admin: Annotated[AuthenticatedUser, Depends(get_admin_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AdminOrderResponse:
    order = _get_order_for_update(db, order_id)
    target_status = payload.status
    if order.status == target_status:
        return _admin_order_response(db, order)

    next_status = {
        OrderStatus.PAID: OrderStatus.PROCESSING,
        OrderStatus.PROCESSING: OrderStatus.SHIPPED,
        OrderStatus.SHIPPED: OrderStatus.DELIVERED,
    }.get(OrderStatus(order.status))
    if target_status != next_status:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Sipariş durumu yalnızca izin verilen sıradaki aşamaya ilerletilebilir.",
        )

    previous_status = order.status
    now = datetime.now(UTC)
    advance_order_fulfillments(
        db,
        order=order,
        target_status=target_status.value,
        actor_subject=admin.subject,
        now=now,
    )
    order.status = target_status
    record_order_status_event(
        db,
        order_id=order.id,
        action="admin_status_changed",
        from_status=previous_status,
        to_status=order.status,
        actor_subject=admin.subject,
        created_at=now,
    )
    db.commit()
    db.refresh(order)
    return _admin_order_response(db, order)


@admin_router.post("/{order_id}/refund", response_model=AdminOrderResponse)
def refund_order_for_admin(
    order_id: int,
    payload: AdminOrderRefundRequest,
    admin: Annotated[AuthenticatedUser, Depends(get_admin_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AdminOrderResponse:
    payment = db.scalar(select(Payment).where(Payment.order_id == order_id).with_for_update())
    order = _get_order_for_update(db, order_id)
    if (
        order.status == OrderStatus.CANCELLED
        and payment is not None
        and payment.status == PaymentStatus.REFUNDED
    ):
        return _admin_order_response(db, order)
    if (
        order.status not in {OrderStatus.PAID, OrderStatus.PROCESSING}
        or payment is None
        or payment.status != PaymentStatus.SUCCEEDED
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Yalnızca ödenmiş ve kargoya verilmemiş sipariş iade edilebilir.",
        )
    advanced_fulfillment = db.scalar(
        select(OrderFulfillment.id)
        .where(
            OrderFulfillment.order_id == order.id,
            OrderFulfillment.status.in_({OrderStatus.SHIPPED.value, OrderStatus.DELIVERED.value}),
        )
        .limit(1)
    )
    if advanced_fulfillment is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Satıcı paketlerinden biri kargoya verildiği için sipariş iade edilemez.",
        )

    now = datetime.now(UTC)
    previous_status = order.status
    order.status = OrderStatus.CANCELLED
    payment.status = PaymentStatus.REFUNDED
    payment.updated_at = now
    try:
        restore_order_stock(db, order.id)
    except StockRestorationError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stok sınırı nedeniyle sipariş iadesi tamamlanamadı.",
        ) from error
    set_order_fulfillments_status(
        db,
        order_id=order.id,
        target_status=OrderStatus.CANCELLED.value,
        action="admin_refund",
        actor_subject=admin.subject,
        created_at=now,
    )
    record_order_status_event(
        db,
        order_id=order.id,
        action="admin_refund",
        from_status=previous_status,
        to_status=order.status,
        actor_subject=admin.subject,
        reason=payload.reason,
        created_at=now,
    )
    db.commit()
    db.refresh(order)
    return _admin_order_response(db, order)
