"""Assembles trip data into the export formats."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Trip
from app.schemas.trip import TripRead
from app.services import journal as journal_service
from app.services import photos as photo_service
from app.services import staticmap
from app.services import stops as stop_service
from app.services import timeline as timeline_service
from app.services import trips as trip_service
from app.services import waypoints as waypoint_service
from app.services.geo import lat_lon
from app.services.gpx import GpxPoint, GpxTrip, build_gpx
from app.services.pdfbook import BookData, BookItem, BookPhoto, build_pdf
from app.storage import ObjectNotFoundError, ObjectStore

# A book with a thousand photos is neither readable nor a sensible download.
MAX_BOOK_PHOTOS = 300
EXPORT_WAYPOINT_LIMIT = 5000


def format_distance(metres: float) -> str:
    """A walk of 420 m is not "0 km".

    Whole kilometres are the right unit for a journey and the wrong one for
    everything below the first of them; rounding those away tells the reader the
    trip did not happen.
    """
    if metres < 1000:
        return f"{round(metres)} m"
    if metres < 10_000:
        return f"{metres / 1000:.1f} km".replace(".", ",")
    return f"{round(metres / 1000)} km"


def _filename(trip: Trip, extension: str) -> str:
    safe = "".join(c if c.isalnum() or c in " -_" else "_" for c in trip.title).strip()
    return f"{safe or 'reise'}.{extension}"


async def to_gpx(session: AsyncSession, trip: Trip) -> tuple[str, str]:
    waypoints = await waypoint_service.list_waypoints(
        session, trip, limit=EXPORT_WAYPOINT_LIMIT
    )
    stops = await stop_service.list_stops(session, trip)

    document = build_gpx(
        GpxTrip(
            title=trip.title,
            description=trip.description,
            track=tuple(
                GpxPoint(
                    lat=point.lat,
                    lon=point.lon,
                    time=point.recorded_at,
                    elevation_m=point.altitude_m,
                )
                for point in waypoints
            ),
            stops=tuple(
                GpxPoint(
                    lat=read.lat,
                    lon=read.lon,
                    time=read.arrived_at,
                    elevation_m=read.altitude_m,
                    name=read.name,
                    description=read.notes,
                )
                for read in (stop_service.to_read(stop) for stop in stops)
            ),
        )
    )
    return document, _filename(trip, "gpx")


async def to_json(session: AsyncSession, trip: Trip) -> tuple[dict[str, Any], str]:
    """A complete, re-importable dump – the point of data ownership."""
    stops = await stop_service.list_stops(session, trip)
    entries = await journal_service.list_entries(session, trip)
    photos = await photo_service.list_photos(session, trip)
    waypoints = await waypoint_service.list_waypoints(
        session, trip, limit=EXPORT_WAYPOINT_LIMIT
    )
    members = await trip_service.list_members(session, trip)

    payload = {
        "format": "fernspur/trip",
        "version": 1,
        "exported_at": datetime.now(UTC).isoformat(),
        "trip": TripRead.model_validate(trip).model_dump(mode="json"),
        "members": [
            {"display_name": user.display_name, "email": user.email, "role": role.value}
            for user, role in members
        ],
        "stops": [stop_service.to_read(stop).model_dump(mode="json") for stop in stops],
        "waypoints": [point.model_dump(mode="json") for point in waypoints],
        "photos": [photo_service.to_read(photo).model_dump(mode="json") for photo in photos],
        "journal_entries": [
            journal_service.to_read(entry).model_dump(mode="json") for entry in entries
        ],
    }
    return payload, _filename(trip, "json")


def _places(geometries: Iterable[object]) -> list[tuple[float, float]]:
    """Coordinates of whatever carries a geometry, skipping what does not."""
    return [
        place
        for place in (lat_lon(geometry) for geometry in geometries)  # type: ignore[arg-type]
        if place is not None
    ]


async def _photo_bytes(store: ObjectStore, key: str | None) -> bytes | None:
    if key is None:
        return None
    try:
        return await store.get(key)
    except ObjectNotFoundError:
        return None


async def to_pdf(
    session: AsyncSession, store: ObjectStore, trip: Trip
) -> tuple[bytes, str]:
    timeline = await timeline_service.build(session, trip)
    route = await waypoint_service.route(session, trip, simplify_m=25)
    stops = await stop_service.list_stops(session, trip)
    photo_models = await photo_service.list_photos(session, trip)

    # Thumbnails, not originals: a book of full-resolution photos would run to
    # hundreds of megabytes for no visible gain on a page.
    keys = {photo.id: photo.thumbnail_key or photo.storage_key for photo in photo_models}

    stats: list[tuple[str, str]] = []
    if route.distance_m > 0:
        stats.append(("Distanz", format_distance(route.distance_m)))
    stats.append(("Stops", str(len(stops))))
    stats.append(("Fotos", str(len(photo_models))))
    countries = {stop.country for stop in stops if stop.country}
    if countries:
        stats.append(("Länder", str(len(countries))))

    subtitle = None
    if trip.start_date:
        subtitle = trip.start_date.strftime("%d.%m.%Y")
        if trip.end_date:
            subtitle += f" – {trip.end_date.strftime('%d.%m.%Y')}"

    used = 0
    items: list[BookItem] = []
    for entry in timeline.items:
        photos: list[BookPhoto] = []
        for photo in entry.entry.photos if entry.entry else entry.photos:
            if used >= MAX_BOOK_PHOTOS:
                break
            data = await _photo_bytes(store, keys.get(photo.id))
            if data is not None:
                photos.append(BookPhoto(data=data, caption=photo.caption))
                used += 1

        if entry.kind == "stop" and entry.stop is not None:
            items.append(
                BookItem(
                    kind="stop",
                    at=entry.at,
                    day=entry.day,
                    date=entry.date,
                    title=entry.stop.name,
                    subtitle=entry.stop.locality or entry.stop.country,
                    text=entry.stop.notes,
                )
            )
        elif entry.kind == "journal" and entry.entry is not None:
            items.append(
                BookItem(
                    kind="journal",
                    at=entry.at,
                    day=entry.day,
                    date=entry.date,
                    title=entry.entry.title or "Tagebucheintrag",
                    text=entry.entry.text,
                    photos=photos,
                )
            )
        else:
            items.append(
                BookItem(
                    kind="photos",
                    at=entry.at,
                    day=entry.day,
                    date=entry.date,
                    title=f"{len(entry.photos)} Fotos" if len(entry.photos) != 1 else "Ein Foto",
                    photos=photos,
                )
            )

    settings = get_settings()
    # The route as PostGIS simplified it, which is also what the page can show.
    map_image = await staticmap.render(
        settings.tiles_base_url,
        settings.tiles_style,
        [(lat, lon) for lon, lat in route.coordinates],
    )

    book = BookData(
        title=trip.title,
        description=trip.description,
        subtitle=subtitle,
        stats=stats,
        route=[(lat, lon) for lon, lat in route.coordinates],
        items=items,
        stop_places=_places(stop.geom for stop in stops),
        photo_places=_places(photo.geom for photo in photo_models),
        map_image=map_image,
    )
    return build_pdf(book), _filename(trip, "pdf")
