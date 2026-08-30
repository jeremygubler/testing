"""photos: thumbnail, original filename, position provenance

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-30
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("photos", sa.Column("thumbnail_key", sa.String(length=512), nullable=True))
    op.add_column(
        "photos", sa.Column("original_filename", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "photos",
        sa.Column(
            "position_source",
            sa.Enum(
                "exif", "interpolated", "manual", "none",
                name="positionsource", native_enum=False, length=16,
            ),
            nullable=False,
            server_default="none",
        ),
    )


def downgrade() -> None:
    op.drop_column("photos", "position_source")
    op.drop_column("photos", "original_filename")
    op.drop_column("photos", "thumbnail_key")
