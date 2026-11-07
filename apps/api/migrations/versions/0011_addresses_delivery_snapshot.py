"""Add buyer address book and delivery snapshots to orders."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_addresses_delivery_snapshot"
down_revision: str | None = "0010_product_returns"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "customer_addresses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_subject", sa.String(length=255), nullable=False),
        sa.Column("label", sa.String(length=40), nullable=False),
        sa.Column("recipient_name", sa.String(length=120), nullable=False),
        sa.Column("phone", sa.String(length=16), nullable=False),
        sa.Column("city", sa.String(length=80), nullable=False),
        sa.Column("district", sa.String(length=80), nullable=False),
        sa.Column("address_line", sa.String(length=250), nullable=False),
        sa.Column("postal_code", sa.String(length=5), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(label) BETWEEN 1 AND 40",
            name="ck_customer_addresses_label_length",
        ),
        sa.CheckConstraint(
            "length(recipient_name) BETWEEN 2 AND 120",
            name="ck_customer_addresses_recipient_name_length",
        ),
        sa.CheckConstraint(
            "length(phone) BETWEEN 12 AND 16",
            name="ck_customer_addresses_phone_length",
        ),
        sa.CheckConstraint(
            "length(city) BETWEEN 2 AND 80",
            name="ck_customer_addresses_city_length",
        ),
        sa.CheckConstraint(
            "length(district) BETWEEN 2 AND 80",
            name="ck_customer_addresses_district_length",
        ),
        sa.CheckConstraint(
            "length(address_line) BETWEEN 5 AND 250",
            name="ck_customer_addresses_address_line_length",
        ),
        sa.CheckConstraint(
            "postal_code IS NULL OR length(postal_code) = 5",
            name="ck_customer_addresses_postal_code",
        ),
    )
    op.create_index(
        "ix_customer_addresses_owner_subject",
        "customer_addresses",
        ["owner_subject"],
    )
    op.create_index(
        "uq_customer_addresses_owner_default",
        "customer_addresses",
        ["owner_subject"],
        unique=True,
        sqlite_where=sa.text("is_default = 1"),
        postgresql_where=sa.text("is_default = true"),
    )

    with op.batch_alter_table("orders") as batch_op:
        batch_op.add_column(sa.Column("shipping_address_label", sa.String(length=40)))
        batch_op.add_column(sa.Column("shipping_recipient_name", sa.String(length=120)))
        batch_op.add_column(sa.Column("shipping_phone", sa.String(length=16)))
        batch_op.add_column(sa.Column("shipping_city", sa.String(length=80)))
        batch_op.add_column(sa.Column("shipping_district", sa.String(length=80)))
        batch_op.add_column(sa.Column("shipping_address_line", sa.String(length=250)))
        batch_op.add_column(sa.Column("shipping_postal_code", sa.String(length=5)))
        batch_op.add_column(sa.Column("delivery_method", sa.String(length=16)))
        batch_op.add_column(sa.Column("delivery_fee", sa.Numeric(precision=8, scale=2)))


def downgrade() -> None:
    with op.batch_alter_table("orders") as batch_op:
        batch_op.drop_column("delivery_fee")
        batch_op.drop_column("delivery_method")
        batch_op.drop_column("shipping_postal_code")
        batch_op.drop_column("shipping_address_line")
        batch_op.drop_column("shipping_district")
        batch_op.drop_column("shipping_city")
        batch_op.drop_column("shipping_phone")
        batch_op.drop_column("shipping_recipient_name")
        batch_op.drop_column("shipping_address_label")

    op.drop_index("uq_customer_addresses_owner_default", table_name="customer_addresses")
    op.drop_index("ix_customer_addresses_owner_subject", table_name="customer_addresses")
    op.drop_table("customer_addresses")
