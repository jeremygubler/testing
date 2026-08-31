from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import as_user

pytestmark = pytest.mark.integration

TRIPS = "/api/v1/trips"
OVERVIEW = f"{TRIPS}/overview"
T0 = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)


async def _trip(api: AsyncClient, headers: dict[str, str], title: str) -> str:
    response = await api.post(TRIPS, json={"title": title}, headers=headers)
    return str(response.json()["id"])


def _point(minutes: int, lat: float, lon: float) -> dict[str, object]:
    return {
        "lat": lat,
        "lon": lon,
        "recorded_at": (T0 + timedelta(minutes=minutes)).isoformat(),
    }


async def _track(
    api: AsyncClient, headers: dict[str, str], trip: str, points: list[dict[str, object]]
) -> None:
    response = await api.post(
        f"{TRIPS}/{trip}/waypoints", json={"waypoints": points}, headers=headers
    )
    # A rejected batch would leave the trip empty and make the assertions below
    # read as a bug in the overview rather than a typo in the payload.
    assert response.status_code == 200, response.text


async def test_overview_is_not_swallowed_by_the_trip_id_route(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """/overview sits next to /{trip_id}; declaration order is what keeps it reachable."""
    _, headers = await as_user(api, db_session)
    response = await api.get(OVERVIEW, headers=headers)
    assert response.status_code == 200
    assert "trips" in response.json()


async def test_overview_of_a_new_account_is_empty_not_an_error(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    body = (await api.get(OVERVIEW, headers=headers)).json()
    assert body == {"trips": [], "countries": [], "total_distance_m": 0.0}


async def test_overview_returns_a_line_and_bounds_per_trip(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip = await _trip(api, headers, "Alpen")
    await _track(
        api,
        headers,
        trip,
        [_point(0, 47.0, 8.0), _point(60, 46.5, 8.5), _point(120, 46.0, 9.0)],
    )

    body = (await api.get(OVERVIEW, headers=headers)).json()
    entry = next(item for item in body["trips"] if item["id"] == trip)

    assert entry["title"] == "Alpen"
    assert entry["point_count"] == 3
    assert entry["distance_m"] > 100_000
    assert len(entry["coordinates"]) >= 2
    # [west, south, east, north] – the order fitBounds expects.
    assert entry["bounds"] == pytest.approx([8.0, 46.0, 9.0, 47.0])
    assert body["total_distance_m"] == pytest.approx(entry["distance_m"])


async def test_a_trip_without_a_route_still_appears(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """A planned trip has no points yet and must not vanish from the map screen."""
    _, headers = await as_user(api, db_session)
    trip = await _trip(api, headers, "Noch nichts")

    entry = next(
        item
        for item in (await api.get(OVERVIEW, headers=headers)).json()["trips"]
        if item["id"] == trip
    )
    assert entry["coordinates"] == []
    assert entry["bounds"] is None
    assert entry["distance_m"] == 0.0


async def test_a_single_point_is_not_a_route(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """One waypoint makes a degenerate line no map can draw and no length to report."""
    _, headers = await as_user(api, db_session)
    trip = await _trip(api, headers, "Ein Punkt")
    await _track(api, headers, trip, [_point(0, 47.0, 8.0)])

    entry = next(
        item
        for item in (await api.get(OVERVIEW, headers=headers)).json()["trips"]
        if item["id"] == trip
    )
    assert entry["coordinates"] == []
    assert entry["distance_m"] == 0.0


async def test_countries_are_unioned_across_trips(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    first = await _trip(api, headers, "Erste")
    second = await _trip(api, headers, "Zweite")
    for trip, countries in ((first, ["CH", "IT"]), (second, ["CH", "FR"])):
        for country in countries:
            await api.post(
                f"{TRIPS}/{trip}/stops",
                json={"name": country, "lat": 47.0, "lon": 8.0, "country": country},
                headers=headers,
            )

    body = (await api.get(OVERVIEW, headers=headers)).json()
    # A country visited on two trips is still one country.
    assert body["countries"] == ["CH", "FR", "IT"]


async def test_overview_shows_only_trips_the_user_may_see(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, mine = await as_user(api, db_session, email="me@example.com")
    _, theirs = await as_user(api, db_session, email="other@example.com")
    await _trip(api, mine, "Meine")
    await _trip(api, theirs, "Fremde")

    titles = [item["title"] for item in (await api.get(OVERVIEW, headers=mine)).json()["trips"]]
    assert titles == ["Meine"]


async def test_overview_needs_authentication(api: AsyncClient) -> None:
    assert (await api.get(OVERVIEW)).status_code == 401
