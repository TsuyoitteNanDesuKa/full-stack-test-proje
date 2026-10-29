from typing import Annotated

from fastapi import APIRouter, Depends

from shop_api.dependencies import get_current_user
from shop_api.models import User
from shop_api.schemas import HomeResponse

router = APIRouter(prefix="/api/v1", tags=["storefront"])


@router.get("/home", response_model=HomeResponse)
def get_home(
    _current_user: Annotated[User, Depends(get_current_user)],
) -> HomeResponse:
    return HomeResponse(message="Alışverişe hoş geldiniz", featured_categories=[])
