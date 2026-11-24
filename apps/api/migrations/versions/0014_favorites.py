"""Add buyer-owned product favorites."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_favorites"
down_revision: str | None = "0013_buyer_cancellation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "favorites",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_subject", sa.String(length=255), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("owner_subject", "product_id", name="uq_favorites_owner_product"),
    )
    op.create_index("ix_favorites_owner_subject", "favorites", ["owner_subject"])
    op.create_index("ix_favorites_product_id", "favorites", ["product_id"])


def downgrade() -> None:
    op.drop_index("ix_favorites_product_id", table_name="favorites")
    op.drop_index("ix_favorites_owner_subject", table_name="favorites")
    op.drop_table("favorites")
