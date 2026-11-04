"""Add seller applications and seller-owned products."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_seller_products"
down_revision: str | None = "0004_track_product_updates"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ACTIVE_STATUSES = (
    "'draft', 'submitted', 'under_review', 'changes_requested', 'approval_pending', 'approved'"
)


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("seller_subject", sa.String(length=255), nullable=True),
    )
    op.create_index("ix_products_seller_subject", "products", ["seller_subject"])
    op.create_table(
        "seller_applications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_subject", sa.String(length=255), nullable=False),
        sa.Column("applicant_type", sa.String(length=32), nullable=False),
        sa.Column("legal_name", sa.String(length=120), nullable=False),
        sa.Column("representative_name", sa.String(length=120), nullable=True),
        sa.Column("store_name", sa.String(length=64), nullable=False),
        sa.Column("store_name_key", sa.String(length=128), nullable=False),
        sa.Column("contact_phone", sa.String(length=16), nullable=False),
        sa.Column("city", sa.String(length=80), nullable=False),
        sa.Column("district", sa.String(length=80), nullable=False),
        sa.Column("primary_category", sa.String(length=80), nullable=False),
        sa.Column("business_description", sa.String(length=1000), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("applicant_note", sa.String(length=500), nullable=True),
        sa.Column("admin_note", sa.String(length=1000), nullable=True),
        sa.Column("reviewer_subject", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "applicant_type IN ('individual', 'sole_proprietor', 'company')",
            name="ck_seller_applications_applicant_type",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted', 'under_review', 'changes_requested', "
            "'approval_pending', 'approved', 'rejected', 'withdrawn')",
            name="ck_seller_applications_status",
        ),
    )
    op.create_index(
        "ix_seller_applications_owner_subject",
        "seller_applications",
        ["owner_subject"],
    )
    active_owner = sa.text(f"status IN ({ACTIVE_STATUSES})")
    op.create_index(
        "uq_seller_applications_active_owner",
        "seller_applications",
        ["owner_subject"],
        unique=True,
        sqlite_where=active_owner,
        postgresql_where=active_owner,
    )
    store_owner = sa.text(
        "status IN ("
        "'draft', 'submitted', 'under_review', 'changes_requested', "
        "'approval_pending', 'approved')"
    )
    op.create_index(
        "uq_seller_applications_active_store_name",
        "seller_applications",
        ["store_name_key"],
        unique=True,
        sqlite_where=store_owner,
        postgresql_where=store_owner,
    )
    op.create_table(
        "seller_application_audit",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "application_id",
            sa.Integer(),
            sa.ForeignKey("seller_applications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("actor_subject", sa.String(length=255), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("from_status", sa.String(length=32), nullable=False),
        sa.Column("to_status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_seller_application_audit_application_id",
        "seller_application_audit",
        ["application_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_seller_application_audit_application_id",
        table_name="seller_application_audit",
    )
    op.drop_table("seller_application_audit")
    op.drop_index(
        "uq_seller_applications_active_store_name",
        table_name="seller_applications",
    )
    op.drop_index(
        "uq_seller_applications_active_owner",
        table_name="seller_applications",
    )
    op.drop_index(
        "ix_seller_applications_owner_subject",
        table_name="seller_applications",
    )
    op.drop_table("seller_applications")
    op.drop_index("ix_products_seller_subject", table_name="products")
    op.drop_column("products", "seller_subject")
