from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import as_user

pytestmark = pytest.mark.integration

TRIPS = "/api/v1/trips"
T0 = datetime(2026, 8, 31, 13, 26, tzinfo=UTC)


async def _trip_with_track(
    api: AsyncClient, headers: dict[str, str], points: int
) -> str:
    trip = str((await api.post(TRIPS, json={"title": "Reiden"}, headers=headers)).json()["id"])
    if points:
        response = await api.post(
            f"{TRIPS}/{trip}/waypoints",
            json={
                "waypoints": [
                    {
                        "lat": 47.24334 + index * 0.001,
                        "lon": 7.96880,
                        "recorded_at": (T0 + timedelta(minutes=index)).isoformat(),
                    }
                    for index in range(points)
                ]
            },
            headers=headers,
        )
        assert response.status_code == 200, response.text
    return trip


async def test_clearing_a_track_reports_what_it_removed(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip = await _trip_with_track(api, headers, 5)

    response = await api.delete(f"{TRIPS}/{trip}/waypoints", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"removed": 5}


async def test_the_route_is_empty_afterwards(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip = await _trip_with_track(api, headers, 5)
    await api.delete(f"{TRIPS}/{trip}/waypoints", headers=headers)

    route = (await api.get(f"{TRIPS}/{trip}/route", headers=headers)).json()
    assert route["coordinates"] == []
    assert route["distance_m"] == 0.0
    assert (await api.get(f"{TRIPS}/{trip}/waypoints", headers=headers)).json() == []


async def test_the_trip_and_its_stops_survive(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """Clearing a track is not deleting a trip – that is a different button."""
    _, headers = await as_user(api, db_session)
    trip = await _trip_with_track(api, headers, 3)
    await api.post(
        f"{TRIPS}/{trip}/stops",
        json={"name": "Vater besuchen", "lat": 47.24, "lon": 7.96},
        headers=headers,
    )

    await api.delete(f"{TRIPS}/{trip}/waypoints", headers=headers)

    assert (await api.get(f"{TRIPS}/{trip}", headers=headers)).status_code == 200
    stops = (await api.get(f"{TRIPS}/{trip}/stops", headers=headers)).json()
    assert [stop["name"] for stop in stops] == ["Vater besuchen"]


async def test_clearing_twice_is_harmless(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip = await _trip_with_track(api, headers, 4)

    await api.delete(f"{TRIPS}/{trip}/waypoints", headers=headers)
    second = await api.delete(f"{TRIPS}/{trip}/waypoints", headers=headers)
    assert second.json() == {"removed": 0}


async def test_a_trip_without_a_track_removes_nothing(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip = await _trip_with_track(api, headers, 0)
    assert (await api.delete(f"{TRIPS}/{trip}/waypoints", headers=headers)).json() == {
        "removed": 0
    }


async def test_a_viewer_may_not_clear_someone_elses_track(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, mine = await as_user(api, db_session, email="me@example.com")
    _, theirs = await as_user(api, db_session, email="other@example.com")
    trip = await _trip_with_track(api, mine, 3)

    assert (await api.delete(f"{TRIPS}/{trip}/waypoints", headers=theirs)).status_code == 404
    assert len((await api.get(f"{TRIPS}/{trip}/waypoints", headers=mine)).json()) == 3
