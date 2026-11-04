from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shop_api.database import get_db
from shop_api.dependencies import get_current_user
from shop_api.models import Cart, CartItem, Product
from shop_api.schemas import (
    CartAddItemRequest,
    CartItemResponse,
    CartResponse,
    CartUpdateItemRequest,
)
from shop_api.security import AuthenticatedUser

router = APIRouter(prefix="/api/v1/cart", tags=["cart"])


def _require_buyer(user: AuthenticatedUser) -> None:
    if "buyer" not in user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sepet için alıcı hesabı gereklidir.",
        )


def _cart_not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Sepet veya sepet ürünü bulunamadı.",
    )


def _stock_conflict() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="İstenen miktar mevcut stoktan fazla.",
    )


def _get_or_create_cart(db: Session, owner_subject: str) -> Cart:
    cart = db.scalar(select(Cart).where(Cart.owner_subject == owner_subject).with_for_update())
    if cart is not None:
        return cart

    now = datetime.now(UTC)
    cart = Cart(owner_subject=owner_subject, created_at=now, updated_at=now)
    db.add(cart)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        cart = db.scalar(select(Cart).where(Cart.owner_subject == owner_subject).with_for_update())
        if cart is None:
            raise
    return cart


def _cart_response(db: Session, cart: Cart) -> CartResponse:
    rows = db.execute(
        select(CartItem, Product)
        .outerjoin(Product, Product.id == CartItem.product_id)
        .where(CartItem.cart_id == cart.id)
        .order_by(CartItem.id)
    ).all()
    items: list[CartItemResponse] = []
    subtotal = Decimal("0.00")

    for item, product in rows:
        is_available = product is not None and product.stock >= item.quantity
        line_total = product.price * item.quantity if is_available else None
        if line_total is not None:
            subtotal += line_total
        items.append(
            CartItemResponse(
                id=item.id,
                product_id=product.id if product is not None else None,
                product_name=product.name if product is not None else item.product_name,
                unit_price=product.price if product is not None else None,
                quantity=item.quantity,
                available_stock=product.stock if product is not None else None,
                is_available=is_available,
                line_total=line_total,
            )
        )

    return CartResponse(items=items, subtotal=subtotal)


@router.get("", response_model=CartResponse)
def get_my_cart(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CartResponse:
    _require_buyer(current_user)
    cart = db.scalar(select(Cart).where(Cart.owner_subject == current_user.subject))
    if cart is None:
        return CartResponse(items=[], subtotal=Decimal("0.00"))
    return _cart_response(db, cart)


@router.post(
    "/items",
    response_model=CartResponse,
    status_code=status.HTTP_200_OK,
)
def add_cart_item(
    payload: CartAddItemRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CartResponse:
    _require_buyer(current_user)
    cart = _get_or_create_cart(db, current_user.subject)
    product = db.scalar(select(Product).where(Product.id == payload.product_id).with_for_update())
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ürün bulunamadı.",
        )

    item = db.scalar(
        select(CartItem)
        .where(CartItem.cart_id == cart.id, CartItem.product_id == product.id)
        .with_for_update()
    )
    next_quantity = payload.quantity + (item.quantity if item is not None else 0)
    if next_quantity > product.stock:
        raise _stock_conflict()

    now = datetime.now(UTC)
    if item is None:
        item = CartItem(
            cart_id=cart.id,
            product_id=product.id,
            product_name=product.name,
            quantity=next_quantity,
            created_at=now,
            updated_at=now,
        )
        db.add(item)
    else:
        item.quantity = next_quantity
        item.product_name = product.name
        item.updated_at = now
    cart.updated_at = now
    db.commit()
    db.refresh(cart)
    return _cart_response(db, cart)


@router.put("/items/{item_id}", response_model=CartResponse)
def update_cart_item(
    item_id: int,
    payload: CartUpdateItemRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CartResponse:
    _require_buyer(current_user)
    cart = db.scalar(
        select(Cart).where(Cart.owner_subject == current_user.subject).with_for_update()
    )
    if cart is None:
        raise _cart_not_found()
    item = db.scalar(
        select(CartItem)
        .where(CartItem.id == item_id, CartItem.cart_id == cart.id)
        .with_for_update()
    )
    if item is None:
        raise _cart_not_found()
    if item.product_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Silinmiş ürün sepetten yalnızca kaldırılabilir.",
        )

    product = db.scalar(select(Product).where(Product.id == item.product_id).with_for_update())
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ürün artık mevcut değil ve sepetten yalnızca kaldırılabilir.",
        )
    if payload.quantity > product.stock:
        raise _stock_conflict()

    now = datetime.now(UTC)
    item.quantity = payload.quantity
    item.product_name = product.name
    item.updated_at = now
    cart.updated_at = now
    db.commit()
    db.refresh(cart)
    return _cart_response(db, cart)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cart_item(
    item_id: int,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    _require_buyer(current_user)
    cart = db.scalar(
        select(Cart).where(Cart.owner_subject == current_user.subject).with_for_update()
    )
    if cart is None:
        raise _cart_not_found()
    item = db.scalar(
        select(CartItem)
        .where(CartItem.id == item_id, CartItem.cart_id == cart.id)
        .with_for_update()
    )
    if item is None:
        raise _cart_not_found()

    cart.updated_at = datetime.now(UTC)
    db.delete(item)
    db.commit()
