"""Applies a parsed import to a trip.

Ids are derived from the content, not random: importing the same file twice must
not double the route. That mirrors how tracked points work — the id is a
function of (trip, time, position), so the second import collides with the first
and stores nothing.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Stop, Trip, User, WaypointSource
from app.schemas.geo import StopCreate, WaypointCreate
from app.schemas.journal import JournalEntryCreate
from app.services import journal as journal_service
from app.services import stops as stop_service
from app.services import waypoints as waypoint_service
from app.services.importers import ImportedStop, ImportedTrip, ImportedWaypoint

# Fixed namespace so derived ids are stable across processes and restarts.
IMPORT_NAMESPACE = uuid.UUID("6f1c6a2e-2f4a-5c8b-9d3e-7a1b2c3d4e5f")
BATCH = 2000


def waypoint_id(trip_id: uuid.UUID, point: ImportedWaypoint) -> uuid.UUID:
    when = point.recorded_at.astimezone(UTC).isoformat()
    key = f"{trip_id}|{when}|{point.lat:.6f}|{point.lon:.6f}"
    return uuid.uuid5(IMPORT_NAMESPACE, key)


def stop_id(trip_id: uuid.UUID, stop: ImportedStop) -> uuid.UUID:
    arrived = stop.arrived_at.astimezone(UTC).isoformat() if stop.arrived_at else ""
    return uuid.uuid5(
        IMPORT_NAMESPACE, f"{trip_id}|stop|{stop.name}|{arrived}|{stop.lat:.6f}|{stop.lon:.6f}"
    )


class ImportResult:
    def __init__(self) -> None:
        self.waypoints_stored = 0
        self.waypoints_duplicate = 0
        self.stops_created = 0
        self.stops_duplicate = 0
        self.entries_created = 0
        self.warnings: list[str] = []


async def apply(
    session: AsyncSession, trip: Trip, author: User, imported: ImportedTrip
) -> ImportResult:
    result = ImportResult()
    result.warnings.extend(imported.warnings)

    for start in range(0, len(imported.waypoints), BATCH):
        chunk = imported.waypoints[start : start + BATCH]
        stored = await waypoint_service.store_batch(
            session,
            trip,
            [
                WaypointCreate(
                    id=waypoint_id(trip.id, point),
                    lat=point.lat,
                    lon=point.lon,
                    recorded_at=point.recorded_at,
                    altitude_m=point.altitude_m,
                    accuracy_m=point.accuracy_m,
                    source=WaypointSource.IMPORT,
                )
                for point in chunk
            ],
        )
        result.waypoints_stored += stored.stored
        result.waypoints_duplicate += stored.duplicates

    for stop in imported.stops:
        identifier = stop_id(trip.id, stop)
        if await session.get(Stop, identifier) is not None:
            result.stops_duplicate += 1
            continue
        await stop_service.create_stop(
            session,
            trip,
            StopCreate(
                id=identifier,
                name=stop.name,
                lat=stop.lat,
                lon=stop.lon,
                arrived_at=stop.arrived_at,
                left_at=stop.left_at,
                country=stop.country,
                notes=stop.notes,
            ),
        )
        result.stops_created += 1

    for entry in imported.entries:
        await journal_service.create_entry(
            session,
            trip,
            author,
            JournalEntryCreate(
                title=entry.title, text=entry.text, timestamp=entry.timestamp
            ),
        )
        result.entries_created += 1

    return result


def trip_title(imported: ImportedTrip, fallback: str | None = None) -> str:
    return (imported.title or fallback or f"Import {datetime.now(UTC):%d.%m.%Y}").strip()[:200]
