"""SQLAlchemy models. Importing this package registers every table on Base.metadata
(alembic autogenerate depends on that)."""

from app.models.enums import MemberRole, TripVisibility, WaypointSource
from app.models.geo import Stop, Waypoint
from app.models.journal import JournalEntry, JournalEntryPhoto
from app.models.media import Photo
from app.models.trip import Trip, TripMember
from app.models.user import User

__all__ = [
    "JournalEntry",
    "JournalEntryPhoto",
    "MemberRole",
    "Photo",
    "Stop",
    "Trip",
    "TripMember",
    "TripVisibility",
    "User",
    "Waypoint",
    "WaypointSource",
]
