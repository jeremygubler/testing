from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.trip import Trip


class ShareLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A read-only link to one trip.

    Only the SHA-256 of the token is stored: the link lives in URLs, chat
    histories and server logs, and a database dump should not hand out access to
    every trip anyone ever shared.
    """

    __tablename__ = "share_links"

    trip_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    label: Mapped[str | None] = mapped_column(String(120), default=None)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    #: Whether viewers may load the photos, not just the route and text.
    include_photos: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    view_count: Mapped[int] = mapped_column(default=0, nullable=False)
    last_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    trip: Mapped[Trip] = relationship()

    def is_usable(self, now: datetime) -> bool:
        if self.revoked_at is not None or self.deleted_at is not None:
            return False
        return self.expires_at is None or self.expires_at > now
