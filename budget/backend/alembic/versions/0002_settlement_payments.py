"""settlement payments

Ausgleichszahlungen zwischen Personen festhalten, damit der Ausgleich ein Vorgang
wird und nicht nur eine Anzeige.

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "settlement_payment",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("from_member_id", sa.Integer(), nullable=False),
        sa.Column("to_member_id", sa.Integer(), nullable=False),
        sa.Column("amount_minor", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("period_year", sa.Integer(), nullable=True),
        sa.Column("period_month", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.CheckConstraint("amount_minor > 0", name="ck_settlement_amount_positive"),
        sa.CheckConstraint(
            "from_member_id <> to_member_id", name="ck_settlement_distinct_members"
        ),
        sa.CheckConstraint(
            "(period_year IS NULL AND period_month IS NULL)"
            " OR (period_year IS NOT NULL AND period_month IS NOT NULL)",
            name="ck_settlement_period_shape",
        ),
        sa.CheckConstraint(
            "period_month IS NULL OR (period_month BETWEEN 1 AND 12)",
            name="ck_settlement_period_month_range",
        ),
        sa.ForeignKeyConstraint(["household_id"], ["household.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["from_member_id"], ["member.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["to_member_id"], ["member.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_settlement_payment_household_id", "settlement_payment", ["household_id"])
    op.create_index("ix_settlement_payment_from_member_id", "settlement_payment", ["from_member_id"])
    op.create_index("ix_settlement_payment_to_member_id", "settlement_payment", ["to_member_id"])
    op.create_index("ix_settlement_payment_date", "settlement_payment", ["date"])
    # Zahlungen einer Periode werden bei jeder Ausgleichsberechnung gelesen.
    op.create_index(
        "ix_settlement_period", "settlement_payment", ["household_id", "period_year", "period_month"]
    )


def downgrade() -> None:
    op.drop_index("ix_settlement_period", table_name="settlement_payment")
    op.drop_index("ix_settlement_payment_date", table_name="settlement_payment")
    op.drop_index("ix_settlement_payment_to_member_id", table_name="settlement_payment")
    op.drop_index("ix_settlement_payment_from_member_id", table_name="settlement_payment")
    op.drop_index("ix_settlement_payment_household_id", table_name="settlement_payment")
    op.drop_table("settlement_payment")
