"""Add buyer cancellation audit actions."""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "0013_buyer_cancellation"
down_revision: str | None = "0012_order_fulfillments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ORDER_ACTIONS = (
    "'created', 'payment_succeeded', 'payment_failed', 'payment_cancelled', "
    "'payment_expired', 'admin_status_changed', 'admin_refund', 'legacy_import', "
    "'fulfillment_status_changed'"
)
FULFILLMENT_ACTIONS = (
    "'created', 'payment_succeeded', 'payment_failed', 'payment_cancelled', "
    "'payment_expired', 'seller_status_changed', 'admin_status_changed', "
    "'admin_refund', 'legacy_import'"
)


def _set_constraints(buyer_action: bool) -> None:
    suffix = ", 'buyer_cancelled'" if buyer_action else ""
    for table, constraint, actions in (
        ("order_status_events", "ck_order_status_events_action", ORDER_ACTIONS),
        ("order_fulfillment_events", "ck_order_fulfillment_events_action", FULFILLMENT_ACTIONS),
    ):
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_constraint(constraint, type_="check")
            batch_op.create_check_constraint(constraint, f"action IN ({actions}{suffix})")


def upgrade() -> None:
    _set_constraints(True)


def downgrade() -> None:
    connection = op.get_bind()
    for table in ("order_status_events", "order_fulfillment_events"):
        if connection.execute(
            text(f"SELECT 1 FROM {table} WHERE action = 'buyer_cancelled' LIMIT 1")
        ).first():
            raise RuntimeError("Cannot downgrade while buyer cancellation audit records exist.")
    _set_constraints(False)
