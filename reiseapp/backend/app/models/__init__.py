"""SQLAlchemy models. Importing this package registers every table on Base.metadata
(alembic autogenerate depends on that)."""

from app.models.auth import Invite, RefreshToken
from app.models.enums import MemberRole, PositionSource, TripVisibility, WaypointSource
from app.models.geo import Stop, Waypoint
from app.models.journal import JournalEntry, JournalEntryPhoto
from app.models.media import Photo
from app.models.share import ShareLink
from app.models.trip import Trip, TripMember
from app.models.user import User

__all__ = [
    "Invite",
    "JournalEntry",
    "JournalEntryPhoto",
    "MemberRole",
    "Photo",
    "PositionSource",
    "RefreshToken",
    "ShareLink",
    "Stop",
    "Trip",
    "TripMember",
    "TripVisibility",
    "User",
    "Waypoint",
    "WaypointSource",
]
