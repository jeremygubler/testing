"""EXIF parsing – pure, no database, no object store."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone
from io import BytesIO

import pytest
from PIL import Image

from app.services.exif import make_thumbnail, read_exif
from tests.images import jpeg

ZURICH = (47.3769, 8.5417)


def test_reads_timestamp_and_position() -> None:
    data = jpeg(taken_at="2026:06:01 08:30:00", lat=ZURICH[0], lon=ZURICH[1], altitude_m=408)
    exif = read_exif(data)

    assert exif.taken_at == datetime(2026, 6, 1, 8, 30, tzinfo=UTC)
    assert exif.lat == pytest.approx(ZURICH[0], abs=1e-4)
    assert exif.lon == pytest.approx(ZURICH[1], abs=1e-4)
    assert exif.altitude_m == pytest.approx(408)
    assert (exif.width, exif.height) == (48, 32)


def test_applies_the_offset_when_the_camera_recorded_one() -> None:
    data = jpeg(taken_at="2026:06:01 08:30:00", offset="+02:00")
    assert read_exif(data).taken_at == datetime(
        2026, 6, 1, 8, 30, tzinfo=timezone(timedelta(hours=2))
    )


def test_assumes_utc_without_an_offset() -> None:
    # EXIF timestamps carry no zone. UTC is the only defensible assumption; the
    # important part is that it is explicit rather than naive.
    assert read_exif(jpeg(taken_at="2026:06:01 08:30:00")).taken_at == datetime(
        2026, 6, 1, 8, 30, tzinfo=UTC
    )


def test_southern_and_western_hemispheres_are_negative() -> None:
    exif = read_exif(jpeg(lat=-33.8688, lon=-70.6693))
    assert exif.lat == pytest.approx(-33.8688, abs=1e-4)
    assert exif.lon == pytest.approx(-70.6693, abs=1e-4)


def test_null_island_is_treated_as_no_fix() -> None:
    # A 0/0 coordinate means the camera had no fix, not that you were in the
    # Gulf of Guinea.
    exif = read_exif(jpeg(lat=0.0, lon=0.0))
    assert exif.lat is None
    assert exif.lon is None


def test_photo_without_exif_still_yields_dimensions() -> None:
    buffer = BytesIO()
    Image.new("RGB", (10, 20), "blue").save(buffer, format="PNG")
    exif = read_exif(buffer.getvalue())
    assert (exif.width, exif.height) == (10, 20)
    assert exif.taken_at is None and exif.lat is None


def test_broken_bytes_do_not_raise() -> None:
    # A corrupt upload must fail as "no metadata", not as a 500.
    assert read_exif(b"this is not an image") == read_exif(b"")


def test_thumbnail_fits_the_box_and_keeps_the_aspect_ratio() -> None:
    data = jpeg(size=(1200, 800))
    thumbnail = make_thumbnail(data, 256)
    with Image.open(BytesIO(thumbnail)) as image:
        assert image.format == "JPEG"
        assert max(image.size) <= 256
        assert image.size[0] / image.size[1] == pytest.approx(1200 / 800, abs=0.02)
    assert len(thumbnail) < len(data)
