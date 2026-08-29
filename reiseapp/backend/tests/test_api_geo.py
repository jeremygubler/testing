from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import as_user

pytestmark = pytest.mark.integration

TRIPS = "/api/v1/trips"
ZURICH = (47.3769, 8.5417)
BERN = (46.9480, 7.4474)
T0 = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)


async def _trip(api: AsyncClient, headers: dict[str, str]) -> str:
    response = await api.post(TRIPS, json={"title": "Schweiz"}, headers=headers)
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


def _waypoint(lat: float, lon: float, minutes: int, **extra: object) -> dict[str, object]:
    return {
        "lat": lat,
        "lon": lon,
        "recorded_at": (T0 + timedelta(minutes=minutes)).isoformat(),
        **extra,
    }


async def test_waypoint_batch_is_idempotent(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    url = f"{TRIPS}/{trip_id}/waypoints"

    batch = {
        "waypoints": [
            _waypoint(*ZURICH, 0, id=str(uuid.uuid4()), altitude_m=408),
            _waypoint(*BERN, 120, id=str(uuid.uuid4()), altitude_m=540),
        ]
    }

    first = await api.post(url, json=batch, headers=headers)
    assert first.status_code == 200, first.text
    assert first.json() == {"received": 2, "stored": 2, "duplicates": 0}

    # A retried upload after a flaky connection must not duplicate the leg.
    again = await api.post(url, json=batch, headers=headers)
    assert again.json() == {"received": 2, "stored": 0, "duplicates": 2}

    listed = await api.get(url, headers=headers)
    assert listed.status_code == 200
    points = listed.json()
    assert len(points) == 2
    assert points[0]["lat"] == pytest.approx(ZURICH[0])
    assert points[0]["lon"] == pytest.approx(ZURICH[1])
    assert points[0]["altitude_m"] == 408
    assert points[0]["source"] == "gps"


async def test_duplicate_ids_inside_one_batch_are_collapsed(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    # ON CONFLICT cannot resolve two conflicting rows of the same statement.
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    shared = str(uuid.uuid4())
    response = await api.post(
        f"{TRIPS}/{trip_id}/waypoints",
        json={"waypoints": [_waypoint(*ZURICH, 0, id=shared), _waypoint(*BERN, 1, id=shared)]},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["stored"] == 1


async def test_waypoints_without_ids_are_accepted(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    response = await api.post(
        f"{TRIPS}/{trip_id}/waypoints",
        json={"waypoints": [_waypoint(*ZURICH, 0)]},
        headers=headers,
    )
    assert response.json()["stored"] == 1


async def test_impossible_coordinates_are_rejected(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    response = await api.post(
        f"{TRIPS}/{trip_id}/waypoints",
        json={"waypoints": [_waypoint(91.0, 8.5, 0)]},
        headers=headers,
    )
    assert response.status_code == 422


async def test_route_is_geojson_with_length_and_bounds(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    await api.post(
        f"{TRIPS}/{trip_id}/waypoints",
        json={"waypoints": [_waypoint(*ZURICH, 0), _waypoint(*BERN, 120)]},
        headers=headers,
    )

    response = await api.get(f"{TRIPS}/{trip_id}/route", headers=headers)
    assert response.status_code == 200
    route = response.json()
    assert route["type"] == "LineString"
    assert route["point_count"] == 2
    assert 90_000 < route["distance_m"] < 100_000  # Zürich–Bern ≈ 95 km
    # GeoJSON is longitude-first.
    assert route["coordinates"][0][0] == pytest.approx(ZURICH[1], abs=1e-5)
    assert route["bounds"] == pytest.approx([BERN[1], BERN[0], ZURICH[1], ZURICH[0]], abs=1e-5)


async def test_route_of_an_empty_trip(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    route = (await api.get(f"{TRIPS}/{trip_id}/route", headers=headers)).json()
    assert route == {
        "type": "LineString",
        "coordinates": [],
        "point_count": 0,
        "distance_m": 0.0,
        "bounds": None,
    }


async def test_route_of_a_single_waypoint(api: AsyncClient, db_session: AsyncSession) -> None:
    # ST_MakeLine over one row returns a POINT, whose coordinates are a bare pair.
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    await api.post(
        f"{TRIPS}/{trip_id}/waypoints",
        json={"waypoints": [_waypoint(*ZURICH, 0)]},
        headers=headers,
    )
    route = (await api.get(f"{TRIPS}/{trip_id}/route", headers=headers)).json()
    assert route["coordinates"] == [pytest.approx([ZURICH[1], ZURICH[0]], abs=1e-5)]
    assert route["distance_m"] == 0.0


async def test_simplification_drops_points_but_keeps_the_ends(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    # A straight line with a barely-off middle point: Douglas-Peucker should drop it.
    points = [
        _waypoint(47.0, 8.0, 0),
        _waypoint(47.5, 8.5001, 30),
        _waypoint(48.0, 9.0, 60),
    ]
    await api.post(f"{TRIPS}/{trip_id}/waypoints", json={"waypoints": points}, headers=headers)

    full = (await api.get(f"{TRIPS}/{trip_id}/route", headers=headers)).json()
    simplified = (
        await api.get(f"{TRIPS}/{trip_id}/route?simplify_m=1000", headers=headers)
    ).json()

    assert len(full["coordinates"]) == 3
    assert len(simplified["coordinates"]) == 2
    assert simplified["coordinates"][0] == full["coordinates"][0]
    assert simplified["coordinates"][-1] == full["coordinates"][-1]
    # point_count and distance always describe the real track, not the simplified one.
    assert simplified["point_count"] == 3


async def test_stop_crud(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    url = f"{TRIPS}/{trip_id}/stops"

    created = await api.post(
        url,
        json={
            "name": "Zürich HB",
            "lat": ZURICH[0],
            "lon": ZURICH[1],
            "country": "ch",
            "arrived_at": T0.isoformat(),
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    stop = created.json()
    assert stop["lat"] == pytest.approx(ZURICH[0])
    assert stop["country"] == "CH"

    patched = await api.patch(
        f"{url}/{stop['id']}",
        json={"name": "Zürich Hauptbahnhof", "lat": BERN[0], "lon": BERN[1]},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Zürich Hauptbahnhof"
    assert patched.json()["lat"] == pytest.approx(BERN[0])

    assert (await api.delete(f"{url}/{stop['id']}", headers=headers)).status_code == 204
    assert (await api.get(f"{url}/{stop['id']}", headers=headers)).status_code == 404
    assert (await api.get(url, headers=headers)).json() == []


async def test_stop_position_must_be_updated_as_a_pair(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    created = await api.post(
        f"{TRIPS}/{trip_id}/stops",
        json={"name": "Irgendwo", "lat": ZURICH[0], "lon": ZURICH[1]},
        headers=headers,
    )
    response = await api.patch(
        f"{TRIPS}/{trip_id}/stops/{created.json()['id']}",
        json={"lat": 46.0},
        headers=headers,
    )
    assert response.status_code == 422


async def test_stops_are_ordered_by_arrival_with_undated_last(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    url = f"{TRIPS}/{trip_id}/stops"
    for name, arrived in (("später", T0 + timedelta(days=2)), ("früher", T0), ("offen", None)):
        payload: dict[str, object] = {"name": name, "lat": ZURICH[0], "lon": ZURICH[1]}
        if arrived:
            payload["arrived_at"] = arrived.isoformat()
        await api.post(url, json=payload, headers=headers)

    assert [s["name"] for s in (await api.get(url, headers=headers)).json()] == [
        "früher",
        "später",
        "offen",
    ]


async def test_geo_writes_need_the_editor_role(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    owner, owner_headers = await as_user(api, db_session)
    viewer, viewer_headers = await as_user(api, db_session)
    trip_id = await _trip(api, owner_headers)
    await api.post(
        f"{TRIPS}/{trip_id}/members",
        json={"email": viewer.email, "role": "viewer"},
        headers=owner_headers,
    )

    stop = {"name": "Nope", "lat": ZURICH[0], "lon": ZURICH[1]}
    assert (
        await api.post(f"{TRIPS}/{trip_id}/stops", json=stop, headers=viewer_headers)
    ).status_code == 403
    assert (
        await api.post(
            f"{TRIPS}/{trip_id}/waypoints",
            json={"waypoints": [_waypoint(*ZURICH, 0)]},
            headers=viewer_headers,
        )
    ).status_code == 403

    # Reading stays open to viewers.
    assert (await api.get(f"{TRIPS}/{trip_id}/route", headers=viewer_headers)).status_code == 200
    assert (await api.get(f"{TRIPS}/{trip_id}/stops", headers=viewer_headers)).status_code == 200


async def test_geo_endpoints_hide_foreign_trips(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_headers = await as_user(api, db_session)
    _, stranger_headers = await as_user(api, db_session)
    trip_id = await _trip(api, owner_headers)

    assert (
        await api.get(f"{TRIPS}/{trip_id}/route", headers=stranger_headers)
    ).status_code == 404
    assert (
        await api.get(f"{TRIPS}/{trip_id}/stops", headers=stranger_headers)
    ).status_code == 404
