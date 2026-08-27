from logging.config import fileConfig

import app.ddl
import app.models  # noqa: F401  registriert alle Tabellen an Base.metadata
from alembic import context
from app.config import get_settings
from app.db import Base, engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().database_url)
target_metadata = Base.metadata

#: Diese Indizes stehen in app/ddl.py, nicht in der Metadata -- sie sind partiell
#: bzw. gehoeren zu den Triggern. Ohne diese Ausnahme meldet "alembic check" sie
#: bei jedem Lauf als Abweichung.
_DDL_MANAGED_INDEXES = {
    "uq_budget_default",
    "uq_budget_month",
    "ix_txn_household_date",
    "ix_settlement_period",
}


def include_object(obj, name, type_, reflected, compare_to):
    """Indizes aus ``ddl.py`` sind nicht Sache der Autogenerierung.

    Sonst schlaegt ``alembic revision --autogenerate`` bei jedem Lauf vor, sie zu
    loeschen -- die Metadata kennt sie nicht, die Datenbank schon.
    """
    del obj, reflected, compare_to
    return not (type_ == "index" and name in _DDL_MANAGED_INDEXES)


def run_migrations_offline() -> None:
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,
        include_object=include_object,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
