from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Numeric, String, false
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
