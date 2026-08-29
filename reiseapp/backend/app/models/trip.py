from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Date, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import MemberRole, TripVisibility

if TYPE_CHECKING:
    from app.models.geo import Stop, Waypoint
    from app.models.journal import JournalEntry
    from app.models.media import Photo
    from app.models.user import User


class Trip(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "trips"

    owner_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    # Circular FK (photos.trip_id -> trips.id): created via ALTER after both tables exist.
    cover_photo_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("photos.id", ondelete="SET NULL", use_alter=True),
        default=None,
    )
    start_date: Mapped[date | None] = mapped_column(Date, default=None)
    end_date: Mapped[date | None] = mapped_column(Date, default=None)
    visibility: Mapped[TripVisibility] = mapped_column(
        Enum(TripVisibility, native_enum=False, length=16, validate_strings=True),
        nullable=False,
        default=TripVisibility.PRIVATE,
    )

    owner: Mapped[User] = relationship(back_populates="owned_trips", foreign_keys=[owner_id])
    members: Mapped[list[TripMember]] = relationship(
        back_populates="trip", cascade="all, delete-orphan"
    )
    waypoints: Mapped[list[Waypoint]] = relationship(
        back_populates="trip", cascade="all, delete-orphan"
    )
    stops: Mapped[list[Stop]] = relationship(back_populates="trip", cascade="all, delete-orphan")
    photos: Mapped[list[Photo]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", foreign_keys="Photo.trip_id"
    )
    journal_entries: Mapped[list[JournalEntry]] = relationship(
        back_populates="trip", cascade="all, delete-orphan"
    )


class TripMember(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "trip_members"
    __table_args__ = (UniqueConstraint("trip_id", "user_id"),)

    trip_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[MemberRole] = mapped_column(
        Enum(MemberRole, native_enum=False, length=16, validate_strings=True),
        nullable=False,
        default=MemberRole.VIEWER,
    )

    trip: Mapped[Trip] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")
