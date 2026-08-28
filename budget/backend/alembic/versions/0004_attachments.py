"""attachments

Belege zu Buchungen. Die Bytes liegen in der Datenbank -- siehe die Begruendung
am Modell ``Attachment``.

Reines Hinzufuegen: keine bestehende Tabelle wird angefasst, keine Daten werden
uebersetzt. Damit ist auch das Zurueckrollen verlustfrei bis auf die Belege selbst,
die es vor dieser Revision schlicht nicht gab.

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "attachment",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("txn_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("thumbnail", sa.LargeBinary(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["household_id"], ["household.id"], name="fk_attachment_household", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["txn_id"], ["txn.id"], name="fk_attachment_txn", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_attachment_household_id", "attachment", ["household_id"])
    op.create_index("ix_attachment_txn_id", "attachment", ["txn_id"])


def downgrade() -> None:
    op.drop_index("ix_attachment_txn_id", table_name="attachment")
    op.drop_index("ix_attachment_household_id", table_name="attachment")
    op.drop_table("attachment")
