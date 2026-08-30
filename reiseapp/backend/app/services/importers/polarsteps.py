"""Polarsteps export.

The format is not documented; this reads the structure their export has been
observed to use. Anything unexpected is reported as a warning rather than
guessed at, and the shape is deliberately forgiving: keys have moved between
versions of their exporter.
"""

from __future__ import annotations

import json
import zipfile
from datetime import UTC, datetime
from io import BytesIO
from typing import Any

from app.core.errors import AppError
from app.services.importers.base import (
    ImportedJournalEntry,
    ImportedStop,
    ImportedTrip,
    ImportedWaypoint,
    valid_coordinates,
)

_TRIP_NAMES = ("trip.json", "trip_data.json")
_LOCATION_NAMES = ("locations.json", "location_data.json")


def _epoch(value: Any) -> datetime | None:
    """Polarsteps writes unix seconds, sometimes as float, sometimes as string."""
    try:
        seconds = float(value)
    except (TypeError, ValueError):
        return None
    if seconds <= 0:
        return None
    # Some exports use milliseconds; anything past the year 5000 must be ms.
    if seconds > 1e11:
        seconds /= 1000
    try:
        return datetime.fromtimestamp(seconds, tz=UTC)
    except (OverflowError, OSError, ValueError):
        return None


def _first(payload: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in payload and payload[key] is not None:
            return payload[key]
    return None


def _load_members(data: bytes) -> dict[str, Any]:
    """Returns the parsed trip and location documents from the zip or raw JSON."""
    if data[:4] == b"PK\x03\x04":
        found: dict[str, Any] = {}
        with zipfile.ZipFile(BytesIO(data)) as archive:
            for info in archive.infolist():
                name = info.filename.rsplit("/", 1)[-1].lower()
                if name in _TRIP_NAMES or name in _LOCATION_NAMES:
                    try:
                        parsed = json.loads(archive.read(info))
                    except (UnicodeDecodeError, json.JSONDecodeError):
                        continue
                    found["trip" if name in _TRIP_NAMES else "locations"] = parsed
        if not found:
            raise AppError("No trip.json or locations.json found in the Polarsteps zip")
        return found

    try:
        payload = json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AppError("Neither a zip nor valid JSON") from exc
    if not isinstance(payload, dict):
        raise AppError("Unexpected Polarsteps structure")
    if "locations" in payload and "all_steps" not in payload:
        return {"locations": payload}
    return {"trip": payload.get("trip", payload)}


def parse_polarsteps(data: bytes) -> ImportedTrip:
    members = _load_members(data)
    trip_doc = members.get("trip") or {}
    if isinstance(trip_doc, dict) and isinstance(trip_doc.get("trip"), dict):
        trip_doc = trip_doc["trip"]

    trip = ImportedTrip(
        title=_first(trip_doc, "name", "title") if isinstance(trip_doc, dict) else None,
        description=_first(trip_doc, "summary", "description")
        if isinstance(trip_doc, dict)
        else None,
    )

    steps = trip_doc.get("all_steps") or trip_doc.get("steps") or []
    for step in steps if isinstance(steps, list) else []:
        if not isinstance(step, dict):
            continue
        location = step.get("location") or {}
        lat = _first(location, "lat", "latitude")
        lon = _first(location, "lon", "lng", "longitude")
        if not valid_coordinates(lat, lon):
            continue
        arrived_at = _epoch(_first(step, "start_time", "creation_time"))
        name = _first(step, "display_name", "name") or _first(location, "name") or "Stop"
        trip.stops.append(
            ImportedStop(
                name=str(name),
                lat=float(lat),
                lon=float(lon),
                arrived_at=arrived_at,
                country=(_first(location, "country_code") or "")[:2].upper() or None,
            )
        )
        text = _first(step, "description", "text")
        if text and arrived_at is not None:
            # A step's prose is the trip's journal; it would otherwise be lost.
            trip.entries.append(
                ImportedJournalEntry(timestamp=arrived_at, title=str(name), text=str(text))
            )

    locations = members.get("locations") or {}
    raw_points = (
        locations.get("locations") if isinstance(locations, dict) else locations
    ) or []
    skipped = 0
    for point in raw_points if isinstance(raw_points, list) else []:
        if not isinstance(point, dict):
            continue
        lat = _first(point, "lat", "latitude")
        lon = _first(point, "lon", "lng", "longitude")
        recorded_at = _epoch(_first(point, "time", "timestamp"))
        if not valid_coordinates(lat, lon) or recorded_at is None:
            skipped += 1
            continue
        trip.waypoints.append(
            ImportedWaypoint(lat=float(lat), lon=float(lon), recorded_at=recorded_at)
        )

    if skipped:
        trip.warnings.append(f"{skipped} Positionen ohne brauchbare Koordinaten oder Zeit")
    if not trip.waypoints and not trip.stops:
        raise AppError("The Polarsteps export contained no usable trip data")
    return trip
