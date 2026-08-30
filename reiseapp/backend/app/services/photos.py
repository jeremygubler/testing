from __future__ import annotations

import hashlib
import mimetypes
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError
from app.models import Photo, PositionSource, Stop, Trip
from app.schemas.photo import PhotoRead, PhotoUpdate
from app.services.exif import ExifData, make_thumbnail, read_exif
from app.services.geo import lat_lon, point_ewkt
from app.storage.base import ObjectStore

# How far a stop may be from a photo to still count as "taken there".
STOP_RADIUS_M = 500.0
# How far in time we are willing to look for waypoints around a photo.
INTERPOLATION_WINDOW = timedelta(hours=2)
# Fallback when the photo has no position: a stop within this window of the
# photo's timestamp is a good enough guess.
STOP_TIME_WINDOW = timedelta(hours=6)

_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "image/webp": ".webp",
    "image/avif": ".avif",
}
ALLOWED_CONTENT_TYPES = frozenset(_EXTENSIONS)


def _extension(content_type: str, filename: str | None) -> str:
    if content_type in _EXTENSIONS:
        return _EXTENSIONS[content_type]
    guessed = mimetypes.guess_extension(content_type or "")
    if guessed:
        return guessed
    if filename and "." in filename:
        return f".{filename.rsplit('.', 1)[1][:8].lower()}"
    return ".bin"


def storage_keys(trip_id: UUID, photo_id: UUID, extension: str) -> tuple[str, str]:
    base = f"trips/{trip_id}/photos/{photo_id}"
    return f"{base}/original{extension}", f"{base}/thumb.jpg"


def to_read(photo: Photo) -> PhotoRead:
    coordinates = lat_lon(photo.geom)  # type: ignore[arg-type]
    return PhotoRead(
        id=photo.id,
        trip_id=photo.trip_id,
        stop_id=photo.stop_id,
        taken_at=photo.taken_at,
        lat=coordinates[0] if coordinates else None,
        lon=coordinates[1] if coordinates else None,
        altitude_m=photo.altitude_m,
        position_source=photo.position_source,
        width=photo.width,
        height=photo.height,
        byte_size=photo.byte_size,
        content_type=photo.content_type,
        original_filename=photo.original_filename,
        caption=photo.caption,
        has_thumbnail=photo.thumbnail_key is not None,
        created_at=photo.created_at,
    )


_INTERPOLATION_SQL = text(
    """
    (SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon,
            recorded_at, altitude_m
     FROM waypoints
     WHERE trip_id = :trip_id AND deleted_at IS NULL AND recorded_at <= :taken_at
     ORDER BY recorded_at DESC LIMIT 1)
    UNION ALL
    (SELECT ST_Y(geom::geometry), ST_X(geom::geometry), recorded_at, altitude_m
     FROM waypoints
     WHERE trip_id = :trip_id AND deleted_at IS NULL AND recorded_at > :taken_at
     ORDER BY recorded_at ASC LIMIT 1)
    """
)


async def interpolate_position(
    session: AsyncSession, trip: Trip, taken_at: datetime
) -> tuple[float, float, float | None] | None:
    """Place a photo on the recorded track by its timestamp.

    This is the part Polarsteps cannot do for photos without GPS: if the phone
    was tracking, we know where the camera was even when the camera did not.
    """
    result = await session.execute(
        _INTERPOLATION_SQL, {"trip_id": trip.id, "taken_at": taken_at}
    )
    rows = result.all()
    if not rows:
        return None

    before = next((r for r in rows if r.recorded_at <= taken_at), None)
    after = next((r for r in rows if r.recorded_at > taken_at), None)

    if before is not None and after is not None:
        span = (after.recorded_at - before.recorded_at).total_seconds()
        if span <= 0:
            return (before.lat, before.lon, before.altitude_m)
        # Only interpolate across a plausible gap; a photo between two points a
        # day apart says nothing about where it was taken.
        if timedelta(seconds=span) > INTERPOLATION_WINDOW * 2:
            return None
        fraction = (taken_at - before.recorded_at).total_seconds() / span
        lat = before.lat + (after.lat - before.lat) * fraction
        lon = before.lon + (after.lon - before.lon) * fraction
        return (lat, lon, before.altitude_m)

    nearest = before or after
    if nearest is None:
        return None
    if abs(nearest.recorded_at - taken_at) > INTERPOLATION_WINDOW:
        return None
    return (nearest.lat, nearest.lon, nearest.altitude_m)


async def find_stop(
    session: AsyncSession,
    trip: Trip,
    position: tuple[float, float] | None,
    taken_at: datetime | None,
) -> Stop | None:
    """Nearest stop by position, else the stop the photo's time falls into."""
    if position is not None:
        lat, lon = position
        distance = func.ST_Distance(Stop.geom, func.ST_GeogFromText(point_ewkt(lat, lon)))
        result = await session.execute(
            select(Stop)
            .where(
                Stop.trip_id == trip.id,
                Stop.deleted_at.is_(None),
                distance <= STOP_RADIUS_M,
            )
            .order_by(distance)
            .limit(1)
        )
        stop = result.scalar_one_or_none()
        if stop is not None:
            return stop

    if taken_at is None:
        return None

    covering = await session.execute(
        select(Stop)
        .where(
            Stop.trip_id == trip.id,
            Stop.deleted_at.is_(None),
            Stop.arrived_at.is_not(None),
            Stop.arrived_at <= taken_at,
            func.coalesce(Stop.left_at, Stop.arrived_at + STOP_TIME_WINDOW) >= taken_at,
        )
        .order_by(Stop.arrived_at.desc())
        .limit(1)
    )
    return covering.scalar_one_or_none()


async def _apply_placement(
    session: AsyncSession,
    trip: Trip,
    photo: Photo,
    exif: ExifData,
    hint_lat: float | None,
    hint_lon: float | None,
) -> None:
    lat = exif.lat if exif.lat is not None else hint_lat
    lon = exif.lon if exif.lon is not None else hint_lon

    if lat is not None and lon is not None:
        photo.geom = point_ewkt(lat, lon)
        photo.position_source = PositionSource.EXIF
    elif photo.taken_at is not None:
        interpolated = await interpolate_position(session, trip, photo.taken_at)
        if interpolated is not None:
            lat, lon, altitude = interpolated
            photo.geom = point_ewkt(lat, lon)
            photo.position_source = PositionSource.INTERPOLATED
            if photo.altitude_m is None:
                photo.altitude_m = altitude
        else:
            photo.position_source = PositionSource.NONE
    else:
        photo.position_source = PositionSource.NONE

    if photo.stop_id is None:
        stop = await find_stop(
            session, trip, (lat, lon) if lat is not None and lon is not None else None,
            photo.taken_at,
        )
        if stop is not None:
            photo.stop_id = stop.id


async def find_by_checksum(
    session: AsyncSession, trip: Trip, checksum: str
) -> Photo | None:
    result = await session.execute(
        select(Photo).where(
            Photo.trip_id == trip.id,
            Photo.checksum_sha256 == checksum,
            Photo.deleted_at.is_(None),
        )
    )
    return result.scalars().first()


async def store_photo(
    session: AsyncSession,
    store: ObjectStore,
    trip: Trip,
    *,
    data: bytes,
    filename: str | None,
    content_type: str,
    photo_id: UUID | None = None,
    caption: str | None = None,
    stop_id: UUID | None = None,
    hint_taken_at: datetime | None = None,
    hint_lat: float | None = None,
    hint_lon: float | None = None,
) -> tuple[Photo, bool]:
    """Store the original untouched, plus a thumbnail. Returns (photo, duplicate)."""
    settings = get_settings()
    if not data:
        raise AppError("Empty upload")
    if len(data) > settings.max_upload_bytes:
        raise AppError(
            f"Photo is larger than the allowed {settings.max_upload_bytes // (1024 * 1024)} MB"
        )
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise AppError(f"Unsupported image type: {content_type}")

    checksum = hashlib.sha256(data).hexdigest()
    existing = await find_by_checksum(session, trip, checksum)
    if existing is not None:
        # Re-uploading the same bytes is a retry, not a second photo.
        return existing, True

    exif = read_exif(data)
    photo = Photo(
        trip_id=trip.id,
        stop_id=stop_id,
        checksum_sha256=checksum,
        content_type=content_type,
        byte_size=len(data),
        taken_at=exif.taken_at or hint_taken_at,
        width=exif.width,
        height=exif.height,
        altitude_m=exif.altitude_m,
        caption=caption,
        original_filename=filename,
    )
    # Assign the id before building the keys: the column default only fires on
    # flush, and a key of "photos/None/original.jpg" is both wrong and shared.
    photo.id = photo_id or uuid4()

    original_key, thumb_key = storage_keys(
        trip.id, photo.id, _extension(content_type, filename)
    )
    photo.storage_key = original_key

    # The original goes to storage byte-for-byte: no re-encode, no stripped EXIF.
    await store.put(original_key, data, content_type)
    try:
        thumbnail = make_thumbnail(data, settings.thumbnail_max_px)
    except Exception:
        thumbnail = None
    if thumbnail is not None:
        await store.put(thumb_key, thumbnail, "image/jpeg")
        photo.thumbnail_key = thumb_key

    await _apply_placement(session, trip, photo, exif, hint_lat, hint_lon)

    session.add(photo)
    await session.flush()
    await session.refresh(photo)
    return photo, False


async def list_photos(session: AsyncSession, trip: Trip) -> list[Photo]:
    result = await session.execute(
        select(Photo)
        .where(Photo.trip_id == trip.id, Photo.deleted_at.is_(None))
        .order_by(Photo.taken_at.nulls_last(), Photo.created_at)
    )
    return list(result.scalars().all())


async def get_photo(session: AsyncSession, trip: Trip, photo_id: UUID) -> Photo:
    result = await session.execute(
        select(Photo).where(
            Photo.id == photo_id, Photo.trip_id == trip.id, Photo.deleted_at.is_(None)
        )
    )
    photo = result.scalar_one_or_none()
    if photo is None:
        raise NotFoundError("Photo not found")
    return photo


async def update_photo(session: AsyncSession, photo: Photo, data: PhotoUpdate) -> Photo:
    values = data.model_dump(exclude_unset=True)
    lat, lon = values.pop("lat", None), values.pop("lon", None)
    if (lat is None) != (lon is None):
        raise AppError("lat and lon must be set together")
    if lat is not None and lon is not None:
        photo.geom = point_ewkt(lat, lon)
        photo.position_source = PositionSource.MANUAL
    for field, value in values.items():
        setattr(photo, field, value)
    await session.flush()
    await session.refresh(photo)
    return photo


async def delete_photo(session: AsyncSession, photo: Photo) -> None:
    # Soft delete: the bytes stay until a future retention job removes them, so
    # an accidental delete on one device is recoverable.
    photo.deleted_at = datetime.now(UTC)
    await session.flush()


