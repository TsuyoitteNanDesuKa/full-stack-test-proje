from typing import Annotated

from fastapi import APIRouter, Depends

from shop_api.dependencies import get_current_user
from shop_api.schemas import HomeResponse
from shop_api.security import AuthenticatedUser

router = APIRouter(prefix="/api/v1", tags=["storefront"])


@router.get("/home", response_model=HomeResponse)
def get_home(
    _current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> HomeResponse:
    return HomeResponse(message="Alışverişe hoş geldiniz", featured_categories=[])
