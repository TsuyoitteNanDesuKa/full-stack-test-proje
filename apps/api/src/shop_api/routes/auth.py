from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from shop_api.database import get_db
from shop_api.models import User
from shop_api.schemas import LoginRequest, TokenResponse
from shop_api.security import create_access_token, normalize_email, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == normalize_email(str(payload.email))))
    password_is_valid = verify_password(
        payload.password.get_secret_value(),
        user.password_hash if user is not None else None,
    )
    if user is None or not user.is_active or not password_is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz e-posta veya parola.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    expires_in = request.app.state.access_token_expire_minutes * 60
    token = create_access_token(
        user.id,
        request.app.state.secret_key,
        request.app.state.access_token_expire_minutes,
    )
    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
        is_admin=user.is_admin,
    )
