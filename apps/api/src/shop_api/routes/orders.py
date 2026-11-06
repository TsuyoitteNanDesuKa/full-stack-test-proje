import re
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from shop_api.database import get_db
from shop_api.dependencies import get_admin_user, get_current_user
from shop_api.models import Cart, CartItem, CustomerOrder, OrderItem, Payment, Product
from shop_api.order_lifecycle import order_status_history, record_order_status_event
from shop_api.payment_expiry import StockRestorationError, restore_order_stock
from shop_api.schemas import (
    AdminOrderRefundRequest,
    AdminOrderResponse,
    AdminOrderStatusRequest,
    OrderItemResponse,
    OrderResponse,
    OrderStatus,
    PaymentStatus,
)
from shop_api.security import AuthenticatedUser

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])
admin_router = APIRouter(prefix="/api/v1/admin/orders", tags=["admin orders"])
IDEMPOTENCY_KEY_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


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
    response_data = {
        "id": order.id,
        "status": order.status,
        "total_amount": order.total_amount,
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
    total_amount = Decimal("0.00")
    for item in cart_items:
        product = products_by_id[item.product_id]
        line_total = product.price * item.quantity
        total_amount += line_total
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

    order = CustomerOrder(
        owner_subject=current_user.subject,
        idempotency_key=idempotency_key,
        status="pending_payment",
        total_amount=total_amount,
        created_at=now,
    )
    db.add(order)
    db.flush()
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
