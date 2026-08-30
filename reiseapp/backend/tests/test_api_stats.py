from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import as_user
from tests.images import jpeg

pytestmark = pytest.mark.integration

TRIPS = "/api/v1/trips"
T0 = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)


async def _trip(api: AsyncClient, headers: dict[str, str]) -> str:
    response = await api.post(TRIPS, json={"title": "Statistik"}, headers=headers)
    return str(response.json()["id"])


def _walk(minutes: int, lat: float, altitude: float | None = None) -> dict[str, object]:
    point: dict[str, object] = {
        "lat": lat,
        "lon": 8.0,
        "recorded_at": (T0 + timedelta(minutes=minutes)).isoformat(),
    }
    if altitude is not None:
        point["altitude_m"] = altitude
    return point


async def test_stats_of_an_empty_trip_are_zero(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    stats = (await api.get(f"{TRIPS}/{trip_id}/stats", headers=headers)).json()

    assert stats["distance_m"] == 0
    assert stats["waypoint_count"] == 0
    assert stats["first_point_at"] is None
    assert stats["countries"] == []


async def test_stats_split_distance_by_pace(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    # Ten minutes at walking pace, then ten at driving pace.
    await api.post(
        f"{TRIPS}/{trip_id}/waypoints",
        json={"waypoints": [_walk(0, 47.0), _walk(10, 47.0075), _walk(20, 47.1425)]},
        headers=headers,
    )

    stats = (await api.get(f"{TRIPS}/{trip_id}/stats", headers=headers)).json()
    assert stats["walking_m"] > 0
    assert stats["vehicle_m"] > stats["walking_m"]
    assert stats["moving_seconds"] == 1200
    assert stats["tracked_seconds"] == 1200
    assert stats["waypoint_count"] == 3


async def test_elevation_ignores_gps_jitter(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """Standing still with a wandering altitude must not invent a climb."""
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    noisy = [402.0, 397.0, 404.0, 399.0, 403.0, 398.0]
    await api.post(
        f"{TRIPS}/{trip_id}/waypoints",
        json={
            "waypoints": [
                _walk(i * 5, 47.0 + i * 0.0001, altitude) for i, altitude in enumerate(noisy)
            ]
        },
        headers=headers,
    )

    stats = (await api.get(f"{TRIPS}/{trip_id}/stats", headers=headers)).json()
    assert stats["elevation_gain_m"] == 0
    assert stats["elevation_loss_m"] == 0


async def test_a_real_climb_is_counted(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    await api.post(
        f"{TRIPS}/{trip_id}/waypoints",
        json={
            "waypoints": [
                _walk(0, 47.000, 400.0),
                _walk(10, 47.005, 700.0),
                _walk(20, 47.010, 500.0),
            ]
        },
        headers=headers,
    )

    stats = (await api.get(f"{TRIPS}/{trip_id}/stats", headers=headers)).json()
    assert stats["elevation_gain_m"] == pytest.approx(300, abs=1)
    assert stats["elevation_loss_m"] == pytest.approx(200, abs=1)


async def test_stats_count_content_and_countries(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    for name, country in (("Zürich", "ch"), ("Como", "it"), ("Genf", "ch")):
        await api.post(
            f"{TRIPS}/{trip_id}/stops",
            json={"name": name, "lat": 46.0, "lon": 8.0, "country": country},
            headers=headers,
        )
    await api.post(
        f"{TRIPS}/{trip_id}/journal",
        json={"text": "x", "timestamp": T0.isoformat()},
        headers=headers,
    )
    await api.post(
        f"{TRIPS}/{trip_id}/photos",
        files={"file": ("a.jpg", jpeg(), "image/jpeg")},
        headers=headers,
    )

    stats = (await api.get(f"{TRIPS}/{trip_id}/stats", headers=headers)).json()
    assert stats["stop_count"] == 3
    assert stats["photo_count"] == 1
    assert stats["journal_entry_count"] == 1
    assert stats["countries"] == ["CH", "IT"]


async def test_stats_follow_the_trip_permissions(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    owner, owner_headers = await as_user(api, db_session)
    viewer, viewer_headers = await as_user(api, db_session)
    _, stranger_headers = await as_user(api, db_session)
    trip_id = await _trip(api, owner_headers)
    await api.post(
        f"{TRIPS}/{trip_id}/members",
        json={"email": viewer.email, "role": "viewer"},
        headers=owner_headers,
    )

    assert (await api.get(f"{TRIPS}/{trip_id}/stats", headers=viewer_headers)).status_code == 200
    assert (
        await api.get(f"{TRIPS}/{trip_id}/stats", headers=stranger_headers)
    ).status_code == 404
