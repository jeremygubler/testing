"""Zusaetzliches DDL, das SQLAlchemy-Modelle nicht ausdruecken koennen.

Enthaelt die partiellen Unique-Indizes der Budget-Tabelle und die Trigger, die die
Konsistenz zwischen ``txn`` und ``txn_split`` **auf DB-Ebene** erzwingen:

* ``txn.amount_minor`` ist immer exakt die Summe der zugehoerigen Splits.
* Ein direkter Schreibzugriff auf ``txn.amount_minor`` wird abgelehnt.
* Die Splits einer Buchung duerfen keine gemischten Vorzeichen haben, sonst waere
  der Gesamtbetrag mehrdeutig.

Dieselben Statements werden von Alembic (Migration 0001) und von
``Base.metadata.create_all`` (Tests) verwendet.
"""

from sqlalchemy import event, text
from sqlalchemy.engine import Connection

from app.db import Base

_SIGN_GUARD = (
    "SELECT RAISE(ABORT, 'txn_split: Splits einer Buchung duerfen keine gemischten "
    "Vorzeichen haben') WHERE EXISTS (SELECT 1 FROM txn_split WHERE txn_id = {ref} "
    "AND amount_minor > 0) AND EXISTS (SELECT 1 FROM txn_split WHERE txn_id = {ref} "
    "AND amount_minor < 0);"
)

_RECALC = (
    "UPDATE txn SET amount_minor = (SELECT COALESCE(SUM(amount_minor), 0) FROM txn_split "
    "WHERE txn_id = {ref}) WHERE id = {ref};"
)

STATEMENTS: tuple[str, ...] = (
    # --- Budget: ein Default je Kategorie, ein Monatsbudget je (Kategorie, Jahr, Monat)
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_default"
    " ON budget (category_id) WHERE is_default = 1",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_month"
    " ON budget (category_id, year, month) WHERE is_default = 0",
    "CREATE INDEX IF NOT EXISTS ix_txn_household_date ON txn (household_id, date)",
    # --- abgeleiteter Betrag: darf nicht von aussen gesetzt werden
    "CREATE TRIGGER IF NOT EXISTS trg_txn_bi_amount BEFORE INSERT ON txn BEGIN"
    " SELECT RAISE(ABORT, 'txn.amount_minor ist abgeleitet und wird aus den Splits"
    " berechnet') WHERE NEW.amount_minor <> 0;"
    " END",
    "CREATE TRIGGER IF NOT EXISTS trg_txn_au_amount AFTER UPDATE OF amount_minor ON txn BEGIN"
    " SELECT RAISE(ABORT, 'txn.amount_minor ist abgeleitet (Summe der Splits)')"
    " WHERE NEW.amount_minor <> (SELECT COALESCE(SUM(amount_minor), 0) FROM txn_split"
    " WHERE txn_id = NEW.id);"
    " END",
    # --- Split -> Summe pflegen und Vorzeichen pruefen
    "CREATE TRIGGER IF NOT EXISTS trg_txn_split_ai AFTER INSERT ON txn_split BEGIN "
    + _SIGN_GUARD.format(ref="NEW.txn_id")
    + " "
    + _RECALC.format(ref="NEW.txn_id")
    + " END",
    "CREATE TRIGGER IF NOT EXISTS trg_txn_split_au AFTER UPDATE ON txn_split BEGIN "
    + _SIGN_GUARD.format(ref="NEW.txn_id")
    + " "
    + _RECALC.format(ref="NEW.txn_id")
    + " "
    + _RECALC.format(ref="OLD.txn_id")
    + " END",
    "CREATE TRIGGER IF NOT EXISTS trg_txn_split_ad AFTER DELETE ON txn_split BEGIN "
    + _RECALC.format(ref="OLD.txn_id")
    + " END",
)

DROP_STATEMENTS: tuple[str, ...] = (
    "DROP TRIGGER IF EXISTS trg_txn_split_ad",
    "DROP TRIGGER IF EXISTS trg_txn_split_au",
    "DROP TRIGGER IF EXISTS trg_txn_split_ai",
    "DROP TRIGGER IF EXISTS trg_txn_au_amount",
    "DROP TRIGGER IF EXISTS trg_txn_bi_amount",
    "DROP INDEX IF EXISTS ix_txn_household_date",
    "DROP INDEX IF EXISTS uq_budget_month",
    "DROP INDEX IF EXISTS uq_budget_default",
)


def install(connection: Connection) -> None:
    for statement in STATEMENTS:
        connection.execute(text(statement))


def uninstall(connection: Connection) -> None:
    for statement in DROP_STATEMENTS:
        connection.execute(text(statement))


@event.listens_for(Base.metadata, "after_create")
def _after_create(_target, connection: Connection, **_kw) -> None:
    install(connection)
