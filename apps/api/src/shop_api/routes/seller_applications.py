import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shop_api.database import get_db
from shop_api.dependencies import get_admin_user, get_current_user
from shop_api.keycloak_admin import KeycloakProvisioningError
from shop_api.models import SellerApplication, SellerApplicationAudit
from shop_api.schemas import (
    AdminSellerApplicationResponse,
    SellerApplicationAction,
    SellerApplicationRequest,
    SellerApplicationResponse,
    SellerApplicationReviewRequest,
    SellerApplicationStatus,
    store_name_key,
)
from shop_api.security import AuthenticatedUser

router = APIRouter(prefix="/api/v1/seller-applications", tags=["seller applications"])
logger = logging.getLogger(__name__)

ACTIVE_STATUSES = (
    SellerApplicationStatus.DRAFT,
    SellerApplicationStatus.SUBMITTED,
    SellerApplicationStatus.UNDER_REVIEW,
    SellerApplicationStatus.CHANGES_REQUESTED,
    SellerApplicationStatus.APPROVAL_PENDING,
    SellerApplicationStatus.APPROVED,
)


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Satıcı başvurusu bulunamadı.",
    )


def _require_buyer(user: AuthenticatedUser) -> None:
    if "buyer" not in user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Satıcı başvurusu için alıcı hesabı gereklidir.",
        )


def _record_transition(
    db: Session,
    application: SellerApplication,
    actor_subject: str,
    action: str,
    next_status: SellerApplicationStatus,
    now: datetime,
) -> None:
    previous_status = application.status
    application.status = next_status.value
    application.updated_at = now
    db.add(
        SellerApplicationAudit(
            application_id=application.id,
            actor_subject=actor_subject,
            action=action,
            from_status=previous_status,
            to_status=next_status.value,
            created_at=now,
        )
    )


def _save_application_fields(
    application: SellerApplication,
    payload: SellerApplicationRequest,
) -> None:
    for field, value in payload.model_dump().items():
        setattr(application, field, value.value if hasattr(value, "value") else value)
    application.store_name_key = store_name_key(payload.store_name)


@router.post(
    "",
    response_model=SellerApplicationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_application(
    payload: SellerApplicationRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SellerApplicationResponse:
    _require_buyer(current_user)
    now = datetime.now(UTC)
    application = SellerApplication(
        owner_subject=current_user.subject,
        applicant_type=payload.applicant_type.value,
        legal_name=payload.legal_name,
        representative_name=payload.representative_name,
        store_name=payload.store_name,
        store_name_key=store_name_key(payload.store_name),
        contact_phone=payload.contact_phone,
        city=payload.city,
        district=payload.district,
        primary_category=payload.primary_category,
        business_description=payload.business_description,
        status=SellerApplicationStatus.DRAFT.value,
        created_at=now,
        updated_at=now,
    )
    db.add(application)
    try:
        db.flush()
        db.add(
            SellerApplicationAudit(
                application_id=application.id,
                actor_subject=current_user.subject,
                action="created",
                from_status="none",
                to_status=SellerApplicationStatus.DRAFT.value,
                created_at=now,
            )
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Etkin bir satıcı başvurusu veya kullanılan mağaza adı zaten mevcut.",
        ) from None
    db.refresh(application)
    return SellerApplicationResponse.model_validate(application)


@router.get("/me", response_model=SellerApplicationResponse | None)
def get_my_application(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SellerApplicationResponse | None:
    _require_buyer(current_user)
    application = db.scalar(
        select(SellerApplication)
        .where(SellerApplication.owner_subject == current_user.subject)
        .where(SellerApplication.status.in_([item.value for item in ACTIVE_STATUSES]))
        .order_by(SellerApplication.id.desc())
    )
    return (
        SellerApplicationResponse.model_validate(application) if application is not None else None
    )


@router.put("/me", response_model=SellerApplicationResponse)
def update_my_application(
    payload: SellerApplicationRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SellerApplicationResponse:
    _require_buyer(current_user)
    application = db.scalar(
        select(SellerApplication)
        .where(SellerApplication.owner_subject == current_user.subject)
        .where(
            SellerApplication.status.in_(
                [
                    SellerApplicationStatus.DRAFT.value,
                    SellerApplicationStatus.CHANGES_REQUESTED.value,
                ]
            )
        )
        .order_by(SellerApplication.id.desc())
    )
    if application is None:
        raise _not_found()

    _save_application_fields(application, payload)
    application.applicant_note = None
    application.updated_at = datetime.now(UTC)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu mağaza adı etkin bir başvuruda kullanılıyor.",
        ) from None
    db.refresh(application)
    return SellerApplicationResponse.model_validate(application)


@router.post("/me/submit", response_model=SellerApplicationResponse)
def submit_my_application(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SellerApplicationResponse:
    _require_buyer(current_user)
    application = db.scalar(
        select(SellerApplication)
        .where(SellerApplication.owner_subject == current_user.subject)
        .where(
            SellerApplication.status.in_(
                [
                    SellerApplicationStatus.DRAFT.value,
                    SellerApplicationStatus.CHANGES_REQUESTED.value,
                ]
            )
        )
        .order_by(SellerApplication.id.desc())
    )
    if application is None:
        raise _not_found()

    now = datetime.now(UTC)
    _record_transition(
        db,
        application,
        current_user.subject,
        "submitted",
        SellerApplicationStatus.SUBMITTED,
        now,
    )
    db.commit()
    db.refresh(application)
    return SellerApplicationResponse.model_validate(application)


@router.post("/me/withdraw", response_model=SellerApplicationResponse)
def withdraw_my_application(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SellerApplicationResponse:
    _require_buyer(current_user)
    application = db.scalar(
        select(SellerApplication)
        .where(SellerApplication.owner_subject == current_user.subject)
        .where(
            SellerApplication.status.in_(
                [
                    SellerApplicationStatus.DRAFT.value,
                    SellerApplicationStatus.SUBMITTED.value,
                    SellerApplicationStatus.CHANGES_REQUESTED.value,
                ]
            )
        )
        .order_by(SellerApplication.id.desc())
    )
    if application is None:
        raise _not_found()

    now = datetime.now(UTC)
    _record_transition(
        db,
        application,
        current_user.subject,
        "withdrawn",
        SellerApplicationStatus.WITHDRAWN,
        now,
    )
    db.commit()
    db.refresh(application)
    return SellerApplicationResponse.model_validate(application)


@router.get("", response_model=list[AdminSellerApplicationResponse])
def list_applications_for_admin(
    _admin: Annotated[AuthenticatedUser, Depends(get_admin_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[AdminSellerApplicationResponse]:
    applications = db.scalars(
        select(SellerApplication).order_by(SellerApplication.created_at, SellerApplication.id)
    ).all()
    return [
        AdminSellerApplicationResponse.model_validate(application) for application in applications
    ]


@router.post(
    "/{application_id}/review",
    response_model=AdminSellerApplicationResponse,
)
def review_application(
    application_id: int,
    payload: SellerApplicationReviewRequest,
    request: Request,
    admin: Annotated[AuthenticatedUser, Depends(get_admin_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AdminSellerApplicationResponse:
    application = db.get(SellerApplication, application_id)
    if application is None:
        raise _not_found()

    now = datetime.now(UTC)
    action = payload.action
    if action == SellerApplicationAction.BEGIN_REVIEW:
        if application.status != SellerApplicationStatus.SUBMITTED.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Yalnızca gönderilmiş başvuru incelemeye alınabilir.",
            )
        _record_transition(
            db, application, admin.subject, action.value, SellerApplicationStatus.UNDER_REVIEW, now
        )
        application.reviewer_subject = admin.subject
        application.reviewed_at = now
    elif action == SellerApplicationAction.REQUEST_CHANGES:
        if application.status != SellerApplicationStatus.UNDER_REVIEW.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Yalnızca incelenen başvuruda değişiklik istenebilir.",
            )
        _record_transition(
            db,
            application,
            admin.subject,
            action.value,
            SellerApplicationStatus.CHANGES_REQUESTED,
            now,
        )
        application.applicant_note = payload.applicant_note
        application.admin_note = payload.admin_note
        application.reviewer_subject = admin.subject
        application.reviewed_at = now
    elif action == SellerApplicationAction.REJECT:
        if application.status != SellerApplicationStatus.UNDER_REVIEW.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Yalnızca incelenen başvuru reddedilebilir.",
            )
        _record_transition(
            db, application, admin.subject, action.value, SellerApplicationStatus.REJECTED, now
        )
        application.applicant_note = payload.applicant_note
        application.admin_note = payload.admin_note
        application.reviewer_subject = admin.subject
        application.reviewed_at = now
    elif action == SellerApplicationAction.APPROVE:
        if application.status == SellerApplicationStatus.UNDER_REVIEW.value:
            _record_transition(
                db,
                application,
                admin.subject,
                action.value,
                SellerApplicationStatus.APPROVAL_PENDING,
                now,
            )
            application.admin_note = payload.admin_note
            application.reviewer_subject = admin.subject
            application.reviewed_at = now
            db.commit()
        elif application.status != SellerApplicationStatus.APPROVAL_PENDING.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Yalnızca incelenen başvuru onaylanabilir.",
            )

        try:
            request.app.state.keycloak_role_provisioner.assign_seller_role(
                application.owner_subject
            )
        except KeycloakProvisioningError:
            logger.exception(
                "Could not assign seller role for application %s.",
                application.id,
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Satıcı rolü atanamadı; başvuru yeniden denenmek üzere beklemede.",
            ) from None

        if application.status != SellerApplicationStatus.APPROVED.value:
            _record_transition(
                db,
                application,
                admin.subject,
                "seller_role_assigned",
                SellerApplicationStatus.APPROVED,
                datetime.now(UTC),
            )
        application.reviewer_subject = admin.subject
        application.reviewed_at = datetime.now(UTC)
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Başvuru kararı geçersiz.",
        )

    db.commit()
    db.refresh(application)
    return AdminSellerApplicationResponse.model_validate(application)
