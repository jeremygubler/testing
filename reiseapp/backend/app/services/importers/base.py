from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

from app.core.errors import AppError


class ImportFormat(StrEnum):
    GPX = "gpx"
    ZUGVOGEL = "zugvogel"
    POLARSTEPS = "polarsteps"
    GOOGLE_TIMELINE = "google_timeline"


# Our own dumps carry this marker. "reiseapp/trip" is what the app wrote before
# it had its name, and files on disk outlive a rename — a dump someone exported
# last week has to keep importing.
OWN_FORMAT_MARKERS = frozenset({"zugvogel/trip", "reiseapp/trip"})


@dataclass
class ImportedWaypoint:
    lat: float
    lon: float
    recorded_at: datetime
    altitude_m: float | None = None
    accuracy_m: float | None = None


@dataclass
class ImportedStop:
    name: str
    lat: float
    lon: float
    arrived_at: datetime | None = None
    left_at: datetime | None = None
    country: str | None = None
    notes: str | None = None


@dataclass
class ImportedPhoto:
    """Only ever a reference: the bytes are uploaded separately."""

    filename: str
    taken_at: datetime | None = None
    lat: float | None = None
    lon: float | None = None


@dataclass
class ImportedJournalEntry:
    timestamp: datetime
    title: str | None = None
    text: str = ""


@dataclass
class ImportedTrip:
    title: str | None = None
    description: str | None = None
    waypoints: list[ImportedWaypoint] = field(default_factory=list)
    stops: list[ImportedStop] = field(default_factory=list)
    entries: list[ImportedJournalEntry] = field(default_factory=list)
    photos: list[ImportedPhoto] = field(default_factory=list)
    #: Anything the file contained that we could not use, reported to the user
    #: rather than silently dropped.
    warnings: list[str] = field(default_factory=list)


def detect_format(data: bytes) -> ImportFormat:
    head = data[:512].lstrip()

    if head.startswith(b"PK\x03\x04"):
        # Polarsteps hands out a zip; nothing else we read does.
        return ImportFormat.POLARSTEPS
    if head.startswith(b"<"):
        if b"<gpx" in data[:4096].lower():
            return ImportFormat.GPX
        raise AppError("XML file that is not GPX")

    try:
        payload = json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AppError("Unrecognised file – expected GPX, JSON or a Polarsteps zip") from exc

    if isinstance(payload, dict):
        if payload.get("format") in OWN_FORMAT_MARKERS:
            return ImportFormat.ZUGVOGEL
        if "timelineObjects" in payload or "semanticSegments" in payload:
            return ImportFormat.GOOGLE_TIMELINE
        if "locations" in payload:
            return ImportFormat.GOOGLE_TIMELINE
        if "all_steps" in payload or "trip" in payload:
            return ImportFormat.POLARSTEPS
    if isinstance(payload, list):
        return ImportFormat.GOOGLE_TIMELINE

    raise AppError("Could not tell what kind of file this is")


def valid_coordinates(lat: float | None, lon: float | None) -> bool:
    if lat is None or lon is None:
        return False
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return False
    # 0/0 in an export means "no fix", not the Gulf of Guinea.
    return not (lat == 0 and lon == 0)
