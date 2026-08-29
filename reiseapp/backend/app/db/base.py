from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Deterministic constraint names – alembic autogenerate needs them to emit
# drop/alter statements that actually match what is in the database.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)

    # Fetch server-side defaults with RETURNING on UPDATE too, not only on INSERT.
    # Without this, `updated_at` (onupdate=now()) is expired after a flush and any
    # later read of it triggers a lazy refresh — which in async code raises
    # MissingGreenlet instead of loading the value.
    __mapper_args__ = {"eager_defaults": True}


class UUIDPrimaryKeyMixin:
    """Client-generated UUIDs.

    Offline-first: the mobile app creates rows without a server round-trip, so the
    id has to be assignable on the device and still be globally unique.
    """

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


class TimestampMixin:
    """created/updated/deleted – `updated_at` and `deleted_at` drive the sync protocol."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        index=True,
    )
    # Soft delete: a hard DELETE cannot be replicated to a client that is offline.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
