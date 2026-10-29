"""Track product updates separately from newly created products."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_track_product_updates"
down_revision: str | None = "0003_constrain_product_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("products", "updated_at")
