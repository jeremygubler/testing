from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import PositionSource
from app.models.geo import point_geography

if TYPE_CHECKING:
    from app.models.geo import Stop
    from app.models.trip import Trip


class Photo(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Object-storage pointer + EXIF facts. Originals are never re-encoded."""

    __tablename__ = "photos"
    __table_args__ = (
        Index("ix_photos_trip_id_taken_at", "trip_id", "taken_at"),
        Index("ix_photos_geom", "geom", postgresql_using="gist"),
    )

    trip_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    stop_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("stops.id", ondelete="SET NULL"), default=None, index=True
    )
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    # sha256 of the original bytes – dedupe + idempotent re-upload after a flaky sync.
    checksum_sha256: Mapped[str | None] = mapped_column(String(64), default=None, index=True)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False, default="image/jpeg")
    byte_size: Mapped[int | None] = mapped_column(BigInteger, default=None)
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    geom: Mapped[str | None] = mapped_column(point_geography(), nullable=True, default=None)
    altitude_m: Mapped[float | None] = mapped_column(default=None)
    width: Mapped[int | None] = mapped_column(Integer, default=None)
    height: Mapped[int | None] = mapped_column(Integer, default=None)
    caption: Mapped[str | None] = mapped_column(String(500), default=None)
    thumbnail_key: Mapped[str | None] = mapped_column(String(512), default=None)
    original_filename: Mapped[str | None] = mapped_column(String(255), default=None)
    position_source: Mapped[PositionSource] = mapped_column(
        Enum(PositionSource, native_enum=False, length=16, validate_strings=True),
        nullable=False,
        default=PositionSource.NONE,
    )

    trip: Mapped[Trip] = relationship(back_populates="photos", foreign_keys=[trip_id])
    stop: Mapped[Stop] = relationship(back_populates="photos")
