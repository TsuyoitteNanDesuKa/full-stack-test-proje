"""Add order lifecycle statuses and audit history."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_order_lifecycle"
down_revision: str | None = "0008_payments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("orders") as batch_op:
        batch_op.drop_constraint("ck_orders_status", type_="check")
        batch_op.create_check_constraint(
            "ck_orders_status",
            "status IN ('pending_payment', 'paid', 'processing', 'shipped', "
            "'delivered', 'cancelled')",
        )

    with op.batch_alter_table("payments") as batch_op:
        batch_op.drop_constraint("ck_payments_status", type_="check")
        batch_op.create_check_constraint(
            "ck_payments_status",
            "status IN ('pending', 'succeeded', 'failed', 'cancelled', 'expired', 'refunded')",
        )

    op.create_table(
        "order_status_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("actor_subject", sa.String(length=255), nullable=True),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("from_status", sa.String(length=32), nullable=True),
        sa.Column("to_status", sa.String(length=32), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "action IN ('created', 'payment_succeeded', 'payment_failed', "
            "'payment_cancelled', 'payment_expired', 'admin_status_changed', "
            "'admin_refund', 'legacy_import')",
            name="ck_order_status_events_action",
        ),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_order_status_events_order_id", "order_status_events", ["order_id"])
    op.execute(
        sa.text(
            "INSERT INTO order_status_events "
            "(order_id, actor_subject, action, from_status, to_status, reason, created_at) "
            "SELECT id, NULL, 'legacy_import', NULL, status, NULL, created_at FROM orders"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_order_status_events_order_id", table_name="order_status_events")
    op.drop_table("order_status_events")
    op.execute(
        sa.text(
            "UPDATE orders SET status = 'paid' "
            "WHERE status IN ('processing', 'shipped', 'delivered')"
        )
    )
    op.execute(sa.text("UPDATE payments SET status = 'succeeded' WHERE status = 'refunded'"))

    with op.batch_alter_table("payments") as batch_op:
        batch_op.drop_constraint("ck_payments_status", type_="check")
        batch_op.create_check_constraint(
            "ck_payments_status",
            "status IN ('pending', 'succeeded', 'failed', 'cancelled', 'expired')",
        )

    with op.batch_alter_table("orders") as batch_op:
        batch_op.drop_constraint("ck_orders_status", type_="check")
        batch_op.create_check_constraint(
            "ck_orders_status",
            "status IN ('pending_payment', 'paid', 'cancelled')",
        )
