from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import as_user

pytestmark = pytest.mark.integration

TRIPS = "/api/v1/trips"
DAY_ONE = datetime(2026, 6, 1, 9, 0, tzinfo=UTC)


async def _trip(api: AsyncClient, headers: dict[str, str], **fields: object) -> str:
    response = await api.post(TRIPS, json={"title": "Reise", **fields}, headers=headers)
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


async def _entry(
    api: AsyncClient, headers: dict[str, str], trip: str, text: str, at: datetime
) -> None:
    response = await api.post(
        f"{TRIPS}/{trip}/journal",
        json={"title": None, "text": text, "timestamp": at.isoformat()},
        headers=headers,
    )
    assert response.status_code == 201, response.text


async def _timeline(api: AsyncClient, headers: dict[str, str], trip: str) -> list[dict]:
    response = await api.get(f"{TRIPS}/{trip}/timeline", headers=headers)
    assert response.status_code == 200, response.text
    return list(response.json()["items"])


async def test_the_first_thing_that_happened_is_day_one(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip = await _trip(api, headers)
    await _entry(api, headers, trip, "Los geht's", DAY_ONE)

    items = await _timeline(api, headers, trip)
    assert items[0]["day"] == 1
    assert items[0]["date"] == "2026-06-01"


async def test_days_count_from_the_start_not_from_each_entry(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip = await _trip(api, headers)
    for offset, text in ((0, "Ankunft"), (2, "Wanderung"), (9, "Rückflug")):
        await _entry(api, headers, trip, text, DAY_ONE + timedelta(days=offset))

    items = await _timeline(api, headers, trip)
    assert [item["day"] for item in items] == [1, 3, 10]


async def test_several_rows_on_one_day_share_its_number(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip = await _trip(api, headers)
    await _entry(api, headers, trip, "Morgens", DAY_ONE)
    await _entry(api, headers, trip, "Abends", DAY_ONE + timedelta(hours=11))

    items = await _timeline(api, headers, trip)
    assert [item["day"] for item in items] == [1, 1]
    assert len({item["date"] for item in items}) == 1


async def test_a_planned_start_before_the_first_entry_sets_day_one(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """Booked on the 1st, first photo on the 3rd: that photo belongs to day 3."""
    _, headers = await as_user(api, db_session)
    trip = await _trip(api, headers, start_date="2026-06-01")
    await _entry(api, headers, trip, "Endlich da", DAY_ONE + timedelta(days=2))

    items = await _timeline(api, headers, trip)
    assert items[0]["day"] == 3


async def test_something_before_the_planned_start_still_lands_on_day_one(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """A photo taken while packing must not push the journey into day zero."""
    _, headers = await as_user(api, db_session)
    trip = await _trip(api, headers, start_date="2026-06-05")
    await _entry(api, headers, trip, "Koffer", DAY_ONE)

    items = await _timeline(api, headers, trip)
    assert items[0]["day"] == 1


async def test_an_empty_trip_has_no_rows_and_no_day(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip = await _trip(api, headers)
    assert await _timeline(api, headers, trip) == []
