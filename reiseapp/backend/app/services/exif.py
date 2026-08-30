"""EXIF extraction.

The server is the source of truth for photo metadata: the app may read EXIF for
instant feedback, but what gets stored is what the backend read from the original
bytes. That keeps imported photos (phase 7) and photos from older app versions on
the same footing.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone
from io import BytesIO
from typing import Any

import pillow_heif
from PIL import Image, ImageOps

# iPhones shoot HEIC by default; without this every one of them is unreadable.
pillow_heif.register_heif_opener()

logger = logging.getLogger(__name__)

# EXIF tag numbers (Pillow exposes the IFDs by their tag id).
_EXIF_IFD = 0x8769
_GPS_IFD = 0x8825
_DATETIME_ORIGINAL = 0x9003
_OFFSET_TIME_ORIGINAL = 0x9011
_DATETIME_DIGITIZED = 0x9004
_IMAGE_DATETIME = 0x0132

_GPS_LAT_REF, _GPS_LAT = 1, 2
_GPS_LON_REF, _GPS_LON = 3, 4
_GPS_ALT_REF, _GPS_ALT = 5, 6


@dataclass(frozen=True)
class ExifData:
    taken_at: datetime | None = None
    lat: float | None = None
    lon: float | None = None
    altitude_m: float | None = None
    width: int | None = None
    height: int | None = None


def _to_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _dms_to_degrees(value: Any, ref: Any) -> float | None:
    """EXIF stores coordinates as degrees/minutes/seconds plus a N/S/E/W ref."""
    try:
        degrees, minutes, seconds = (_to_float(part) for part in value)
    except (TypeError, ValueError):
        return None
    if degrees is None or minutes is None or seconds is None:
        return None

    result = degrees + minutes / 60 + seconds / 3600
    if isinstance(ref, str) and ref.upper() in {"S", "W"}:
        result = -result
    return result


def _parse_offset(offset: Any) -> timezone | None:
    """OffsetTimeOriginal looks like "+02:00"."""
    if not isinstance(offset, str) or len(offset) < 6:
        return None
    sign = 1 if offset[0] == "+" else -1 if offset[0] == "-" else None
    if sign is None:
        return None
    try:
        hours, minutes = int(offset[1:3]), int(offset[4:6])
    except ValueError:
        return None
    return timezone(sign * timedelta(hours=hours, minutes=minutes))


def _parse_datetime(raw: Any, offset: Any) -> datetime | None:
    if not isinstance(raw, str):
        return None
    try:
        naive = datetime.strptime(raw.strip(), "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None
    # EXIF timestamps carry no zone. Newer phones add OffsetTimeOriginal; without
    # it UTC is the only defensible assumption, and it is recorded as such rather
    # than silently reinterpreted later.
    return naive.replace(tzinfo=_parse_offset(offset) or UTC)


def read_exif(data: bytes) -> ExifData:
    """Never raises: a photo with broken metadata is still a photo."""
    try:
        with Image.open(BytesIO(data)) as image:
            # Orientation-corrected dimensions, so a portrait photo is not
            # reported as landscape.
            oriented = ImageOps.exif_transpose(image) or image
            width, height = oriented.size
            exif = image.getexif()

            exif_ifd = exif.get_ifd(_EXIF_IFD) if exif else {}
            gps_ifd = exif.get_ifd(_GPS_IFD) if exif else {}

            taken_at = _parse_datetime(
                exif_ifd.get(_DATETIME_ORIGINAL)
                or exif_ifd.get(_DATETIME_DIGITIZED)
                or exif.get(_IMAGE_DATETIME),
                exif_ifd.get(_OFFSET_TIME_ORIGINAL),
            )

            lat = _dms_to_degrees(gps_ifd.get(_GPS_LAT), gps_ifd.get(_GPS_LAT_REF))
            lon = _dms_to_degrees(gps_ifd.get(_GPS_LON), gps_ifd.get(_GPS_LON_REF))
            altitude = _to_float(gps_ifd.get(_GPS_ALT))
            if altitude is not None and gps_ifd.get(_GPS_ALT_REF) in (1, b"\x01"):
                altitude = -altitude  # below sea level

            # A 0/0 GPS fix means "no fix", not "Gulf of Guinea".
            if lat is not None and lon is not None and lat == 0 and lon == 0:
                lat = lon = None
            if lat is not None and not -90 <= lat <= 90:
                lat = None
            if lon is not None and not -180 <= lon <= 180:
                lon = None

            return ExifData(
                taken_at=taken_at,
                lat=lat,
                lon=lon,
                altitude_m=altitude,
                width=width,
                height=height,
            )
    except Exception:
        logger.warning("could not read EXIF from upload", exc_info=True)
        return ExifData()


def make_thumbnail(data: bytes, max_px: int) -> bytes:
    """A JPEG preview for the gallery. The original is never touched."""
    with Image.open(BytesIO(data)) as image:
        oriented = ImageOps.exif_transpose(image) or image
        oriented.thumbnail((max_px, max_px))
        buffer = BytesIO()
        oriented.convert("RGB").save(buffer, format="JPEG", quality=82, optimize=True)
        return buffer.getvalue()
