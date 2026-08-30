from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import as_user
from tests.images import jpeg

pytestmark = pytest.mark.integration

TRIPS = "/api/v1/trips"
ZURICH = (47.3769, 8.5417)
T0 = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)


async def _trip(api: AsyncClient, headers: dict[str, str]) -> str:
    response = await api.post(TRIPS, json={"title": "Tagebuchreise"}, headers=headers)
    return str(response.json()["id"])


async def _photo(
    api: AsyncClient, headers: dict[str, str], trip_id: str, name: str, taken_at: str | None = None
) -> str:
    response = await api.post(
        f"{TRIPS}/{trip_id}/photos",
        files={"file": (name, jpeg(taken_at=taken_at, colour=name), "image/jpeg")},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return str(response.json()["photo"]["id"])


async def test_entry_keeps_the_given_photo_order(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    first = await _photo(api, headers, trip_id, "red")
    second = await _photo(api, headers, trip_id, "blue")
    third = await _photo(api, headers, trip_id, "green")

    created = await api.post(
        f"{TRIPS}/{trip_id}/journal",
        json={
            "title": "Tag 1",
            "text": "Angekommen.",
            "timestamp": T0.isoformat(),
            "photo_ids": [third, first, second],
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    assert [p["id"] for p in created.json()["photos"]] == [third, first, second]

    # Reordering is a plain PATCH of the list.
    reordered = await api.patch(
        f"{TRIPS}/{trip_id}/journal/{created.json()['id']}",
        json={"photo_ids": [second, third]},
        headers=headers,
    )
    assert [p["id"] for p in reordered.json()["photos"]] == [second, third]


async def test_the_same_photo_twice_is_collapsed(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    photo = await _photo(api, headers, trip_id, "red")

    created = await api.post(
        f"{TRIPS}/{trip_id}/journal",
        json={"text": "x", "timestamp": T0.isoformat(), "photo_ids": [photo, photo]},
        headers=headers,
    )
    assert created.status_code == 201
    assert len(created.json()["photos"]) == 1


async def test_photos_from_another_trip_are_refused(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    mine = await _trip(api, headers)
    other = await _trip(api, headers)
    foreign = await _photo(api, headers, other, "red")

    response = await api.post(
        f"{TRIPS}/{mine}/journal",
        json={"text": "x", "timestamp": T0.isoformat(), "photo_ids": [foreign]},
        headers=headers,
    )
    assert response.status_code == 400


async def test_entries_are_listed_chronologically(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    for title, when in (("später", T0 + timedelta(days=2)), ("früher", T0)):
        await api.post(
            f"{TRIPS}/{trip_id}/journal",
            json={"title": title, "text": "", "timestamp": when.isoformat()},
            headers=headers,
        )
    listed = (await api.get(f"{TRIPS}/{trip_id}/journal", headers=headers)).json()
    assert [entry["title"] for entry in listed] == ["früher", "später"]


async def test_delete_hides_the_entry(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    created = await api.post(
        f"{TRIPS}/{trip_id}/journal",
        json={"text": "weg", "timestamp": T0.isoformat()},
        headers=headers,
    )
    entry_id = created.json()["id"]
    assert (
        await api.delete(f"{TRIPS}/{trip_id}/journal/{entry_id}", headers=headers)
    ).status_code == 204
    assert (await api.get(f"{TRIPS}/{trip_id}/journal", headers=headers)).json() == []


async def test_viewers_may_read_but_not_write(
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

    assert (await api.get(f"{TRIPS}/{trip_id}/journal", headers=viewer_headers)).status_code == 200
    denied = await api.post(
        f"{TRIPS}/{trip_id}/journal",
        json={"text": "nope", "timestamp": T0.isoformat()},
        headers=viewer_headers,
    )
    assert denied.status_code == 403


async def test_timeline_merges_everything_in_order(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)

    await api.post(
        f"{TRIPS}/{trip_id}/stops",
        json={
            "name": "Zürich HB",
            "lat": ZURICH[0],
            "lon": ZURICH[1],
            "arrived_at": T0.isoformat(),
        },
        headers=headers,
    )
    await api.post(
        f"{TRIPS}/{trip_id}/journal",
        json={"title": "Abend", "text": "…", "timestamp": (T0 + timedelta(hours=5)).isoformat()},
        headers=headers,
    )
    await _photo(api, headers, trip_id, "red", taken_at="2026:06:01 10:00:00")

    timeline = (await api.get(f"{TRIPS}/{trip_id}/timeline", headers=headers)).json()
    kinds = [item["kind"] for item in timeline["items"]]
    assert kinds == ["stop", "photos", "journal"]
    assert timeline["items"][0]["stop"]["name"] == "Zürich HB"
    assert timeline["items"][2]["entry"]["title"] == "Abend"


async def test_timeline_clusters_photo_bursts(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)

    # Three within the hour, one much later: two clusters, not four rows.
    for name, taken in (
        ("red", "2026:06:01 10:00:00"),
        ("blue", "2026:06:01 10:20:00"),
        ("green", "2026:06:01 10:40:00"),
        ("black", "2026:06:01 18:00:00"),
    ):
        await _photo(api, headers, trip_id, name, taken_at=taken)

    items = (await api.get(f"{TRIPS}/{trip_id}/timeline", headers=headers)).json()["items"]
    assert [len(item["photos"]) for item in items] == [3, 1]


async def test_photos_of_an_entry_do_not_appear_twice(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    attached = await _photo(api, headers, trip_id, "red", taken_at="2026:06:01 10:00:00")
    loose = await _photo(api, headers, trip_id, "blue", taken_at="2026:06:01 18:00:00")

    await api.post(
        f"{TRIPS}/{trip_id}/journal",
        json={
            "title": "Mit Bild",
            "text": "",
            "timestamp": T0.isoformat(),
            "photo_ids": [attached],
        },
        headers=headers,
    )

    items = (await api.get(f"{TRIPS}/{trip_id}/timeline", headers=headers)).json()["items"]
    journal_items = [item for item in items if item["kind"] == "journal"]
    photo_items = [item for item in items if item["kind"] == "photos"]

    assert [p["id"] for p in journal_items[0]["entry"]["photos"]] == [attached]
    assert [p["id"] for cluster in photo_items for p in cluster["photos"]] == [loose]


async def test_timeline_of_an_empty_trip(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    assert (await api.get(f"{TRIPS}/{trip_id}/timeline", headers=headers)).json() == {"items": []}
