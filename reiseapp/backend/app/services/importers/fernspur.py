from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from app.core.errors import AppError
from app.services.importers.base import (
    OWN_FORMAT_MARKERS,
    ImportedJournalEntry,
    ImportedStop,
    ImportedTrip,
    ImportedWaypoint,
    valid_coordinates,
)

SUPPORTED_VERSIONS = {1}


def _time(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def parse_fernspur_json(data: bytes) -> ImportedTrip:
    """Reads back our own export – the round trip that makes data ownership real."""
    try:
        payload = json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AppError("Not valid JSON") from exc
    if not isinstance(payload, dict) or payload.get("format") not in OWN_FORMAT_MARKERS:
        raise AppError("Not a Fernspur export")
    if payload.get("version") not in SUPPORTED_VERSIONS:
        raise AppError(f"Unsupported export version: {payload.get('version')}")

    source = payload.get("trip") or {}
    trip = ImportedTrip(title=source.get("title"), description=source.get("description"))

    for raw in payload.get("waypoints") or []:
        recorded_at = _time(raw.get("recorded_at"))
        if not valid_coordinates(raw.get("lat"), raw.get("lon")) or recorded_at is None:
            continue
        trip.waypoints.append(
            ImportedWaypoint(
                lat=raw["lat"],
                lon=raw["lon"],
                recorded_at=recorded_at,
                altitude_m=raw.get("altitude_m"),
                accuracy_m=raw.get("accuracy_m"),
            )
        )

    for raw in payload.get("stops") or []:
        if not valid_coordinates(raw.get("lat"), raw.get("lon")):
            continue
        trip.stops.append(
            ImportedStop(
                name=raw.get("name") or "Stop",
                lat=raw["lat"],
                lon=raw["lon"],
                arrived_at=_time(raw.get("arrived_at")),
                left_at=_time(raw.get("left_at")),
                country=raw.get("country"),
                notes=raw.get("notes"),
            )
        )

    for raw in payload.get("journal_entries") or []:
        timestamp = _time(raw.get("timestamp"))
        if timestamp is None:
            continue
        trip.entries.append(
            ImportedJournalEntry(
                timestamp=timestamp, title=raw.get("title"), text=raw.get("text") or ""
            )
        )

    photos = payload.get("photos") or []
    if photos:
        # The dump carries metadata, never bytes: the files are exported and
        # uploaded separately, so saying so beats a silent gap.
        trip.warnings.append(
            f"{len(photos)} Fotos sind im Export nur als Metadaten enthalten und werden "
            "nicht mit importiert"
        )
    return trip
