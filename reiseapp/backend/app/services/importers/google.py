"""Google Timeline (Takeout).

Google has shipped at least three shapes for this: Semantic Location History
with timelineObjects, the newer semanticSegments, and the raw Records export
with a flat locations list. All three appear in the wild depending on when the
takeout was made, so all three are read.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from app.core.errors import AppError
from app.services.importers.base import (
    ImportedStop,
    ImportedTrip,
    ImportedWaypoint,
    valid_coordinates,
)

# Google stores coordinates as integer degrees times 1e7.
E7 = 1e7


def _time(value: Any) -> datetime | None:
    if isinstance(value, int | float):
        # Records export uses milliseconds since the epoch.
        try:
            return datetime.fromtimestamp(float(value) / 1000, tz=UTC)
        except (OverflowError, OSError, ValueError):
            return None
    if not isinstance(value, str):
        return None
    if value.isdigit():
        return _time(int(value))
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _coordinate(
    payload: dict[str, Any], *, lat_key: str, lon_key: str
) -> tuple[float, float] | None:
    lat, lon = payload.get(lat_key), payload.get(lon_key)
    if lat is None or lon is None:
        e7_lat, e7_lon = payload.get(f"{lat_key}E7"), payload.get(f"{lon_key}E7")
        if e7_lat is None or e7_lon is None:
            return None
        lat, lon = e7_lat / E7, e7_lon / E7
    if not valid_coordinates(float(lat), float(lon)):
        return None
    return float(lat), float(lon)


def _parse_geo_string(value: Any) -> tuple[float, float] | None:
    """The newer format writes points as "geo:47.376900,8.541700"."""
    if not isinstance(value, str) or not value.startswith("geo:"):
        return None
    try:
        lat_text, lon_text = value[4:].split(",", 1)
        lat, lon = float(lat_text), float(lon_text)
    except ValueError:
        return None
    return (lat, lon) if valid_coordinates(lat, lon) else None


def parse_google_timeline(data: bytes) -> ImportedTrip:
    try:
        payload = json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AppError("Not valid JSON") from exc

    trip = ImportedTrip(title="Google Timeline")
    skipped = 0

    objects = payload.get("timelineObjects") if isinstance(payload, dict) else None
    for entry in objects or []:
        if not isinstance(entry, dict):
            continue
        visit = entry.get("placeVisit")
        if isinstance(visit, dict):
            location = visit.get("location") or {}
            point = _coordinate(location, lat_key="latitude", lon_key="longitude")
            duration = visit.get("duration") or {}
            if point is not None:
                trip.stops.append(
                    ImportedStop(
                        name=location.get("name") or location.get("address") or "Ort",
                        lat=point[0],
                        lon=point[1],
                        arrived_at=_time(duration.get("startTimestamp")),
                        left_at=_time(duration.get("endTimestamp")),
                    )
                )
            continue

        segment = entry.get("activitySegment")
        if isinstance(segment, dict):
            duration = segment.get("duration") or {}
            ends = (
                ("startLocation", _time(duration.get("startTimestamp"))),
                ("endLocation", _time(duration.get("endTimestamp"))),
            )
            for key, when in ends:
                location = segment.get(key) or {}
                point = _coordinate(location, lat_key="latitude", lon_key="longitude")
                if point is None or when is None:
                    skipped += 1
                    continue
                trip.waypoints.append(
                    ImportedWaypoint(lat=point[0], lon=point[1], recorded_at=when)
                )

    for segment in (payload.get("semanticSegments") if isinstance(payload, dict) else None) or []:
        if not isinstance(segment, dict):
            continue
        for path_point in segment.get("timelinePath") or []:
            point = _parse_geo_string((path_point or {}).get("point"))
            when = _time((path_point or {}).get("time"))
            if point is None or when is None:
                skipped += 1
                continue
            trip.waypoints.append(ImportedWaypoint(lat=point[0], lon=point[1], recorded_at=when))

    raw = payload.get("locations") if isinstance(payload, dict) else payload
    for record in raw or []:
        if not isinstance(record, dict):
            continue
        point = _coordinate(record, lat_key="latitude", lon_key="longitude")
        when = _time(record.get("timestamp") or record.get("timestampMs"))
        if point is None or when is None:
            skipped += 1
            continue
        trip.waypoints.append(
            ImportedWaypoint(
                lat=point[0],
                lon=point[1],
                recorded_at=when,
                accuracy_m=(
                    float(record["accuracy"]) if record.get("accuracy") is not None else None
                ),
            )
        )

    trip.waypoints.sort(key=lambda point: point.recorded_at)
    if skipped:
        trip.warnings.append(f"{skipped} Einträge ohne brauchbare Koordinaten oder Zeit")
    if not trip.waypoints and not trip.stops:
        raise AppError("The Google Timeline file contained no usable positions")
    return trip
