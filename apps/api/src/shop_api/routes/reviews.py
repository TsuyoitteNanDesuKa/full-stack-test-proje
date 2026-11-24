from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shop_api.database import get_db
from shop_api.dependencies import get_current_user
from shop_api.models import CustomerOrder, OrderFulfillment, OrderItem, Product, ProductReview
from shop_api.schemas import ProductReviewPageResponse, ProductReviewRequest, ProductReviewResponse
from shop_api.security import AuthenticatedUser

router = APIRouter(prefix="/api/v1/products", tags=["reviews"])
ProductId = Annotated[int, Path(ge=1, le=2147483647)]


def _ensure_product(db: Session, product_id: int) -> None:
    if db.get(Product, product_id) is None:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")


def _require_buyer(user: AuthenticatedUser) -> None:
    if "buyer" not in user.roles:
        raise HTTPException(status_code=403, detail="Değerlendirme için alıcı hesabı gereklidir.")


def _eligible(db: Session, product_id: int, subject: str) -> bool:
    return (
        db.scalar(
            select(OrderItem.id)
            .join(CustomerOrder, CustomerOrder.id == OrderItem.order_id)
            .join(
                OrderFulfillment,
                (OrderFulfillment.id == OrderItem.fulfillment_id)
                & (OrderFulfillment.order_id == CustomerOrder.id),
            )
            .where(
                CustomerOrder.owner_subject == subject,
                CustomerOrder.status != "cancelled",
                OrderItem.product_id == product_id,
                OrderFulfillment.status == "delivered",
            )
            .limit(1)
        )
        is not None
    )


def _review_response(review: ProductReview, subject: str) -> ProductReviewResponse:
    return ProductReviewResponse(
        id=review.id,
        rating=review.rating,
        comment=review.comment,
        created_at=review.created_at,
        updated_at=review.updated_at,
        is_mine=review.owner_subject == subject,
    )


@router.get("/{product_id}/reviews", response_model=ProductReviewPageResponse)
def list_reviews(
    product_id: ProductId,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0, le=2147483647)] = 0,
) -> ProductReviewPageResponse:
    _ensure_product(db, product_id)
    reviews = db.scalars(
        select(ProductReview)
        .where(ProductReview.product_id == product_id)
        .order_by(ProductReview.id.desc())
        .limit(limit + 1)
        .offset(offset)
    ).all()
    own = db.scalar(
        select(ProductReview).where(
            ProductReview.product_id == product_id,
            ProductReview.owner_subject == current_user.subject,
        )
    )
    return ProductReviewPageResponse(
        items=[_review_response(review, current_user.subject) for review in reviews[:limit]],
        my_review=_review_response(own, current_user.subject) if own else None,
        can_review="buyer" in current_user.roles
        and _eligible(db, product_id, current_user.subject),
        limit=limit,
        offset=offset,
        has_more=len(reviews) > limit,
    )


@router.put("/{product_id}/reviews/me", response_model=ProductReviewResponse)
def save_review(
    product_id: ProductId,
    payload: ProductReviewRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ProductReviewResponse:
    _require_buyer(current_user)
    _ensure_product(db, product_id)
    if not _eligible(db, product_id, current_user.subject):
        raise HTTPException(
            status_code=403, detail="Yalnızca teslim aldığın ürünü değerlendirebilirsin."
        )
    own_statement = select(ProductReview).where(
        ProductReview.product_id == product_id,
        ProductReview.owner_subject == current_user.subject,
    )
    review = db.scalar(own_statement)
    creating = review is None
    now = datetime.now(UTC)
    if review is None:
        review = ProductReview(
            product_id=product_id,
            owner_subject=current_user.subject,
            rating=payload.rating,
            comment=payload.comment,
            created_at=now,
            updated_at=now,
        )
        db.add(review)
    else:
        review.rating = payload.rating
        review.comment = payload.comment
        review.updated_at = now
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if db.get(Product, product_id) is None:
            raise HTTPException(status_code=404, detail="Ürün bulunamadı.") from None
        if creating and db.scalar(own_statement) is not None:
            raise HTTPException(
                status_code=409, detail="Değerlendirme değişti. Lütfen yenileyip tekrar dene."
            ) from None
        raise
    db.refresh(review)
    return _review_response(review, current_user.subject)


@router.delete("/{product_id}/reviews/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_review(
    product_id: ProductId,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    _require_buyer(current_user)
    _ensure_product(db, product_id)
    db.execute(
        delete(ProductReview).where(
            ProductReview.product_id == product_id,
            ProductReview.owner_subject == current_user.subject,
        )
    )
    db.commit()
    return Response(status_code=204)
