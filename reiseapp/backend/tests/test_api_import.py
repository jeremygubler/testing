from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import as_user

pytestmark = pytest.mark.integration

TRIPS = "/api/v1/trips"
IMPORT = "/api/v1/import"
T0 = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)

GPX = """<?xml version="1.0"?>
<gpx version="1.1" creator="Garmin" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Alpenquerung</name></metadata>
  <wpt lat="47.3769" lon="8.5417"><name>Zürich HB</name></wpt>
  <trk><trkseg>
    <trkpt lat="47.3769" lon="8.5417"><ele>408</ele><time>2026-06-01T08:00:00Z</time></trkpt>
    <trkpt lat="46.9480" lon="7.4474"><time>2026-06-01T10:00:00Z</time></trkpt>
  </trkseg></trk>
</gpx>
""".encode()


async def _import(
    api: AsyncClient, headers: dict[str, str], data: bytes, name: str = "spur.gpx", **fields: str
) -> dict:
    response = await api.post(
        IMPORT,
        files={"file": (name, data, "application/octet-stream")},
        data=fields,
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return dict(response.json())


async def test_gpx_import_creates_a_trip_with_route_and_stops(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    result = await _import(api, headers, GPX)

    assert result["trip_created"] is True
    assert result["detected_format"] == "gpx"
    assert result["waypoints_stored"] == 2
    assert result["stops_created"] == 1

    trip_id = result["trip_id"]
    route = (await api.get(f"{TRIPS}/{trip_id}/route", headers=headers)).json()
    assert route["point_count"] == 2
    assert 90_000 < route["distance_m"] < 100_000
    listed = (await api.get(f"{TRIPS}/{trip_id}", headers=headers)).json()
    assert listed["title"] == "Alpenquerung"


async def test_importing_the_same_file_twice_changes_nothing(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """Ids are derived from content, so a second run collides instead of doubling."""
    _, headers = await as_user(api, db_session)
    first = await _import(api, headers, GPX)
    trip_id = first["trip_id"]

    second = await _import(api, headers, GPX, trip_id=trip_id)
    assert second["trip_created"] is False
    assert second["waypoints_stored"] == 0
    assert second["waypoints_duplicate"] == 2
    assert second["stops_duplicate"] == 1

    route = (await api.get(f"{TRIPS}/{trip_id}/route", headers=headers)).json()
    assert route["point_count"] == 2


async def test_import_into_an_existing_trip(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    trip = await api.post(TRIPS, json={"title": "Bestehend"}, headers=headers)
    trip_id = trip.json()["id"]

    result = await _import(api, headers, GPX, trip_id=trip_id)
    assert result["trip_id"] == trip_id
    assert result["trip_created"] is False
    # The existing title stays; an import must not rename someone's trip.
    assert (await api.get(f"{TRIPS}/{trip_id}", headers=headers)).json()["title"] == "Bestehend"


async def test_export_import_round_trip(api: AsyncClient, db_session: AsyncSession) -> None:
    """Export it, import it, get the same trip back – data ownership, concretely."""
    _, headers = await as_user(api, db_session)
    original = await api.post(
        TRIPS, json={"title": "Island", "description": "Ringstrasse"}, headers=headers
    )
    trip_id = original.json()["id"]
    await api.post(
        f"{TRIPS}/{trip_id}/waypoints",
        json={
            "waypoints": [
                {"lat": 64.14, "lon": -21.94, "recorded_at": T0.isoformat()},
                {"lat": 65.68, "lon": -18.09,
                 "recorded_at": (T0 + timedelta(hours=4)).isoformat()},
            ]
        },
        headers=headers,
    )
    await api.post(
        f"{TRIPS}/{trip_id}/stops",
        json={"name": "Reykjavík", "lat": 64.14, "lon": -21.94, "country": "is"},
        headers=headers,
    )
    await api.post(
        f"{TRIPS}/{trip_id}/journal",
        json={"title": "Tag 1", "text": "Angekommen.", "timestamp": T0.isoformat()},
        headers=headers,
    )

    dump = (await api.get(f"{TRIPS}/{trip_id}/export.json", headers=headers)).content
    result = await _import(api, headers, dump, name="island.json")

    assert result["detected_format"] == "fernspur"
    assert result["waypoints_stored"] == 2
    assert result["stops_created"] == 1
    assert result["entries_created"] == 1

    copy_id = result["trip_id"]
    assert copy_id != trip_id
    copy = (await api.get(f"{TRIPS}/{copy_id}", headers=headers)).json()
    assert copy["title"] == "Island"
    assert copy["description"] == "Ringstrasse"
    stops = (await api.get(f"{TRIPS}/{copy_id}/stops", headers=headers)).json()
    assert [stop["name"] for stop in stops] == ["Reykjavík"]
    assert stops[0]["country"] == "IS"


async def test_google_timeline_import(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    payload = json.dumps(
        {
            "locations": [
                {"latitudeE7": 473769000, "longitudeE7": 85417000,
                 "timestampMs": "1780000000000"},
                {"latitudeE7": 469480000, "longitudeE7": 74474000,
                 "timestampMs": "1780003600000"},
            ]
        }
    ).encode()

    result = await _import(api, headers, payload, name="Records.json")
    assert result["detected_format"] == "google_timeline"
    assert result["waypoints_stored"] == 2


async def test_explicit_format_overrides_detection(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    result = await _import(api, headers, GPX, name="unbenannt.bin", format="gpx")
    assert result["detected_format"] == "gpx"


async def test_warnings_are_reported_not_swallowed(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    broken = b"""<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>
  <trkpt lat="47.0" lon="8.0"><time>2026-06-01T08:00:00Z</time></trkpt>
  <trkpt lat="999" lon="8.0"><time>2026-06-01T09:00:00Z</time></trkpt>
</trkseg></trk></gpx>"""
    _, headers = await as_user(api, db_session)
    result = await _import(api, headers, broken)
    assert result["waypoints_stored"] == 1
    assert result["warnings"] and "1 Punkte" in result["warnings"][0]


async def test_unreadable_file_is_refused(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    response = await api.post(
        IMPORT,
        files={"file": ("notes.txt", b"just some text", "text/plain")},
        headers=headers,
    )
    assert response.status_code == 400


async def test_empty_file_is_refused(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    response = await api.post(
        IMPORT, files={"file": ("leer.gpx", b"", "application/gpx+xml")}, headers=headers
    )
    assert response.status_code == 400


async def test_import_needs_authentication(api: AsyncClient) -> None:
    response = await api.post(IMPORT, files={"file": ("a.gpx", GPX, "application/gpx+xml")})
    assert response.status_code == 401


async def test_viewers_cannot_import_into_a_trip(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    owner, owner_headers = await as_user(api, db_session)
    viewer, viewer_headers = await as_user(api, db_session)
    trip = await api.post(TRIPS, json={"title": "Fremd"}, headers=owner_headers)
    trip_id = trip.json()["id"]
    await api.post(
        f"{TRIPS}/{trip_id}/members",
        json={"email": viewer.email, "role": "viewer"},
        headers=owner_headers,
    )

    response = await api.post(
        IMPORT,
        files={"file": ("a.gpx", GPX, "application/gpx+xml")},
        data={"trip_id": trip_id},
        headers=viewer_headers,
    )
    assert response.status_code == 403


async def test_strangers_get_a_404_for_someone_elses_trip(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_headers = await as_user(api, db_session)
    _, stranger_headers = await as_user(api, db_session)
    trip = await api.post(TRIPS, json={"title": "Privat"}, headers=owner_headers)

    response = await api.post(
        IMPORT,
        files={"file": ("a.gpx", GPX, "application/gpx+xml")},
        data={"trip_id": trip.json()["id"]},
        headers=stranger_headers,
    )
    assert response.status_code == 404
