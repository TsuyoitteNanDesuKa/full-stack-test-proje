"""Add buyer product reviews."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_product_reviews"
down_revision: str | None = "0014_favorites"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "product_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("owner_subject", sa.String(length=255), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.String(length=1000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_product_reviews_rating"),
        sa.CheckConstraint(
            "length(comment) BETWEEN 10 AND 1000", name="ck_product_reviews_comment"
        ),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("product_id", "owner_subject", name="uq_product_reviews_product_owner"),
    )
    op.create_index("ix_product_reviews_product_id", "product_reviews", ["product_id"])


def downgrade() -> None:
    op.drop_index("ix_product_reviews_product_id", table_name="product_reviews")
    op.drop_table("product_reviews")
