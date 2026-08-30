from __future__ import annotations

from datetime import UTC, datetime
from xml.etree import ElementTree as ET

from app.core.errors import AppError
from app.services.importers.base import (
    ImportedStop,
    ImportedTrip,
    ImportedWaypoint,
    valid_coordinates,
)

# GPX 1.0 and 1.1 differ only in namespace for our purposes, and plenty of
# devices emit files with no namespace at all.
_NAMESPACES = (
    "{http://www.topografix.com/GPX/1/1}",
    "{http://www.topografix.com/GPX/1/0}",
    "",
)


def _find_all(element: ET.Element, path: str) -> list[ET.Element]:
    for namespace in _NAMESPACES:
        qualified = "/".join(f"{namespace}{part}" for part in path.split("/"))
        found = element.findall(qualified)
        if found:
            return found
    return []


def _text(element: ET.Element, tag: str) -> str | None:
    for namespace in _NAMESPACES:
        child = element.find(f"{namespace}{tag}")
        if child is not None and child.text:
            return child.text.strip()
    return None


def _float(value: str | None) -> float | None:
    try:
        return float(value) if value is not None else None
    except ValueError:
        return None


def _time(element: ET.Element) -> datetime | None:
    raw = _text(element, "time")
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    # A file without zone information is read as UTC rather than rejected: an
    # unusable timestamp is worse than a slightly wrong one for a route.
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def parse_gpx(data: bytes) -> ImportedTrip:
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise AppError(f"Not valid XML: {exc}") from exc

    trip = ImportedTrip()

    metadata = _find_all(root, "metadata")
    if metadata:
        trip.title = _text(metadata[0], "name")
        trip.description = _text(metadata[0], "desc")

    skipped = 0
    # Every segment of every track becomes one continuous list of points: the
    # split into segments is a recording artefact, not part of the journey.
    for track in _find_all(root, "trk"):
        trip.title = trip.title or _text(track, "name")
        for segment in _find_all(track, "trkseg"):
            for point in _find_all(segment, "trkpt"):
                lat, lon = _float(point.get("lat")), _float(point.get("lon"))
                recorded_at = _time(point)
                if not valid_coordinates(lat, lon) or recorded_at is None:
                    skipped += 1
                    continue
                assert lat is not None and lon is not None
                trip.waypoints.append(
                    ImportedWaypoint(
                        lat=lat,
                        lon=lon,
                        recorded_at=recorded_at,
                        altitude_m=_float(_text(point, "ele")),
                    )
                )

    # Routes (rte) are planned, not recorded – they belong to the track too, but
    # only if there is no recorded track to prefer.
    if not trip.waypoints:
        for route in _find_all(root, "rte"):
            for point in _find_all(route, "rtept"):
                lat, lon = _float(point.get("lat")), _float(point.get("lon"))
                recorded_at = _time(point)
                if not valid_coordinates(lat, lon) or recorded_at is None:
                    skipped += 1
                    continue
                assert lat is not None and lon is not None
                trip.waypoints.append(
                    ImportedWaypoint(lat=lat, lon=lon, recorded_at=recorded_at)
                )

    for waypoint in _find_all(root, "wpt"):
        lat, lon = _float(waypoint.get("lat")), _float(waypoint.get("lon"))
        if not valid_coordinates(lat, lon):
            skipped += 1
            continue
        assert lat is not None and lon is not None
        trip.stops.append(
            ImportedStop(
                name=_text(waypoint, "name") or "Wegpunkt",
                lat=lat,
                lon=lon,
                arrived_at=_time(waypoint),
                notes=_text(waypoint, "desc"),
            )
        )

    if skipped:
        trip.warnings.append(f"{skipped} Punkte ohne gültige Koordinaten oder Zeit übersprungen")
    if not trip.waypoints and not trip.stops:
        raise AppError("The GPX file contains no usable points")
    return trip
