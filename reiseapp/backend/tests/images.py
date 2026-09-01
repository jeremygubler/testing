"""Builds small JPEGs with controlled EXIF for the photo tests."""

from __future__ import annotations

from io import BytesIO

from PIL import Image


def _dms(value: float) -> tuple[float, float, float]:
    degrees = int(abs(value))
    minutes_full = (abs(value) - degrees) * 60
    minutes = int(minutes_full)
    seconds = (minutes_full - minutes) * 60
    return (float(degrees), float(minutes), round(seconds, 4))


def jpeg(
    *,
    taken_at: str | None = None,
    offset: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    altitude_m: float | None = None,
    size: tuple[int, int] = (48, 32),
    colour: str = "red",
) -> bytes:
    image = Image.new("RGB", size, colour)
    exif = Image.Exif()

    if taken_at is not None:
        exif_ifd: dict[int, object] = {0x9003: taken_at}
        if offset is not None:
            exif_ifd[0x9011] = offset
        exif[0x8769] = exif_ifd

    if lat is not None and lon is not None:
        gps: dict[int, object] = {
            1: "N" if lat >= 0 else "S",
            2: _dms(lat),
            3: "E" if lon >= 0 else "W",
            4: _dms(lon),
        }
        if altitude_m is not None:
            gps[5] = 0 if altitude_m >= 0 else 1
            gps[6] = abs(altitude_m)
        exif[0x8825] = gps

    buffer = BytesIO()
    image.save(buffer, format="JPEG", exif=exif)
    return buffer.getvalue()
