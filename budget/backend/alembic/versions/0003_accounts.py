"""accounts and transfers

Konten statt eines einzigen Startsaldos, und Umbuchungen zwischen ihnen.

Datenmigration
--------------
* Je Haushalt entsteht ein Konto "Hauptkonto" mit dem bisherigen Startsaldo.
  Alle bestehenden Buchungen laufen darueber.
* Gibt es Buchungen in Kategorien der Gruppe SPAREN, entsteht zusaetzlich ein
  Konto "Sparkonto", und diese Buchungen werden zu Umbuchungen dorthin. Damit
  sind sie keine Ausgaben mehr, sondern Geld, das den Topf gewechselt hat.
* ``household.opening_balance_minor`` entfaellt -- der Wert lebt jetzt im Konto.
  Zwei Quellen fuer denselben Kontostand waeren genau der Fehler, den dieses
  Projekt sonst vermeidet.

Rueckwaerts ist die Uebersetzung notgedrungen unscharf: ein einzelner Startsaldo
kann mehrere Konten nicht abbilden, deshalb werden sie aufsummiert. Kein Geld geht
verloren, aber die Aufteilung auf die Konten schon -- ein erneutes Upgrade legt
alles aufs Hauptkonto.

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa
from alembic import op

from app import ddl

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Muss VOR dem ersten Schreibzugriff stehen: sobald eine Transaktion offen ist,
    # ist dieses PRAGMA in SQLite wirkungslos. Ohne es kaskadiert das Neuanlegen von
    # txn weiter unten auf txn_split und loescht saemtliche Aufteilungen.
    conn.execute(sa.text("PRAGMA foreign_keys=OFF"))
    splits_before = conn.execute(sa.text("SELECT COUNT(*) FROM txn_split")).scalar_one()

    op.create_table(
        "account",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("household_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("opening_balance_minor", sa.Integer(), nullable=False),
        sa.Column("color", sa.String(length=9), nullable=False),
        sa.Column("include_in_available", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["household_id"], ["household.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("household_id", "name", name="uq_account_household_name"),
    )
    op.create_index("ix_account_household_id", "account", ["household_id"])

    op.add_column("txn", sa.Column("account_id", sa.Integer(), nullable=True))
    op.add_column("txn", sa.Column("counter_account_id", sa.Integer(), nullable=True))

    for household_id, opening in conn.execute(
        sa.text("SELECT id, opening_balance_minor FROM household")
    ).all():
        main_id = conn.execute(
            sa.text(
                "INSERT INTO account (household_id, name, kind, opening_balance_minor,"
                " color, include_in_available, is_active, sort_order)"
                " VALUES (:hid, 'Hauptkonto', 'CHECKING', :opening, '#1e3a5f', 1, 1, 0)"
                " RETURNING id"
            ),
            {"hid": household_id, "opening": opening or 0},
        ).scalar_one()
        conn.execute(
            sa.text("UPDATE txn SET account_id = :aid WHERE household_id = :hid"),
            {"aid": main_id, "hid": household_id},
        )

        savings_count = conn.execute(
            sa.text(
                "SELECT COUNT(*) FROM txn JOIN category ON category.id = txn.category_id"
                " WHERE txn.household_id = :hid AND category.grp = 'SPAREN'"
            ),
            {"hid": household_id},
        ).scalar_one()
        if savings_count:
            savings_id = conn.execute(
                sa.text(
                    "INSERT INTO account (household_id, name, kind, opening_balance_minor,"
                    " color, include_in_available, is_active, sort_order)"
                    " VALUES (:hid, 'Sparkonto', 'SAVINGS', 0, '#166534', 0, 1, 1)"
                    " RETURNING id"
                ),
                {"hid": household_id},
            ).scalar_one()
            conn.execute(
                sa.text(
                    "UPDATE txn SET counter_account_id = :aid WHERE household_id = :hid"
                    " AND category_id IN (SELECT id FROM category WHERE grp = 'SPAREN')"
                ),
                {"aid": savings_id, "hid": household_id},
            )

    # Die Trigger haengen an txn und wuerden beim Neuaufbau der Tabelle verschwinden.
    # Ausserdem lehnt trg_txn_bi_amount das Kopieren der Zeilen ab, weil amount_minor
    # dabei nicht 0 ist. Also vorher abraeumen und danach neu anlegen.
    ddl.uninstall(conn)
    with op.batch_alter_table("txn", recreate="always") as batch:
        batch.alter_column("account_id", existing_type=sa.Integer(), nullable=False)
        batch.create_foreign_key(
            "fk_txn_account", "account", ["account_id"], ["id"], ondelete="RESTRICT"
        )
        batch.create_foreign_key(
            "fk_txn_counter_account", "account", ["counter_account_id"], ["id"], ondelete="RESTRICT"
        )
        batch.create_check_constraint(
            "ck_txn_transfer_distinct_accounts",
            "counter_account_id IS NULL OR counter_account_id <> account_id",
        )
    ddl.install(conn)

    # Guertel und Hosentraeger: waere beim Neuaufbau der Tabelle doch etwas
    # weggekaskadiert, bricht die Migration ab, statt stillschweigend Daten zu verlieren.
    splits_after = conn.execute(sa.text("SELECT COUNT(*) FROM txn_split")).scalar_one()
    if splits_after != splits_before:
        raise RuntimeError(
            f"Migration 0003 haette Aufteilungen verloren: {splits_before} -> {splits_after}"
        )

    op.create_index("ix_txn_account_id", "txn", ["account_id"])
    op.create_index("ix_txn_counter_account_id", "txn", ["counter_account_id"])

    # Der Startsaldo lebt jetzt im Konto.
    op.drop_column("household", "opening_balance_minor")
    conn.execute(sa.text("PRAGMA foreign_keys=ON"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("PRAGMA foreign_keys=OFF"))
    splits_before = conn.execute(sa.text("SELECT COUNT(*) FROM txn_split")).scalar_one()

    op.add_column(
        "household",
        sa.Column("opening_balance_minor", sa.Integer(), nullable=False, server_default="0"),
    )
    # Den Startsaldo aus den Konten zurueckholen.
    conn.execute(
        sa.text(
            "UPDATE household SET opening_balance_minor = COALESCE("
            " (SELECT SUM(opening_balance_minor) FROM account WHERE account.household_id ="
            " household.id), 0)"
        )
    )

    op.drop_index("ix_txn_counter_account_id", table_name="txn")
    op.drop_index("ix_txn_account_id", table_name="txn")

    ddl.uninstall(conn)
    with op.batch_alter_table("txn", recreate="always") as batch:
        # Muss vor den Spalten weg -- sonst verweist die Bedingung ins Leere.
        batch.drop_constraint("ck_txn_transfer_distinct_accounts", type_="check")
        batch.drop_column("counter_account_id")
        batch.drop_column("account_id")
    ddl.install(conn)

    splits_after = conn.execute(sa.text("SELECT COUNT(*) FROM txn_split")).scalar_one()
    if splits_after != splits_before:
        raise RuntimeError(
            f"Downgrade 0003 haette Aufteilungen verloren: {splits_before} -> {splits_after}"
        )

    op.drop_index("ix_account_household_id", table_name="account")
    op.drop_table("account")
    conn.execute(sa.text("PRAGMA foreign_keys=ON"))
