"""Add idempotent local product returns."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_product_returns"
down_revision: str | None = "0009_order_lifecycle"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("payments") as batch_op:
        batch_op.drop_constraint("ck_payments_status", type_="check")
        batch_op.create_check_constraint(
            "ck_payments_status",
            "status IN ('pending', 'succeeded', 'failed', 'cancelled', 'expired', "
            "'partially_refunded', 'refunded')",
        )

    op.create_table(
        "product_returns",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("order_item_id", sa.Integer(), nullable=False),
        sa.Column("owner_subject", sa.String(length=255), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("refund_amount", sa.Numeric(precision=16, scale=2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "quantity BETWEEN 1 AND 999999",
            name="ck_product_returns_quantity_range",
        ),
        sa.CheckConstraint(
            "status = 'approved'",
            name="ck_product_returns_status",
        ),
        sa.CheckConstraint(
            "refund_amount > 0",
            name="ck_product_returns_refund_amount_positive",
        ),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_item_id"], ["order_items.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "owner_subject",
            "idempotency_key",
            name="uq_product_returns_owner_idempotency_key",
        ),
    )
    op.create_index("ix_product_returns_order_id", "product_returns", ["order_id"])
    op.create_index("ix_product_returns_order_item_id", "product_returns", ["order_item_id"])
    op.create_index("ix_product_returns_owner_subject", "product_returns", ["owner_subject"])


def downgrade() -> None:
    op.drop_index("ix_product_returns_owner_subject", table_name="product_returns")
    op.drop_index("ix_product_returns_order_item_id", table_name="product_returns")
    op.drop_index("ix_product_returns_order_id", table_name="product_returns")
    op.drop_table("product_returns")
    op.execute(
        sa.text("UPDATE payments SET status = 'succeeded' WHERE status = 'partially_refunded'")
    )

    with op.batch_alter_table("payments") as batch_op:
        batch_op.drop_constraint("ck_payments_status", type_="check")
        batch_op.create_check_constraint(
            "ck_payments_status",
            "status IN ('pending', 'succeeded', 'failed', 'cancelled', 'expired', 'refunded')",
        )
