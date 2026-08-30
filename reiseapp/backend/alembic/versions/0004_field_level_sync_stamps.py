"""per-field timestamps for last-write-wins sync

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-30
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Only the entities two people can edit at once need field-level resolution.
# Waypoints are append-only and photos are written by whoever uploaded them.
_TABLES = ("trips", "stops", "journal_entries")


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(
            table,
            sa.Column(
                "field_updated_at",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
        )


def downgrade() -> None:
    for table in _TABLES:
        op.drop_column(table, "field_updated_at")
