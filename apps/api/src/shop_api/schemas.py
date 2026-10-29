import re
import unicodedata
from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator


class LoginRequest(BaseModel):
    email: EmailStr
    password: SecretStr = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    is_admin: bool


class HomeResponse(BaseModel):
    message: str
    featured_categories: list[str]


class ProductCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=32, strict=True)
    category: str = Field(min_length=2, max_length=40, strict=True)
    description: str = Field(min_length=10, max_length=500, strict=True)
    price: Decimal = Field(
        ge=Decimal("0.01"),
        le=Decimal("999999.99"),
        max_digits=8,
        decimal_places=2,
    )
    stock: int = Field(ge=0, le=999999, strict=True)

    @field_validator("price", mode="before")
    @classmethod
    def reject_boolean_price(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("Fiyat sayısal bir değer olmalıdır.")
        return value

    @field_validator("name")
    @classmethod
    def normalize_and_validate_name(cls, value: str) -> str:
        normalized = unicodedata.normalize("NFC", " ".join(value.split()))
        if not 2 <= len(normalized) <= 32:
            raise ValueError("Ürün adı 2 ile 32 karakter arasında olmalıdır.")
        if not re.fullmatch(r"[\w]+(?:[ '-][\w]+)*", normalized, flags=re.UNICODE):
            raise ValueError(
                "Ürün adı yalnızca harf, rakam, boşluk, tire ve kesme işareti içerebilir."
            )
        return normalized

    @field_validator("category")
    @classmethod
    def normalize_and_validate_category(cls, value: str) -> str:
        normalized = unicodedata.normalize("NFC", " ".join(value.split()))
        if not 2 <= len(normalized) <= 40:
            raise ValueError("Kategori 2 ile 40 karakter arasında olmalıdır.")
        if not re.fullmatch(r"[\w]+(?:[ &/'’-][\w]+)*", normalized, flags=re.UNICODE):
            raise ValueError("Kategori biçimi geçersiz.")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_and_validate_description(cls, value: str) -> str:
        normalized = value.strip()
        if not 10 <= len(normalized) <= 500:
            raise ValueError("Açıklama 10 ile 500 karakter arasında olmalıdır.")
        if any(not character.isprintable() and character not in "\n\t" for character in normalized):
            raise ValueError("Açıklama yazdırılamayan karakter içeremez.")
        return normalized


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: str
    description: str
    price: Decimal
    stock: int
    updated_at: datetime | None

    @field_validator("updated_at")
    @classmethod
    def normalize_update_time_to_utc(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


def product_name_key(name: str) -> str:
    normalized = " ".join(name.split())
    return unicodedata.normalize("NFC", normalized).casefold()


class ProductListResponse(BaseModel):
    products: list[ProductResponse]
    total: int
    limit: int
    offset: int
