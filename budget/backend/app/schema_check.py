"""Prueft beim Start, ob die Datenbank zum Code passt.

Ohne das meldet eine veraltete Datenbank sich als Wand aus 500ern mit einem
SQLAlchemy-Stacktrace ("no such column: txn.counter_account_id") -- richtig, aber
unbrauchbar fuer jemanden, der nur vergessen hat, die Migration laufen zu lassen.
Besser einmal beim Start klar sagen, was zu tun ist.
"""

from __future__ import annotations

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

_BACKEND_ROOT = Path(__file__).resolve().parent.parent

UPGRADE_HINT = (
    "Die Datenbank ist nicht auf dem Stand des Codes.\n"
    "  Erwartet: {head}\n"
    "  Gefunden: {current}\n"
    "Bitte im Ordner 'backend' die Migrationen ausfuehren:\n"
    "  alembic upgrade head"
)


def head_revision() -> str | None:
    """Die neueste Revision der Migrationsskripte, oder None wenn keine da sind."""
    config = Config(str(_BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(_BACKEND_ROOT / "alembic"))
    return ScriptDirectory.from_config(config).get_current_head()


def current_revision(engine: Engine) -> str | None:
    """Die Revision, auf der die Datenbank steht -- None, wenn Alembic sie nie sah."""
    if not inspect(engine).has_table("alembic_version"):
        return None
    with engine.connect() as conn:
        return conn.scalar(text("SELECT version_num FROM alembic_version"))


def schema_problem(engine: Engine) -> str | None:
    """Beschreibt das Problem, oder None wenn alles passt.

    Drei Faelle werden bewusst durchgelassen:

    * Eine ganz leere Datenbank -- die richtet sich beim ersten Start selbst ein.
    * Eine Datenbank ohne ``alembic_version``, aber mit Tabellen: die stammt aus
      ``Base.metadata.create_all`` (Tests, ``seed.py --reset``) und passt damit
      per Konstruktion zum Code.
    * Ein Projekt ohne Migrationsskripte.
    """
    head = head_revision()
    if head is None:
        return None

    tables = set(inspect(engine).get_table_names()) - {"alembic_version"}
    if not tables:
        return None

    current = current_revision(engine)
    if current is None or current == head:
        return None
    return UPGRADE_HINT.format(head=head, current=current)
