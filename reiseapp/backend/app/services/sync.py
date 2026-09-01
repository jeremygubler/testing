"""Pull/push sync for one trip.

Cursor semantics: the server returns a cursor that lags slightly behind its own
clock. A transaction that started before the cursor but commits after it would
otherwise be invisible forever — the row's updated_at is older than the cursor
the client already advanced past. The lag has to exceed the longest write
transaction; SYNC_SAFETY_LAG is the knob, and `?full=true` is the escape hatch
if a client ever suspects it missed something.

Over-delivery is harmless by construction: every record is keyed by a
client-generated UUID and every write is idempotent, so receiving a change twice
changes nothing.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError
from app.models import (
    JournalEntry,
    JournalEntryPhoto,
    Photo,
    Stop,
    Trip,
    User,
)
from app.schemas.geo import StopRead, WaypointRead
from app.schemas.journal import JournalEntryRead
from app.schemas.photo import PhotoRead
from app.schemas.sync import (
    Changes,
    Conflict,
    EntityResult,
    JournalPush,
    PhotoPush,
    PushRecord,
    StopPush,
    SyncPull,
    SyncPush,
    SyncPushResult,
    TripPush,
)
from app.schemas.trip import TripMemberRead, TripRead
from app.services import journal as journal_service
from app.services import photos as photo_service
from app.services import stops as stop_service
from app.services import trips as trip_service
from app.services import waypoints as waypoint_service
from app.services.geo import point_ewkt
from app.services.merge import merge_fields

SYNC_SAFETY_LAG = timedelta(seconds=5)
PAGE_LIMIT = 2000
EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def _stamps(raw: dict[str, str]) -> dict[str, datetime]:
    parsed: dict[str, datetime] = {}
    for name, value in raw.items():
        try:
            parsed[name] = datetime.fromisoformat(value)
        except (TypeError, ValueError):
            continue
    return parsed


def _serialise_stamps(stamps: dict[str, datetime]) -> dict[str, str]:
    return {name: value.isoformat() for name, value in stamps.items()}


# --- pull ------------------------------------------------------------------


async def pull(
    session: AsyncSession, trip: Trip, since: datetime | None
) -> SyncPull:
    cursor = datetime.now(UTC) - SYNC_SAFETY_LAG
    marker = since or EPOCH

    result = SyncPull(cursor=cursor)

    if trip.updated_at > marker:
        if trip.deleted_at is not None:
            result.trip_deleted = True
        else:
            result.trip = TripRead.model_validate(trip)

    # Shared with the REST endpoint on purpose: ownership lives on Trip.owner_id
    # rather than in trip_members, and a second query here would quietly omit the
    # owner from every offline client.
    result.members = [
        TripMemberRead(
            user_id=user.id, email=user.email, display_name=user.display_name, role=role
        )
        for user, role in await trip_service.list_members(session, trip)
    ]

    stops = (
        await session.execute(
            select(Stop)
            .where(Stop.trip_id == trip.id, Stop.updated_at > marker)
            .order_by(Stop.updated_at)
            .limit(PAGE_LIMIT)
        )
    ).scalars().all()
    result.stops = Changes[StopRead](
        updated=[stop_service.to_read(s) for s in stops if s.deleted_at is None],
        deleted=[s.id for s in stops if s.deleted_at is not None],
    )

    photos = (
        await session.execute(
            select(Photo)
            .where(Photo.trip_id == trip.id, Photo.updated_at > marker)
            .order_by(Photo.updated_at)
            .limit(PAGE_LIMIT)
        )
    ).scalars().all()
    result.photos = Changes[PhotoRead](
        updated=[photo_service.to_read(p) for p in photos if p.deleted_at is None],
        deleted=[p.id for p in photos if p.deleted_at is not None],
    )

    entries = (
        await session.execute(
            select(JournalEntry)
            .options(
                selectinload(JournalEntry.photo_links).selectinload(JournalEntryPhoto.photo)
            )
            .where(JournalEntry.trip_id == trip.id, JournalEntry.updated_at > marker)
            .order_by(JournalEntry.updated_at)
            .limit(PAGE_LIMIT)
        )
    ).scalars().unique().all()
    result.journal_entries = Changes[JournalEntryRead](
        updated=[journal_service.to_read(e) for e in entries if e.deleted_at is None],
        deleted=[e.id for e in entries if e.deleted_at is not None],
    )

    # Waypoints are append-only and by far the largest set, so they page on
    # recorded_at rather than being re-sent whenever a trip is touched.
    waypoints = await waypoint_service.list_waypoints(
        session, trip, since=since, limit=PAGE_LIMIT
    )
    result.waypoints = Changes[WaypointRead](updated=waypoints)

    result.has_more = any(
        len(batch) >= PAGE_LIMIT for batch in (stops, photos, entries, waypoints)
    )
    return result


# --- push ------------------------------------------------------------------


def _apply(
    row: Any, record: PushRecord, incoming: dict[str, Any], supports_stamps: bool
) -> list[str]:
    """Merges one record onto a row and returns the fields the server kept."""
    current_stamps = _stamps(row.field_updated_at) if supports_stamps else {}
    current = {name: getattr(row, name, None) for name in incoming}

    merged = merge_fields(
        incoming=incoming,
        incoming_stamps=record.field_updated_at,
        incoming_updated_at=record.updated_at,
        current=current,
        current_stamps=current_stamps,
        current_updated_at=row.updated_at,
    )

    for name, value in merged.values.items():
        setattr(row, name, value)
    if supports_stamps and merged.stamps:
        # Reassign rather than mutate: SQLAlchemy does not track in-place JSONB edits.
        row.field_updated_at = {**row.field_updated_at, **_serialise_stamps(merged.stamps)}
    return merged.rejected


def _position_fields(incoming: dict[str, Any]) -> dict[str, Any]:
    """lat/lon are API-level; the column is a geography point."""
    lat, lon = incoming.pop("lat", None), incoming.pop("lon", None)
    if lat is None and lon is None:
        return incoming
    if lat is None or lon is None:
        raise AppError("lat and lon must be pushed together")
    incoming["geom"] = point_ewkt(lat, lon)
    return incoming


async def _push_stops(
    session: AsyncSession, trip: Trip, records: list[StopPush]
) -> EntityResult:
    result = EntityResult()
    for record in records:
        incoming = _position_fields(record.changed_fields())
        stop = (
            await session.execute(
                select(Stop).where(Stop.id == record.id, Stop.trip_id == trip.id)
            )
        ).scalar_one_or_none()

        if stop is None:
            if "name" not in incoming or "geom" not in incoming:
                raise AppError("A new stop needs a name and a position")
            stop = Stop(id=record.id, trip_id=trip.id, **incoming)
            stop.field_updated_at = _serialise_stamps(record.field_updated_at)
            session.add(stop)
            result.created.append(record.id)
            continue

        rejected = _apply(stop, record, incoming, supports_stamps=True)
        if rejected:
            result.conflicts.append(Conflict(id=record.id, fields=rejected))
        result.applied.append(record.id)
    await session.flush()
    return result


async def _push_entries(
    session: AsyncSession, trip: Trip, author: User, records: list[JournalPush]
) -> EntityResult:
    result = EntityResult()
    for record in records:
        incoming = record.changed_fields()
        entry = (
            await session.execute(
                select(JournalEntry).where(
                    JournalEntry.id == record.id, JournalEntry.trip_id == trip.id
                )
            )
        ).scalar_one_or_none()

        if entry is None:
            if "timestamp" not in incoming:
                raise AppError("A new journal entry needs a timestamp")
            entry = JournalEntry(
                id=record.id,
                trip_id=trip.id,
                author_id=author.id,
                text=incoming.pop("text", ""),
                **incoming,
            )
            entry.field_updated_at = _serialise_stamps(record.field_updated_at)
            session.add(entry)
            result.created.append(record.id)
            continue

        rejected = _apply(entry, record, incoming, supports_stamps=True)
        if rejected:
            result.conflicts.append(Conflict(id=record.id, fields=rejected))
        result.applied.append(record.id)
    await session.flush()
    return result


async def _push_photos(
    session: AsyncSession, trip: Trip, records: list[PhotoPush]
) -> EntityResult:
    result = EntityResult()
    for record in records:
        photo = (
            await session.execute(
                select(Photo).where(Photo.id == record.id, Photo.trip_id == trip.id)
            )
        ).scalar_one_or_none()
        if photo is None:
            # Metadata for a photo whose bytes never arrived is meaningless; the
            # client has to finish the upload first.
            raise AppError("Unknown photo – upload the file before pushing metadata")

        # No field stamps here: a photo's metadata is edited by one person at a
        # time, so the record timestamp is enough.
        rejected = _apply(photo, record, record.changed_fields(), supports_stamps=False)
        if rejected:
            result.conflicts.append(Conflict(id=record.id, fields=rejected))
        result.applied.append(record.id)
    await session.flush()
    return result


async def _push_trip(session: AsyncSession, trip: Trip, record: TripPush) -> EntityResult:
    result = EntityResult()
    if record.id != trip.id:
        raise AppError("The pushed trip does not match the trip in the path")
    rejected = _apply(trip, record, record.changed_fields(), supports_stamps=True)
    if rejected:
        result.conflicts.append(Conflict(id=trip.id, fields=rejected))
    result.applied.append(trip.id)
    await session.flush()
    return result


async def push(
    session: AsyncSession, trip: Trip, author: User, payload: SyncPush
) -> SyncPushResult:
    result = SyncPushResult(cursor=datetime.now(UTC) - SYNC_SAFETY_LAG)

    if payload.trip is not None:
        result.trip = await _push_trip(session, trip, payload.trip)
    if payload.stops:
        result.stops = await _push_stops(session, trip, payload.stops)
    if payload.journal_entries:
        result.journal_entries = await _push_entries(
            session, trip, author, payload.journal_entries
        )
    if payload.photos:
        result.photos = await _push_photos(session, trip, payload.photos)
    if payload.waypoints:
        stored = await waypoint_service.store_batch(session, trip, payload.waypoints)
        result.waypoints_stored = stored.stored

    return result


