"""Add seller-scoped order fulfillments."""

from collections import defaultdict
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_order_fulfillments"
down_revision: str | None = "0011_addresses_delivery_snapshot"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "order_fulfillments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("seller_subject", sa.String(length=255), nullable=True),
        sa.Column("store_name", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending_payment', 'paid', 'processing', 'shipped', "
            "'delivered', 'cancelled')",
            name="ck_order_fulfillments_status",
        ),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_order_fulfillments_order_id", "order_fulfillments", ["order_id"])
    op.create_index(
        "ix_order_fulfillments_seller_subject",
        "order_fulfillments",
        ["seller_subject"],
    )
    op.create_index(
        "uq_order_fulfillments_order_seller",
        "order_fulfillments",
        ["order_id", "seller_subject"],
        unique=True,
        sqlite_where=sa.text("seller_subject IS NOT NULL"),
        postgresql_where=sa.text("seller_subject IS NOT NULL"),
    )
    op.create_index(
        "uq_order_fulfillments_order_platform",
        "order_fulfillments",
        ["order_id"],
        unique=True,
        sqlite_where=sa.text("seller_subject IS NULL"),
        postgresql_where=sa.text("seller_subject IS NULL"),
    )
    op.create_table(
        "order_fulfillment_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("fulfillment_id", sa.Integer(), nullable=False),
        sa.Column("actor_subject", sa.String(length=255), nullable=True),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("from_status", sa.String(length=32), nullable=True),
        sa.Column("to_status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "action IN ('created', 'payment_succeeded', 'payment_failed', 'payment_cancelled', "
            "'payment_expired', 'seller_status_changed', 'admin_status_changed', "
            "'admin_refund', 'legacy_import')",
            name="ck_order_fulfillment_events_action",
        ),
        sa.ForeignKeyConstraint(
            ["fulfillment_id"],
            ["order_fulfillments.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_order_fulfillment_events_fulfillment_id",
        "order_fulfillment_events",
        ["fulfillment_id"],
    )

    with op.batch_alter_table("order_items") as batch_op:
        batch_op.add_column(sa.Column("fulfillment_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_order_items_fulfillment_id_order_fulfillments",
            "order_fulfillments",
            ["fulfillment_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_order_items_fulfillment_id", ["fulfillment_id"])

    with op.batch_alter_table("order_status_events") as batch_op:
        batch_op.drop_constraint("ck_order_status_events_action", type_="check")
        batch_op.create_check_constraint(
            "ck_order_status_events_action",
            "action IN ('created', 'payment_succeeded', 'payment_failed', "
            "'payment_cancelled', 'payment_expired', 'admin_status_changed', "
            "'admin_refund', 'legacy_import', 'fulfillment_status_changed')",
        )

    connection = op.get_bind()
    orders = sa.table(
        "orders",
        sa.column("id", sa.Integer()),
        sa.column("status", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    products = sa.table(
        "products",
        sa.column("id", sa.Integer()),
        sa.column("seller_subject", sa.String()),
    )
    applications = sa.table(
        "seller_applications",
        sa.column("owner_subject", sa.String()),
        sa.column("store_name", sa.String()),
    )
    items = sa.table(
        "order_items",
        sa.column("id", sa.Integer()),
        sa.column("order_id", sa.Integer()),
        sa.column("product_id", sa.Integer()),
        sa.column("fulfillment_id", sa.Integer()),
    )
    fulfillment_table = sa.table(
        "order_fulfillments",
        sa.column("id", sa.Integer()),
        sa.column("order_id", sa.Integer()),
        sa.column("seller_subject", sa.String()),
        sa.column("store_name", sa.String()),
        sa.column("status", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    event_table = sa.table(
        "order_fulfillment_events",
        sa.column("fulfillment_id", sa.Integer()),
        sa.column("actor_subject", sa.String()),
        sa.column("action", sa.String()),
        sa.column("from_status", sa.String()),
        sa.column("to_status", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
    )
    product_owners = dict(
        connection.execute(sa.select(products.c.id, products.c.seller_subject)).all()
    )
    store_names = dict(
        connection.execute(
            sa.select(applications.c.owner_subject, applications.c.store_name).where(
                sa.text("status = 'approved'")
            )
        ).all()
    )
    items_by_order: dict[int, list[tuple[int, str | None]]] = defaultdict(list)
    for item_id, order_id, product_id in connection.execute(
        sa.select(items.c.id, items.c.order_id, items.c.product_id).order_by(items.c.id)
    ):
        seller_subject = product_owners.get(product_id) if product_id is not None else None
        items_by_order[order_id].append((item_id, seller_subject))

    for order_id, order_status, created_at in connection.execute(
        sa.select(orders.c.id, orders.c.status, orders.c.created_at).order_by(orders.c.id)
    ):
        grouped_items: dict[str | None, list[int]] = defaultdict(list)
        for item_id, seller_subject in items_by_order.get(order_id, []):
            grouped_items[seller_subject].append(item_id)
        if not grouped_items:
            grouped_items[None] = []
        for seller_subject, item_ids in grouped_items.items():
            store_name = store_names.get(seller_subject, "Liva") if seller_subject else "Liva"
            fulfillment_id = connection.execute(
                sa.insert(fulfillment_table)
                .values(
                    order_id=order_id,
                    seller_subject=seller_subject,
                    store_name=store_name,
                    status=order_status,
                    created_at=created_at,
                    updated_at=created_at,
                )
                .returning(fulfillment_table.c.id)
            ).scalar_one()
            if item_ids:
                connection.execute(
                    items.update()
                    .where(items.c.id.in_(item_ids))
                    .values(fulfillment_id=fulfillment_id)
                )
            connection.execute(
                sa.insert(event_table).values(
                    fulfillment_id=fulfillment_id,
                    actor_subject=None,
                    action="legacy_import",
                    from_status=None,
                    to_status=order_status,
                    created_at=created_at,
                )
            )


def downgrade() -> None:
    with op.batch_alter_table("order_status_events") as batch_op:
        batch_op.drop_constraint("ck_order_status_events_action", type_="check")
        batch_op.create_check_constraint(
            "ck_order_status_events_action",
            "action IN ('created', 'payment_succeeded', 'payment_failed', "
            "'payment_cancelled', 'payment_expired', 'admin_status_changed', "
            "'admin_refund', 'legacy_import')",
        )

    with op.batch_alter_table("order_items") as batch_op:
        batch_op.drop_index("ix_order_items_fulfillment_id")
        batch_op.drop_constraint(
            "fk_order_items_fulfillment_id_order_fulfillments",
            type_="foreignkey",
        )
        batch_op.drop_column("fulfillment_id")

    op.drop_index(
        "ix_order_fulfillment_events_fulfillment_id",
        table_name="order_fulfillment_events",
    )
    op.drop_table("order_fulfillment_events")
    op.drop_index("uq_order_fulfillments_order_platform", table_name="order_fulfillments")
    op.drop_index("uq_order_fulfillments_order_seller", table_name="order_fulfillments")
    op.drop_index("ix_order_fulfillments_seller_subject", table_name="order_fulfillments")
    op.drop_index("ix_order_fulfillments_order_id", table_name="order_fulfillments")
    op.drop_table("order_fulfillments")
