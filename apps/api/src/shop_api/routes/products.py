from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shop_api.database import get_db
from shop_api.dependencies import get_current_user
from shop_api.models import CartItem, Product, SellerApplication
from shop_api.schemas import (
    ProductCreateRequest,
    ProductListResponse,
    ProductResponse,
    SellerApplicationStatus,
    product_name_key,
)
from shop_api.security import AuthenticatedUser

router = APIRouter(prefix="/api/v1/products", tags=["products"])


@router.get("", response_model=ProductListResponse)
def list_products(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    search: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[str | None, Query(max_length=40)] = None,
    min_price: Annotated[Decimal | None, Query(ge=0, le=Decimal("999999.99"))] = None,
    max_price: Annotated[Decimal | None, Query(ge=0, le=Decimal("999999.99"))] = None,
    sort: Annotated[str, Query(pattern="^(id|name|price_asc|price_desc)$")] = "id",
) -> ProductListResponse:
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Minimum fiyat maksimum fiyattan büyük olamaz.",
        )

    criteria = []
    if search and (normalized_search := search.strip()):
        escaped_search = (
            normalized_search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        )
        search_pattern = f"%{escaped_search}%"
        criteria.append(
            or_(
                Product.name.ilike(search_pattern, escape="\\"),
                Product.category.ilike(search_pattern, escape="\\"),
                Product.description.ilike(search_pattern, escape="\\"),
            )
        )
    if category and (normalized_category := category.strip()):
        criteria.append(func.lower(Product.category) == normalized_category.lower())
    if min_price is not None:
        criteria.append(Product.price >= min_price)
    if max_price is not None:
        criteria.append(Product.price <= max_price)

    total = db.scalar(select(func.count()).select_from(Product).where(*criteria)) or 0
    ordering = {
        "id": (Product.id,),
        "name": (Product.name_key, Product.id),
        "price_asc": (Product.price, Product.id),
        "price_desc": (Product.price.desc(), Product.id),
    }[sort]
    products = db.scalars(
        select(Product).where(*criteria).order_by(*ordering).offset(offset).limit(limit)
    ).all()
    return ProductListResponse(
        products=[_product_response(product, current_user) for product in products],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    payload: ProductCreateRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ProductResponse:
    seller_subject = _seller_owner_for_write(current_user, db)
    name_key = product_name_key(payload.name)
    if db.scalar(select(Product.id).where(Product.name_key == name_key)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu ürün adı katalogda zaten kullanılıyor.",
        )

    product = Product(
        **payload.model_dump(),
        name_key=name_key,
        seller_subject=seller_subject,
    )
    db.add(product)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if db.scalar(select(Product.id).where(Product.name_key == name_key)) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bu ürün adı katalogda zaten kullanılıyor.",
            ) from None
        raise
    db.refresh(product)
    return _product_response(product, current_user)


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    payload: ProductCreateRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ProductResponse:
    seller_subject = _seller_owner_for_write(current_user, db)
    product = db.get(Product, product_id)
    if product is None or (not current_user.is_admin and product.seller_subject != seller_subject):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ürün bulunamadı.",
        )

    name_key = product_name_key(payload.name)
    duplicate_id = db.scalar(
        select(Product.id).where(
            Product.name_key == name_key,
            Product.id != product_id,
        )
    )
    if duplicate_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu ürün adı katalogda zaten kullanılıyor.",
        )

    for field, value in payload.model_dump().items():
        setattr(product, field, value)
    product.name_key = name_key
    product.updated_at = datetime.now(UTC)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if (
            db.scalar(
                select(Product.id).where(
                    Product.name_key == name_key,
                    Product.id != product_id,
                )
            )
            is not None
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bu ürün adı katalogda zaten kullanılıyor.",
            ) from None
        raise
    db.refresh(product)
    return _product_response(product, current_user)


@router.delete(
    "/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_product(
    product_id: int,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    seller_subject = _seller_owner_for_write(current_user, db)
    product = db.get(Product, product_id)
    if product is None or (not current_user.is_admin and product.seller_subject != seller_subject):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ürün bulunamadı.",
        )

    db.execute(
        update(CartItem).where(CartItem.product_id == product.id).values(product_name=product.name)
    )
    db.delete(product)
    db.commit()


def _seller_owner_for_write(user: AuthenticatedUser, db: Session) -> str | None:
    if user.is_admin:
        return None
    if "seller" not in user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlem için onaylı satıcı veya yönetici yetkisi gereklidir.",
        )

    approved_application = db.scalar(
        select(SellerApplication.id)
        .where(SellerApplication.owner_subject == user.subject)
        .where(SellerApplication.status == SellerApplicationStatus.APPROVED.value)
    )
    if approved_application is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Satıcı başvurunuz onaylanmadan ürün işlemi yapamazsınız.",
        )
    return user.subject


def _product_response(
    product: Product,
    user: AuthenticatedUser,
) -> ProductResponse:
    return ProductResponse.model_validate(product).model_copy(
        update={
            "can_manage": user.is_admin or product.seller_subject == user.subject,
        }
    )
