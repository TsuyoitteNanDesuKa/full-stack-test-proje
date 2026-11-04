"""Add customer orders and immutable item snapshots."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_customer_orders"
down_revision: str | None = "0006_customer_carts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_subject", sa.String(length=255), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=16, scale=2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending_payment', 'paid', 'cancelled')",
            name="ck_orders_status",
        ),
        sa.CheckConstraint(
            "total_amount >= 0",
            name="ck_orders_total_amount_nonnegative",
        ),
        sa.UniqueConstraint(
            "owner_subject",
            "idempotency_key",
            name="uq_orders_owner_idempotency_key",
        ),
    )
    op.create_index("ix_orders_owner_subject", "orders", ["owner_subject"])
    op.create_table(
        "order_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=True),
        sa.Column("product_name", sa.String(length=32), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("line_total", sa.Numeric(precision=16, scale=2), nullable=False),
        sa.CheckConstraint(
            "quantity BETWEEN 1 AND 999999",
            name="ck_order_items_quantity_range",
        ),
        sa.CheckConstraint(
            "unit_price >= 0.01 AND unit_price <= 999999.99",
            name="ck_order_items_unit_price_range",
        ),
        sa.CheckConstraint(
            "line_total >= 0",
            name="ck_order_items_line_total_nonnegative",
        ),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"])
    op.create_index("ix_order_items_product_id", "order_items", ["product_id"])


def downgrade() -> None:
    op.drop_index("ix_order_items_product_id", table_name="order_items")
    op.drop_index("ix_order_items_order_id", table_name="order_items")
    op.drop_table("order_items")
    op.drop_index("ix_orders_owner_subject", table_name="orders")
    op.drop_table("orders")
