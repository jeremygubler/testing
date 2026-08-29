from __future__ import annotations

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

import app.models  # noqa: F401  registers every table on Base.metadata
from alembic import context
from app.core.config import get_settings
from app.db.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata


# The postgis image installs postgis_tiger_geocoder and postgis_topology and puts
# their schemas on the search_path. Postgres reports every table on the search_path
# as "visible", so autogenerate reflects a few hundred tiger tables and proposes to
# drop them. Pinning the search_path is the fix; the name list covers the PostGIS
# objects that live in public itself.
POSTGIS_SCHEMAS = {"tiger", "tiger_data", "topology"}
POSTGIS_TABLES = {
    "spatial_ref_sys",
    "geography_columns",
    "geometry_columns",
    "raster_columns",
    "raster_overviews",
}


def include_object(obj, name, type_, reflected, compare_to) -> bool:  # type: ignore[no-untyped-def]
    if getattr(obj, "schema", None) in POSTGIS_SCHEMAS:
        return False
    if type_ == "table" and name in POSTGIS_TABLES:
        return False
    # GeoAlchemy2/PostGIS create spatial indexes named idx_*; ours are all ix_*.
    if type_ == "index" and reflected and compare_to is None and (name or "").startswith("idx_"):
        return False
    return True


def include_name(name, type_, parent_names) -> bool:  # type: ignore[no-untyped-def]
    if type_ == "schema":
        return name in (None, "public")
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=settings.sync_database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=include_object,
        include_name=include_name,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    connection.exec_driver_sql("SET search_path TO public")
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        include_object=include_object,
        include_name=include_name,
        include_schemas=False,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_async_migrations())
