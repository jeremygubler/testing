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
