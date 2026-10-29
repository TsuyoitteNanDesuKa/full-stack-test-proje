"""Constrain product formats and enforce normalized product-name uniqueness."""

import unicodedata
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_constrain_product_fields"
down_revision: str | None = "0002_add_products_and_admin"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _name_key(name: str) -> str:
    normalized = " ".join(name.split())
    return unicodedata.normalize("NFC", normalized).casefold()


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("name_key", sa.String(length=128), nullable=True),
    )
    connection = op.get_bind()
    existing_names = connection.execute(sa.text("SELECT id, name FROM products")).all()
    seen_names: set[str] = set()
    for product_id, name in existing_names:
        key = _name_key(name)
        if key in seen_names:
            raise RuntimeError(
                "Product-name uniqueness migration found duplicate names after normalization."
            )
        seen_names.add(key)
        connection.execute(
            sa.text("UPDATE products SET name_key = :name_key WHERE id = :product_id"),
            {"name_key": key, "product_id": product_id},
        )

    with op.batch_alter_table("products") as batch_op:
        batch_op.alter_column(
            "name",
            existing_type=sa.String(length=120),
            type_=sa.String(length=32),
            nullable=False,
        )
        batch_op.alter_column(
            "category",
            existing_type=sa.String(length=80),
            type_=sa.String(length=40),
            nullable=False,
        )
        batch_op.alter_column(
            "description",
            existing_type=sa.String(length=600),
            type_=sa.String(length=500),
            nullable=False,
        )
        batch_op.alter_column(
            "price",
            existing_type=sa.Numeric(precision=10, scale=2),
            type_=sa.Numeric(precision=8, scale=2),
            nullable=False,
        )
        batch_op.alter_column(
            "name_key",
            existing_type=sa.String(length=128),
            nullable=False,
        )
        batch_op.create_unique_constraint("uq_products_name_key", ["name_key"])
        batch_op.create_check_constraint(
            "ck_products_name_length",
            "length(name) BETWEEN 2 AND 32",
        )
        batch_op.create_check_constraint(
            "ck_products_category_length",
            "length(category) BETWEEN 2 AND 40",
        )
        batch_op.create_check_constraint(
            "ck_products_description_length",
            "length(description) BETWEEN 10 AND 500",
        )
        batch_op.create_check_constraint(
            "ck_products_price_range",
            "price >= 0.01 AND price <= 999999.99",
        )
        batch_op.create_check_constraint(
            "ck_products_stock_range",
            "stock >= 0 AND stock <= 999999",
        )


def downgrade() -> None:
    with op.batch_alter_table("products") as batch_op:
        batch_op.drop_constraint("ck_products_stock_range", type_="check")
        batch_op.drop_constraint("ck_products_price_range", type_="check")
        batch_op.drop_constraint("ck_products_description_length", type_="check")
        batch_op.drop_constraint("ck_products_category_length", type_="check")
        batch_op.drop_constraint("ck_products_name_length", type_="check")
        batch_op.drop_constraint("uq_products_name_key", type_="unique")
        batch_op.drop_column("name_key")
        batch_op.alter_column(
            "price",
            existing_type=sa.Numeric(precision=8, scale=2),
            type_=sa.Numeric(precision=10, scale=2),
            nullable=False,
        )
        batch_op.alter_column(
            "description",
            existing_type=sa.String(length=500),
            type_=sa.String(length=600),
            nullable=False,
        )
        batch_op.alter_column(
            "category",
            existing_type=sa.String(length=40),
            type_=sa.String(length=80),
            nullable=False,
        )
        batch_op.alter_column(
            "name",
            existing_type=sa.String(length=32),
            type_=sa.String(length=120),
            nullable=False,
        )
