"""Merges stops, journal entries and photos into one chronological list.

Assembled on the server so the app, the web viewer and the PDF travel book order
and group it the same way instead of each re-implementing the rules.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Photo, Stop, Trip
from app.schemas.journal import Timeline, TimelineItem
from app.services import journal as journal_service
from app.services import photos as photo_service
from app.services import stops as stop_service

# Photos taken close together are one moment, not fifty timeline rows.
CLUSTER_GAP = timedelta(hours=1)


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

    items: list[TimelineItem] = []
    items.extend(
        TimelineItem(kind="stop", at=_stop_time(stop), stop=stop_service.to_read(stop))
        for stop in stops
    )
    items.extend(
        TimelineItem(kind="journal", at=entry.timestamp, entry=journal_service.to_read(entry))
        for entry in entries
    )
    items.extend(
        TimelineItem(
            kind="photos",
            at=_photo_time(cluster[0]),
            photos=[photo_service.to_read(photo) for photo in cluster],
        )
        for cluster in cluster_photos(loose)
    )

    # Stable order for items sharing a timestamp: arriving somewhere comes before
    # writing about it, which comes before the photos of it.
    rank = {"stop": 0, "journal": 1, "photos": 2}
    items.sort(key=lambda item: (item.at, rank[item.kind]))
    return Timeline(items=items)
