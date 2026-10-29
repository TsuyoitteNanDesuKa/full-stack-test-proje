from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shop_api.database import get_db
from shop_api.dependencies import get_admin_user, get_current_user
from shop_api.models import Product, User
from shop_api.schemas import ProductCreateRequest, ProductListResponse, ProductResponse

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
    product = Product(**payload.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return ProductResponse.model_validate(product)
