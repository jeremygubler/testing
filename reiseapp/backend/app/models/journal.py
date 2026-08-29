from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.geo import Stop
    from app.models.media import Photo
    from app.models.trip import Trip


class JournalEntry(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "journal_entries"
    __table_args__ = (Index("ix_journal_entries_trip_id_timestamp", "trip_id", "timestamp"),)

    trip_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
    )
    stop_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("stops.id", ondelete="SET NULL"), default=None, index=True
    )
    author_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    title: Mapped[str | None] = mapped_column(String(200), default=None)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")

    trip: Mapped[Trip] = relationship(back_populates="journal_entries")
    stop: Mapped[Stop] = relationship(back_populates="journal_entries")
    photo_links: Mapped[list[JournalEntryPhoto]] = relationship(
        back_populates="entry",
        cascade="all, delete-orphan",
        order_by="JournalEntryPhoto.position",
    )


class JournalEntryPhoto(Base):
    """Ordered photo list of an entry. Explicit table because order matters."""

    __tablename__ = "journal_entry_photos"

    entry_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="CASCADE"),
        primary_key=True,
    )
    photo_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("photos.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    entry: Mapped[JournalEntry] = relationship(back_populates="photo_links")
    photo: Mapped[Photo] = relationship()
