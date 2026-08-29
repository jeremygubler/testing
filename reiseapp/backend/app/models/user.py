from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.trip import Trip, TripMember


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    # Stored lowercased (normalised in the service layer) so the unique index
    # is effectively case-insensitive without needing citext.
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    owned_trips: Mapped[list[Trip]] = relationship(
        back_populates="owner", foreign_keys="Trip.owner_id"
    )
    memberships: Mapped[list[TripMember]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
