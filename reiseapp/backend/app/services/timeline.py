"""Merges stops, journal entries and photos into one chronological list.

Assembled on the server so the app, the web viewer and the PDF travel book order
and group it the same way instead of each re-implementing the rules.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Photo, Stop, Trip
from app.schemas.journal import Timeline, TimelineItem
from app.services import journal as journal_service
from app.services import photos as photo_service
from app.services import stops as stop_service

# Photos taken close together are one moment, not fifty timeline rows.
CLUSTER_GAP = timedelta(hours=1)


def _day_of(moment: datetime) -> date:
    """The calendar day a row belongs to.

    In UTC, deliberately and for now: a trip carries no timezone of its own, and
    inventing one per row — from the server's clock, or from whichever device
    happens to ask — would cut the days differently in the app, the web viewer
    and the printed book. A journey that crosses timezones therefore gets its
    evening in Bangkok filed under UTC; the honest fix is a timezone on the trip,
    not a guess here.
    """
    return (moment.astimezone(UTC) if moment.tzinfo else moment.replace(tzinfo=UTC)).date()


def _photo_time(photo: Photo) -> datetime:
    return photo.taken_at or photo.created_at


def _stop_time(stop: Stop) -> datetime:
    return stop.arrived_at or stop.created_at


def cluster_photos(photos: list[Photo]) -> list[list[Photo]]:
    """Groups photos into bursts by time, splitting when the stop changes."""
    clusters: list[list[Photo]] = []
    for photo in sorted(photos, key=_photo_time):
        current = clusters[-1] if clusters else None
        if (
            current is not None
            and _photo_time(photo) - _photo_time(current[-1]) <= CLUSTER_GAP
            and photo.stop_id == current[-1].stop_id
        ):
            current.append(photo)
        else:
            clusters.append([photo])
    return clusters


async def build(session: AsyncSession, trip: Trip) -> Timeline:
    stops = await stop_service.list_stops(session, trip)
    entries = await journal_service.list_entries(session, trip)
    photos = await photo_service.list_photos(session, trip)

    # Photos shown inside a journal entry must not also appear as loose clusters.
    in_entries = {
        link.photo_id for entry in entries for link in entry.photo_links
    }
    loose = [photo for photo in photos if photo.id not in in_entries]

    rows: list[tuple[datetime, str, dict[str, object]]] = []
    rows.extend(
        (_stop_time(stop), "stop", {"stop": stop_service.to_read(stop)}) for stop in stops
    )
    rows.extend(
        (entry.timestamp, "journal", {"entry": journal_service.to_read(entry)})
        for entry in entries
    )
    rows.extend(
        (
            _photo_time(cluster[0]),
            "photos",
            {"photos": [photo_service.to_read(photo) for photo in cluster]},
        )
        for cluster in cluster_photos(loose)
    )

    # Stable order for items sharing a timestamp: arriving somewhere comes before
    # writing about it, which comes before the photos of it.
    rank = {"stop": 0, "journal": 1, "photos": 2}
    rows.sort(key=lambda row: (row[0], rank[row[1]]))
    if not rows:
        return Timeline(items=[])

    # Day one is the earliest thing that happened, or the planned start if that
    # came first — a photo taken while packing should not push the journey into
    # day zero.
    first = _day_of(rows[0][0])
    if trip.start_date is not None:
        first = min(first, trip.start_date)

    return Timeline(
        items=[
            TimelineItem(
                kind=kind,  # type: ignore[arg-type]
                at=at,
                date=_day_of(at),
                day=(_day_of(at) - first).days + 1,
                **payload,  # type: ignore[arg-type]
            )
            for at, kind, payload in rows
        ]
    )
