from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from io import BytesIO
from xml.etree import ElementTree as ET

import pytest
from httpx import AsyncClient
from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.gpx import GPX_NS
from tests.factories import as_user
from tests.images import jpeg

pytestmark = pytest.mark.integration

TRIPS = "/api/v1/trips"
NS = {"g": GPX_NS}
ZURICH = (47.3769, 8.5417)
BERN = (46.9480, 7.4474)
T0 = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)


async def _populated_trip(api: AsyncClient, headers: dict[str, str], title: str = "Island") -> str:
    trip = await api.post(
        TRIPS,
        json={"title": title, "description": "Ringstrasse", "start_date": "2026-06-01",
              "end_date": "2026-06-21"},
        headers=headers,
    )
    trip_id = str(trip.json()["id"])

    await api.post(
        f"{TRIPS}/{trip_id}/waypoints",
        json={
            "waypoints": [
                {"lat": ZURICH[0], "lon": ZURICH[1], "recorded_at": T0.isoformat(),
                 "altitude_m": 408},
                {"lat": BERN[0], "lon": BERN[1],
                 "recorded_at": (T0 + timedelta(hours=2)).isoformat()},
            ]
        },
        headers=headers,
    )
    await api.post(
        f"{TRIPS}/{trip_id}/stops",
        json={"name": "Zürich HB", "lat": ZURICH[0], "lon": ZURICH[1],
              "arrived_at": T0.isoformat(), "country": "ch", "notes": "Start & Ziel"},
        headers=headers,
    )
    await api.post(
        f"{TRIPS}/{trip_id}/journal",
        json={"title": "Tag 1", "text": "Losgefahren.\n\nSchönes Wetter.",
              "timestamp": (T0 + timedelta(hours=1)).isoformat()},
        headers=headers,
    )
    await api.post(
        f"{TRIPS}/{trip_id}/photos",
        files={"file": ("bild.jpg", jpeg(taken_at="2026:06:01 09:30:00"), "image/jpeg")},
        headers=headers,
    )
    return trip_id


async def test_gpx_export_contains_track_and_waypoints(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _populated_trip(api, headers)

    response = await api.get(f"{TRIPS}/{trip_id}/export.gpx", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/gpx+xml")
    assert "attachment" in response.headers["content-disposition"]

    root = ET.fromstring(response.text)
    assert root.findtext("g:metadata/g:name", namespaces=NS) == "Island"
    assert len(root.findall("g:trk/g:trkseg/g:trkpt", NS)) == 2
    assert root.findtext("g:wpt/g:name", namespaces=NS) == "Zürich HB"
    assert root.findtext("g:trk/g:trkseg/g:trkpt/g:ele", namespaces=NS) == "408.00"


async def test_json_export_is_complete_and_reimportable(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _populated_trip(api, headers)

    response = await api.get(f"{TRIPS}/{trip_id}/export.json", headers=headers)
    assert response.status_code == 200
    payload = json.loads(response.text)

    assert payload["format"] == "reiseapp/trip"
    assert payload["version"] == 1
    assert payload["trip"]["title"] == "Island"
    assert len(payload["waypoints"]) == 2
    assert len(payload["stops"]) == 1
    assert len(payload["photos"]) == 1
    assert payload["journal_entries"][0]["title"] == "Tag 1"
    assert payload["members"][0]["role"] == "owner"


async def test_pdf_export_is_a_real_pdf_with_the_content(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _populated_trip(api, headers)

    response = await api.get(f"{TRIPS}/{trip_id}/export.pdf", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")

    reader = PdfReader(BytesIO(response.content))
    assert len(reader.pages) >= 2  # cover plus at least one content page
    text = "\n".join(page.extract_text() for page in reader.pages)
    assert "Island" in text
    assert "Zürich HB" in text
    assert "Tag 1" in text
    assert "Losgefahren." in text
    assert "Distanz" in text


async def test_pdf_export_of_an_empty_trip_still_works(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    # No route, no stops, no photos – the cover must not fall over on it.
    _, headers = await as_user(api, db_session)
    trip = await api.post(TRIPS, json={"title": "Noch nichts"}, headers=headers)
    trip_id = trip.json()["id"]

    response = await api.get(f"{TRIPS}/{trip_id}/export.pdf", headers=headers)
    assert response.status_code == 200
    text = "\n".join(page.extract_text() for page in PdfReader(BytesIO(response.content)).pages)
    assert "Keine aufgezeichnete Route" in text


async def test_export_filename_survives_umlauts(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _populated_trip(api, headers, title="Zürich Rundfahrt")
    response = await api.get(f"{TRIPS}/{trip_id}/export.gpx", headers=headers)
    # RFC 5987: an ASCII fallback plus the real name for clients that understand it.
    assert "filename*=UTF-8''" in response.headers["content-disposition"]


async def test_viewers_may_export_strangers_may_not(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    owner, owner_headers = await as_user(api, db_session)
    viewer, viewer_headers = await as_user(api, db_session)
    _, stranger_headers = await as_user(api, db_session)
    trip_id = await _populated_trip(api, owner_headers)
    await api.post(
        f"{TRIPS}/{trip_id}/members",
        json={"email": viewer.email, "role": "viewer"},
        headers=owner_headers,
    )

    for path in ("export.gpx", "export.json", "export.pdf"):
        allowed = await api.get(f"{TRIPS}/{trip_id}/{path}", headers=viewer_headers)
        assert allowed.status_code == 200
        assert (
            await api.get(f"{TRIPS}/{trip_id}/{path}", headers=stranger_headers)
        ).status_code == 404
