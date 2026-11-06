import re
import unicodedata
from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


class CurrentUserResponse(BaseModel):
    subject: str
    email: EmailStr | None
    roles: list[str]
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
    can_manage: bool = False

    @field_validator("updated_at")
    @classmethod
    def normalize_update_time_to_utc(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class SellerApplicantType(StrEnum):
    INDIVIDUAL = "individual"
    SOLE_PROPRIETOR = "sole_proprietor"
    COMPANY = "company"


class SellerApplicationStatus(StrEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    CHANGES_REQUESTED = "changes_requested"
    APPROVAL_PENDING = "approval_pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class SellerApplicationAction(StrEnum):
    BEGIN_REVIEW = "begin_review"
    REQUEST_CHANGES = "request_changes"
    REJECT = "reject"
    APPROVE = "approve"


def _normalize_application_text(value: str) -> str:
    return unicodedata.normalize("NFC", " ".join(value.split()))


class SellerApplicationRequest(BaseModel):
    applicant_type: SellerApplicantType
    legal_name: str = Field(min_length=2, max_length=120, strict=True)
    representative_name: str | None = Field(default=None, max_length=120, strict=True)
    store_name: str = Field(min_length=2, max_length=64, strict=True)
    contact_phone: str = Field(pattern=r"^\+[1-9]\d{7,14}$", strict=True)
    city: str = Field(min_length=2, max_length=80, strict=True)
    district: str = Field(min_length=2, max_length=80, strict=True)
    primary_category: str = Field(min_length=2, max_length=80, strict=True)
    business_description: str = Field(min_length=20, max_length=1000, strict=True)

    @field_validator(
        "legal_name",
        "representative_name",
        "store_name",
        "city",
        "district",
        "primary_category",
        "business_description",
    )
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = _normalize_application_text(value)
        if any(not character.isprintable() for character in normalized):
            raise ValueError("Metin yazdırılamayan karakter içeremez.")
        return normalized

    @field_validator("store_name")
    @classmethod
    def validate_store_name(cls, value: str) -> str:
        if not re.fullmatch(r"[\w]+(?:[ '-][\w]+)*", value, flags=re.UNICODE):
            raise ValueError("Mağaza adı biçimi geçersiz.")
        return value

    @field_validator("representative_name")
    @classmethod
    def validate_representative_name(cls, value: str | None) -> str | None:
        if value is not None and not 2 <= len(value) <= 120:
            raise ValueError("Yetkili kişi adı 2 ile 120 karakter arasında olmalıdır.")
        return value

    @model_validator(mode="after")
    def require_company_representative(self) -> "SellerApplicationRequest":
        if self.applicant_type == SellerApplicantType.COMPANY and self.representative_name is None:
            raise ValueError("Şirket başvurusunda yetkili kişi adı zorunludur.")
        return self


class SellerApplicationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    applicant_type: SellerApplicantType
    legal_name: str
    representative_name: str | None
    store_name: str
    contact_phone: str
    city: str
    district: str
    primary_category: str
    business_description: str
    status: SellerApplicationStatus
    applicant_note: str | None
    created_at: datetime
    updated_at: datetime


class AdminSellerApplicationResponse(SellerApplicationResponse):
    owner_subject: str
    admin_note: str | None
    reviewer_subject: str | None
    reviewed_at: datetime | None


class SellerApplicationReviewRequest(BaseModel):
    action: SellerApplicationAction
    applicant_note: str | None = Field(default=None, min_length=2, max_length=500)
    admin_note: str | None = Field(default=None, min_length=2, max_length=1000)

    @model_validator(mode="after")
    def validate_action_notes(self) -> "SellerApplicationReviewRequest":
        if (
            self.action
            in {
                SellerApplicationAction.REQUEST_CHANGES,
                SellerApplicationAction.REJECT,
            }
            and self.applicant_note is None
        ):
            raise ValueError("Bu karar için başvuru sahibine açıklama zorunludur.")
        return self


def product_name_key(name: str) -> str:
    normalized = " ".join(name.split())
    return unicodedata.normalize("NFC", normalized).casefold()


def store_name_key(name: str) -> str:
    return product_name_key(name)


class ProductListResponse(BaseModel):
    products: list[ProductResponse]
    total: int
    limit: int
    offset: int


class CartAddItemRequest(BaseModel):
    product_id: int = Field(ge=1, strict=True)
    quantity: int = Field(ge=1, le=999999, strict=True)


class CartUpdateItemRequest(BaseModel):
    quantity: int = Field(ge=1, le=999999, strict=True)


class CartItemResponse(BaseModel):
    id: int
    product_id: int | None
    product_name: str
    unit_price: Decimal | None
    quantity: int
    available_stock: int | None
    is_available: bool
    line_total: Decimal | None


class CartResponse(BaseModel):
    items: list[CartItemResponse]
    subtotal: Decimal


class OrderStatus(StrEnum):
    PENDING_PAYMENT = "pending_payment"
    PAID = "paid"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class OrderFulfillmentStatus(StrEnum):
    PROCESSING = "processing"
    SHIPPED = "shipped"
    DELIVERED = "delivered"


class PaymentStatus(StrEnum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    REFUNDED = "refunded"


class OrderItemResponse(BaseModel):
    id: int
    product_id: int | None
    product_name: str
    unit_price: Decimal
    quantity: int
    line_total: Decimal


class OrderStatusEventResponse(BaseModel):
    action: str
    from_status: OrderStatus | None
    to_status: OrderStatus
    reason: str | None
    created_at: datetime


class AdminOrderStatusEventResponse(OrderStatusEventResponse):
    actor_subject: str | None


class OrderResponse(BaseModel):
    id: int
    status: OrderStatus
    total_amount: Decimal
    created_at: datetime
    items: list[OrderItemResponse]
    history: list[OrderStatusEventResponse]


class AdminOrderResponse(OrderResponse):
    owner_subject: str
    payment_status: PaymentStatus | None
    history: list[AdminOrderStatusEventResponse]


class PaymentResult(StrEnum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PaymentResponse(BaseModel):
    id: int
    order_id: int
    provider_reference: str
    status: PaymentStatus
    amount: Decimal
    currency: str
    expires_at: datetime
    checkout_url: str | None
    created_at: datetime
    updated_at: datetime


class PaymentWebhookRequest(BaseModel):
    event_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")
    payment_reference: str = Field(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9._:-]+$",
    )
    status: PaymentResult
    amount: Decimal = Field(gt=Decimal("0"), max_digits=16, decimal_places=2)
    currency: str = Field(pattern=r"^[A-Z]{3}$")


class PaymentWebhookResponse(BaseModel):
    accepted: bool
    duplicate: bool
    payment: PaymentResponse


class MockPaymentResultRequest(BaseModel):
    status: PaymentResult


class AdminOrderStatusRequest(BaseModel):
    status: OrderFulfillmentStatus


class AdminOrderRefundRequest(BaseModel):
    reason: str = Field(min_length=5, max_length=500, strict=True)

    @field_validator("reason")
    @classmethod
    def strip_and_validate_reason(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 5:
            raise ValueError("İptal/iade nedeni en az 5 karakter olmalıdır.")
        return normalized
