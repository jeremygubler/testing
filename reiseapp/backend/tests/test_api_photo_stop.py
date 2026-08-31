from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import as_user
from tests.images import jpeg

pytestmark = pytest.mark.integration

TRIPS = "/api/v1/trips"
ZURICH = (47.3769, 8.5417)
BERN = (46.9480, 7.4474)


async def _trip(api: AsyncClient, headers: dict[str, str]) -> str:
    response = await api.post(TRIPS, json={"title": "Fotoreise"}, headers=headers)
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


async def _stop(
    api: AsyncClient, headers: dict[str, str], trip: str, name: str, at: tuple[float, float]
) -> str:
    response = await api.post(
        f"{TRIPS}/{trip}/stops",
        json={"name": name, "lat": at[0], "lon": at[1]},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


async def _upload(
    api: AsyncClient, headers: dict[str, str], trip: str, data: bytes
) -> dict:
    response = await api.post(
        f"{TRIPS}/{trip}/photos",
        files={"file": ("bild.jpg", data, "image/jpeg")},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return dict(response.json())["photo"]


async def _assign(
    api: AsyncClient, headers: dict[str, str], trip: str, photo: str, stop: str | None
) -> dict:
    response = await api.patch(
        f"{TRIPS}/{trip}/photos/{photo}",
        json={"stop_id": stop},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return dict(response.json())


async def test_a_photo_without_a_position_takes_the_stops(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """A screenshot has no EXIF; the stop is the only location it will ever have."""
    _, headers = await as_user(api, db_session)
    trip = await _trip(api, headers)
    photo = await _upload(api, headers, trip, jpeg(size=(80, 60)))
    assert photo["position_source"] == "none"

    stop = await _stop(api, headers, trip, "Zürich", ZURICH)
    updated = await _assign(api, headers, trip, photo["id"], stop)

    assert updated["position_source"] == "stop"
    assert (updated["lat"], updated["lon"]) == pytest.approx(ZURICH)


async def test_a_measured_position_is_never_overwritten(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """EXIF says where the camera was; a stop only says where the day was."""
    _, headers = await as_user(api, db_session)
    trip = await _trip(api, headers)
    photo = await _upload(
        api, headers, trip, jpeg(taken_at="2026:06:01 09:15:00", lat=BERN[0], lon=BERN[1])
    )
    assert photo["position_source"] == "exif"

    stop = await _stop(api, headers, trip, "Zürich", ZURICH)
    updated = await _assign(api, headers, trip, photo["id"], stop)

    assert updated["stop_id"] == stop
    assert updated["position_source"] == "exif"
    assert (updated["lat"], updated["lon"]) == pytest.approx(BERN)


async def test_moving_to_another_stop_moves_the_photo(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip = await _trip(api, headers)
    photo = await _upload(api, headers, trip, jpeg(size=(80, 60)))
    first = await _stop(api, headers, trip, "Bern", BERN)
    second = await _stop(api, headers, trip, "Zürich", ZURICH)

    await _assign(api, headers, trip, photo["id"], first)
    updated = await _assign(api, headers, trip, photo["id"], second)

    assert (updated["lat"], updated["lon"]) == pytest.approx(ZURICH)


async def test_removing_the_stop_takes_the_borrowed_position_with_it(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """The photo never had a position of its own – leaving the stop ends it."""
    _, headers = await as_user(api, db_session)
    trip = await _trip(api, headers)
    photo = await _upload(api, headers, trip, jpeg(size=(80, 60)))
    stop = await _stop(api, headers, trip, "Zürich", ZURICH)
    await _assign(api, headers, trip, photo["id"], stop)

    updated = await _assign(api, headers, trip, photo["id"], None)

    assert updated["stop_id"] is None
    assert updated["position_source"] == "none"
    assert updated["lat"] is None and updated["lon"] is None


async def test_removing_the_stop_leaves_an_exif_position_alone(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip = await _trip(api, headers)
    photo = await _upload(
        api, headers, trip, jpeg(taken_at="2026:06:01 09:15:00", lat=BERN[0], lon=BERN[1])
    )
    stop = await _stop(api, headers, trip, "Zürich", ZURICH)
    await _assign(api, headers, trip, photo["id"], stop)

    updated = await _assign(api, headers, trip, photo["id"], None)

    assert updated["position_source"] == "exif"
    assert (updated["lat"], updated["lon"]) == pytest.approx(BERN)


async def test_a_caption_edit_does_not_touch_the_position(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """stop_id is only reconsidered when the request actually mentions it."""
    _, headers = await as_user(api, db_session)
    trip = await _trip(api, headers)
    photo = await _upload(api, headers, trip, jpeg(size=(80, 60)))
    stop = await _stop(api, headers, trip, "Zürich", ZURICH)
    await _assign(api, headers, trip, photo["id"], stop)

    response = await api.patch(
        f"{TRIPS}/{trip}/photos/{photo['id']}",
        json={"caption": "Am See"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["position_source"] == "stop"
