from __future__ import annotations

from enum import StrEnum


class TripVisibility(StrEnum):
    PRIVATE = "private"
    LINK = "link"
    PUBLIC = "public"


class MemberRole(StrEnum):
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class WaypointSource(StrEnum):
    GPS = "gps"
    IMPORT = "import"
    MANUAL = "manual"


class PositionSource(StrEnum):
    """Where a photo's position came from – shown in the UI so a guessed
    location is never mistaken for a measured one."""

    EXIF = "exif"
    INTERPOLATED = "interpolated"
    MANUAL = "manual"
    NONE = "none"
