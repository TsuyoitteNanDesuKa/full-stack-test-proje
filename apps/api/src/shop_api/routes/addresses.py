from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from shop_api.database import get_db
from shop_api.dependencies import get_current_user
from shop_api.models import CustomerAddress
from shop_api.schemas import AddressRequest, AddressResponse
from shop_api.security import AuthenticatedUser

router = APIRouter(prefix="/api/v1/addresses", tags=["addresses"])


def _require_buyer(user: AuthenticatedUser) -> None:
    if "buyer" not in user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Adres defteri için alıcı hesabı gereklidir.",
        )


def _address_response(address: CustomerAddress) -> AddressResponse:
    return AddressResponse(
        id=address.id,
        label=address.label,
        recipient_name=address.recipient_name,
        phone=address.phone,
        city=address.city,
        district=address.district,
        address_line=address.address_line,
        postal_code=address.postal_code,
        is_default=address.is_default,
        created_at=address.created_at,
        updated_at=address.updated_at,
    )


def _owned_address(
    db: Session,
    address_id: int,
    owner_subject: str,
) -> CustomerAddress:
    address = db.scalar(
        select(CustomerAddress)
        .where(
            CustomerAddress.id == address_id,
            CustomerAddress.owner_subject == owner_subject,
        )
        .with_for_update()
    )
    if address is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Adres bulunamadı.",
        )
    return address


def _clear_default(db: Session, owner_subject: str, *, except_id: int | None = None) -> None:
    statement = update(CustomerAddress).where(
        CustomerAddress.owner_subject == owner_subject,
        CustomerAddress.is_default.is_(True),
    )
    if except_id is not None:
        statement = statement.where(CustomerAddress.id != except_id)
    db.execute(statement.values(is_default=False))


@router.get("", response_model=list[AddressResponse])
def list_addresses(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[AddressResponse]:
    _require_buyer(current_user)
    addresses = db.scalars(
        select(CustomerAddress)
        .where(CustomerAddress.owner_subject == current_user.subject)
        .order_by(CustomerAddress.is_default.desc(), CustomerAddress.id)
    ).all()
    return [_address_response(address) for address in addresses]


@router.post("", response_model=AddressResponse, status_code=status.HTTP_201_CREATED)
def create_address(
    payload: AddressRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AddressResponse:
    _require_buyer(current_user)
    now = datetime.now(UTC)
    if payload.is_default:
        _clear_default(db, current_user.subject)
    address = CustomerAddress(
        owner_subject=current_user.subject,
        **payload.model_dump(),
        created_at=now,
        updated_at=now,
    )
    db.add(address)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Varsayılan adres eş zamanlı değiştirildi; adreslerini yenileyip tekrar dene.",
        ) from error
    db.refresh(address)
    return _address_response(address)


@router.put("/{address_id}", response_model=AddressResponse)
def update_address(
    address_id: int,
    payload: AddressRequest,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AddressResponse:
    _require_buyer(current_user)
    address = _owned_address(db, address_id, current_user.subject)
    if payload.is_default:
        _clear_default(db, current_user.subject, except_id=address.id)
    for field, value in payload.model_dump().items():
        setattr(address, field, value)
    address.updated_at = datetime.now(UTC)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Varsayılan adres eş zamanlı değiştirildi; adreslerini yenileyip tekrar dene.",
        ) from error
    db.refresh(address)
    return _address_response(address)


@router.delete("/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_address(
    address_id: int,
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    _require_buyer(current_user)
    address = _owned_address(db, address_id, current_user.subject)
    db.delete(address)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
