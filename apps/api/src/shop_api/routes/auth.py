from typing import Annotated

from fastapi import APIRouter, Depends

from shop_api.dependencies import get_current_user
from shop_api.schemas import CurrentUserResponse
from shop_api.security import AuthenticatedUser

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


@router.get("/me", response_model=CurrentUserResponse)
def get_me(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> CurrentUserResponse:
    return CurrentUserResponse(
        subject=current_user.subject,
        email=current_user.email,
        roles=sorted(current_user.roles),
        is_admin=current_user.is_admin,
    )
