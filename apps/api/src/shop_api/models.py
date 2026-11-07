from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    false,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=false(),
        nullable=False,
    )


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("length(name) BETWEEN 2 AND 32", name="ck_products_name_length"),
        CheckConstraint(
            "length(category) BETWEEN 2 AND 40",
            name="ck_products_category_length",
        ),
        CheckConstraint(
            "length(description) BETWEEN 10 AND 500",
            name="ck_products_description_length",
        ),
        CheckConstraint(
            "price >= 0.01 AND price <= 999999.99",
            name="ck_products_price_range",
        ),
        CheckConstraint(
            "stock >= 0 AND stock <= 999999",
            name="ck_products_stock_range",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(32), nullable=False)
    name_key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    stock: Mapped[int] = mapped_column(nullable=False)
    seller_subject: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class SellerApplication(Base):
    __tablename__ = "seller_applications"
    __table_args__ = (
        CheckConstraint(
            "applicant_type IN ('individual', 'sole_proprietor', 'company')",
            name="ck_seller_applications_applicant_type",
        ),
        CheckConstraint(
            "status IN ('draft', 'submitted', 'under_review', 'changes_requested', "
            "'approval_pending', 'approved', 'rejected', 'withdrawn')",
            name="ck_seller_applications_status",
        ),
        Index(
            "uq_seller_applications_active_owner",
            "owner_subject",
            unique=True,
            sqlite_where=text(
                "status IN ('draft', 'submitted', 'under_review', "
                "'changes_requested', 'approval_pending', 'approved')"
            ),
            postgresql_where=text(
                "status IN ('draft', 'submitted', 'under_review', "
                "'changes_requested', 'approval_pending', 'approved')"
            ),
        ),
        Index(
            "uq_seller_applications_active_store_name",
            "store_name_key",
            unique=True,
            sqlite_where=text(
                "status IN ('draft', 'submitted', 'under_review', "
                "'changes_requested', 'approval_pending', 'approved')"
            ),
            postgresql_where=text(
                "status IN ('draft', 'submitted', 'under_review', "
                "'changes_requested', 'approval_pending', 'approved')"
            ),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_subject: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    applicant_type: Mapped[str] = mapped_column(String(32), nullable=False)
    legal_name: Mapped[str] = mapped_column(String(120), nullable=False)
    representative_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    store_name: Mapped[str] = mapped_column(String(64), nullable=False)
    store_name_key: Mapped[str] = mapped_column(String(128), nullable=False)
    contact_phone: Mapped[str] = mapped_column(String(16), nullable=False)
    city: Mapped[str] = mapped_column(String(80), nullable=False)
    district: Mapped[str] = mapped_column(String(80), nullable=False)
    primary_category: Mapped[str] = mapped_column(String(80), nullable=False)
    business_description: Mapped[str] = mapped_column(String(1000), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    applicant_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    admin_note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    reviewer_subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SellerApplicationAudit(Base):
    __tablename__ = "seller_application_audit"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(
        ForeignKey("seller_applications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    actor_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    from_status: Mapped[str] = mapped_column(String(32), nullable=False)
    to_status: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Cart(Base):
    __tablename__ = "carts"
    __table_args__ = (UniqueConstraint("owner_subject", name="uq_carts_owner_subject"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (
        CheckConstraint("quantity BETWEEN 1 AND 999999", name="ck_cart_items_quantity_range"),
        UniqueConstraint("cart_id", "product_id", name="uq_cart_items_cart_product"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    cart_id: Mapped[int] = mapped_column(
        ForeignKey("carts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    product_name: Mapped[str] = mapped_column(String(32), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CustomerOrder(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending_payment', 'paid', 'processing', 'shipped', "
            "'delivered', 'cancelled')",
            name="ck_orders_status",
        ),
        CheckConstraint("total_amount >= 0", name="ck_orders_total_amount_nonnegative"),
        UniqueConstraint(
            "owner_subject",
            "idempotency_key",
            name="uq_orders_owner_idempotency_key",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_subject: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(16, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class OrderStatusEvent(Base):
    __tablename__ = "order_status_events"
    __table_args__ = (
        CheckConstraint(
            "action IN ('created', 'payment_succeeded', 'payment_failed', "
            "'payment_cancelled', 'payment_expired', 'admin_status_changed', "
            "'admin_refund', 'legacy_import')",
            name="ck_order_status_events_action",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    actor_subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_status: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint(
            "quantity BETWEEN 1 AND 999999",
            name="ck_order_items_quantity_range",
        ),
        CheckConstraint(
            "unit_price >= 0.01 AND unit_price <= 999999.99",
            name="ck_order_items_unit_price_range",
        ),
        CheckConstraint(
            "line_total >= 0",
            name="ck_order_items_line_total_nonnegative",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    product_name: Mapped[str] = mapped_column(String(32), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(16, 2), nullable=False)


class ProductReturn(Base):
    __tablename__ = "product_returns"
    __table_args__ = (
        CheckConstraint(
            "quantity BETWEEN 1 AND 999999",
            name="ck_product_returns_quantity_range",
        ),
        CheckConstraint(
            "status = 'approved'",
            name="ck_product_returns_status",
        ),
        CheckConstraint(
            "refund_amount > 0",
            name="ck_product_returns_refund_amount_positive",
        ),
        UniqueConstraint(
            "owner_subject",
            "idempotency_key",
            name="uq_product_returns_owner_idempotency_key",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_item_id: Mapped[int] = mapped_column(
        ForeignKey("order_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    owner_subject: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    refund_amount: Mapped[Decimal] = mapped_column(Numeric(16, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed', 'cancelled', 'expired', "
            "'partially_refunded', 'refunded')",
            name="ck_payments_status",
        ),
        CheckConstraint("amount > 0", name="ck_payments_amount_positive"),
        UniqueConstraint("order_id", name="uq_payments_order_id"),
        UniqueConstraint(
            "owner_subject",
            "idempotency_key",
            name="uq_payments_owner_idempotency_key",
        ),
        UniqueConstraint(
            "provider",
            "provider_reference",
            name="uq_payments_provider_reference",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    owner_subject: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_reference: Mapped[str] = mapped_column(String(128), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(16, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PaymentWebhookEvent(Base):
    __tablename__ = "payment_webhook_events"
    __table_args__ = (
        UniqueConstraint("provider", "event_id", name="uq_payment_events_provider_event"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    payment_id: Mapped[int] = mapped_column(
        ForeignKey("payments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    event_id: Mapped[str] = mapped_column(String(128), nullable=False)
    payload_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
