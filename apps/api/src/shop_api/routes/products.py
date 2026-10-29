from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shop_api.database import get_db
from shop_api.dependencies import get_admin_user, get_current_user
from shop_api.models import Product, User
from shop_api.schemas import (
    ProductCreateRequest,
    ProductListResponse,
    ProductResponse,
    product_name_key,
)

router = APIRouter(prefix="/api/v1/products", tags=["products"])


@router.get("", response_model=ProductListResponse)
def list_products(
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ProductListResponse:
    total = db.scalar(select(func.count()).select_from(Product)) or 0
    products = db.scalars(select(Product).order_by(Product.id).offset(offset).limit(limit)).all()
    return ProductListResponse(
        products=[ProductResponse.model_validate(product) for product in products],
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
    _admin_user: Annotated[User, Depends(get_admin_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ProductResponse:
    name_key = product_name_key(payload.name)
    if db.scalar(select(Product.id).where(Product.name_key == name_key)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu ürün adı katalogda zaten kullanılıyor.",
        )

    product = Product(**payload.model_dump(), name_key=name_key)
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
    return ProductResponse.model_validate(product)
