from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shop_api.database import get_db
from shop_api.dependencies import get_current_user
from shop_api.models import Favorite, Product
from shop_api.routes.products import _product_response
from shop_api.schemas import FavoritePageResponse
from shop_api.security import AuthenticatedUser

router = APIRouter(prefix="/api/v1/favorites", tags=["favorites"])


def _require_buyer(user: AuthenticatedUser) -> None:
    if "buyer" not in user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Favoriler için alıcı hesabı gereklidir.",
        )


@router.get("", response_model=FavoritePageResponse)
def list_favorites(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=2147483647)] = 0,
) -> FavoritePageResponse:
    _require_buyer(current_user)
    products = db.scalars(
        select(Product)
        .join(Favorite, Favorite.product_id == Product.id)
        .where(Favorite.owner_subject == current_user.subject)
        .order_by(Favorite.id.desc())
        .limit(limit + 1)
        .offset(offset)
    ).all()
    return FavoritePageResponse(
        items=[_product_response(product, current_user) for product in products[:limit]],
        limit=limit,
        offset=offset,
        has_more=len(products) > limit,
    )


@router.put("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def add_favorite(
    product_id: Annotated[int, Path(ge=1, le=2147483647)],
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    _require_buyer(current_user)
    if db.get(Product, product_id) is None:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")
    existing = select(Favorite.id).where(
        Favorite.owner_subject == current_user.subject, Favorite.product_id == product_id
    )
    if db.scalar(existing) is None:
        db.add(Favorite(owner_subject=current_user.subject, product_id=product_id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if db.scalar(existing) is not None:
                return Response(status_code=204)
            if db.get(Product, product_id) is None:
                raise HTTPException(status_code=404, detail="Ürün bulunamadı.") from None
            raise
    return Response(status_code=204)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(
    product_id: Annotated[int, Path(ge=1, le=2147483647)],
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    _require_buyer(current_user)
    db.execute(
        delete(Favorite).where(
            Favorite.owner_subject == current_user.subject, Favorite.product_id == product_id
        )
    )
    db.commit()
    return Response(status_code=204)
