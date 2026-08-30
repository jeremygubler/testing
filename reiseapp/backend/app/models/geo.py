from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from geoalchemy2 import Geography
from sqlalchemy import DateTime, Enum, Float, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, FieldStampMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import WaypointSource

if TYPE_CHECKING:
    from app.models.journal import JournalEntry
    from app.models.media import Photo
    from app.models.trip import Trip

def point_geography() -> Geography:
    """geography(Point, 4326): metres-based ST_Distance / ST_Length out of the box, so
    route length is a query, not a stored (and drift-prone) column.

    A *fresh* instance per column on purpose: GeoAlchemy2's DDL listener writes the
    column's nullability back onto the type object, so a shared instance leaks
    NOT NULL from one table into the next.
    """
    return Geography(geometry_type="POINT", srid=4326, spatial_index=False)


class Waypoint(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A single tracked position. High volume – keep it narrow."""

    __tablename__ = "waypoints"
    __table_args__ = (
        Index("ix_waypoints_trip_id_recorded_at", "trip_id", "recorded_at"),
        Index("ix_waypoints_geom", "geom", postgresql_using="gist"),
    )

    trip_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    geom: Mapped[str] = mapped_column(point_geography(), nullable=False)
    altitude_m: Mapped[float | None] = mapped_column(Float, default=None)
    accuracy_m: Mapped[float | None] = mapped_column(Float, default=None)
    speed_mps: Mapped[float | None] = mapped_column(Float, default=None)
    heading_deg: Mapped[float | None] = mapped_column(Float, default=None)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[WaypointSource] = mapped_column(
        Enum(WaypointSource, native_enum=False, length=16, validate_strings=True),
        nullable=False,
        default=WaypointSource.GPS,
    )
    # Which device produced the point – lets a collaborative trip separate tracks.
    device_id: Mapped[str | None] = mapped_column(String(64), default=None)

    trip: Mapped[Trip] = relationship(back_populates="waypoints")


class Stop(UUIDPrimaryKeyMixin, TimestampMixin, FieldStampMixin, Base):
    """A named place/leg on the trip – the timeline is built from these."""

    __tablename__ = "stops"
    __table_args__ = (
        Index("ix_stops_trip_id_arrived_at", "trip_id", "arrived_at"),
        Index("ix_stops_geom", "geom", postgresql_using="gist"),
    )

    trip_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    geom: Mapped[str] = mapped_column(point_geography(), nullable=False)
    altitude_m: Mapped[float | None] = mapped_column(Float, default=None)
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    country: Mapped[str | None] = mapped_column(String(2), default=None)
    locality: Mapped[str | None] = mapped_column(String(200), default=None)
    notes: Mapped[str | None] = mapped_column(Text, default=None)

    trip: Mapped[Trip] = relationship(back_populates="stops")
    photos: Mapped[list[Photo]] = relationship(back_populates="stop")
    journal_entries: Mapped[list[JournalEntry]] = relationship(back_populates="stop")
