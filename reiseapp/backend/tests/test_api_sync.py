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
BERN = (46.9480, 7.4474)
T0 = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)
LATER = T0 + timedelta(days=1)
MUCH_LATER = T0 + timedelta(days=365)


async def _trip(api: AsyncClient, headers: dict[str, str], title: str = "Sync") -> str:
    response = await api.post(TRIPS, json={"title": title}, headers=headers)
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


async def _pull(api: AsyncClient, headers: dict[str, str], trip_id: str, since: str | None = None):
    url = f"{TRIPS}/{trip_id}/sync/pull"
    if since:
        url += f"?since={since}"
    response = await api.get(url, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def _push(api: AsyncClient, headers: dict[str, str], trip_id: str, payload: dict):
    response = await api.post(f"{TRIPS}/{trip_id}/sync/push", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


async def test_full_pull_returns_the_whole_trip(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers, "Island")
    await api.post(
        f"{TRIPS}/{trip_id}/stops",
        json={"name": "Reykjavík", "lat": 64.14, "lon": -21.94},
        headers=headers,
    )

    pulled = await _pull(api, headers, trip_id)
    assert pulled["trip"]["title"] == "Island"
    assert [s["name"] for s in pulled["stops"]["updated"]] == ["Reykjavík"]
    assert pulled["has_more"] is False
    assert len(pulled["members"]) == 1


async def test_incremental_pull_only_returns_changes(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    cursor = (await _pull(api, headers, trip_id))["cursor"]

    # The cursor lags the clock deliberately, so a pull straight after another
    # may legitimately repeat what it just sent. What must never happen is a
    # change made afterwards going missing.
    await api.post(
        f"{TRIPS}/{trip_id}/stops",
        json={"name": "Neu", "lat": ZURICH[0], "lon": ZURICH[1]},
        headers=headers,
    )

    pulled = await _pull(api, headers, trip_id, cursor)
    assert [s["name"] for s in pulled["stops"]["updated"]] == ["Neu"]


async def test_deletions_come_back_as_ids(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    stop = await api.post(
        f"{TRIPS}/{trip_id}/stops",
        json={"name": "Weg", "lat": ZURICH[0], "lon": ZURICH[1]},
        headers=headers,
    )
    stop_id = stop.json()["id"]
    await api.delete(f"{TRIPS}/{trip_id}/stops/{stop_id}", headers=headers)

    pulled = await _pull(api, headers, trip_id)
    # A hard delete could not be replicated to a client that was offline.
    assert pulled["stops"]["deleted"] == [stop_id]
    assert pulled["stops"]["updated"] == []


async def test_push_creates_records_made_offline(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    import uuid

    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    stop_id = str(uuid.uuid4())
    entry_id = str(uuid.uuid4())

    result = await _push(
        api,
        headers,
        trip_id,
        {
            "stops": [
                {
                    "id": stop_id,
                    "updated_at": LATER.isoformat(),
                    "name": "Offline gesetzt",
                    "lat": BERN[0],
                    "lon": BERN[1],
                }
            ],
            "journal_entries": [
                {
                    "id": entry_id,
                    "updated_at": LATER.isoformat(),
                    "text": "Ohne Netz geschrieben.",
                    "timestamp": LATER.isoformat(),
                }
            ],
            "waypoints": [
                {"lat": BERN[0], "lon": BERN[1], "recorded_at": LATER.isoformat()}
            ],
        },
    )

    assert result["stops"]["created"] == [stop_id]
    assert result["journal_entries"]["created"] == [entry_id]
    assert result["waypoints_stored"] == 1

    pulled = await _pull(api, headers, trip_id)
    assert [s["id"] for s in pulled["stops"]["updated"]] == [stop_id]
    assert [e["text"] for e in pulled["journal_entries"]["updated"]] == [
        "Ohne Netz geschrieben."
    ]


async def test_newer_push_wins_older_push_loses(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers, "Original")

    winning = await _push(
        api,
        headers,
        trip_id,
        {"trip": {"id": trip_id, "updated_at": MUCH_LATER.isoformat(), "title": "Vom Handy"}},
    )
    assert winning["trip"]["conflicts"] == []
    assert (await _pull(api, headers, trip_id))["trip"]["title"] == "Vom Handy"

    stale = await _push(
        api,
        headers,
        trip_id,
        {"trip": {"id": trip_id, "updated_at": T0.isoformat(), "title": "Vom Tablet"}},
    )
    assert stale["trip"]["conflicts"] == [{"id": trip_id, "fields": ["title"]}]
    assert (await _pull(api, headers, trip_id))["trip"]["title"] == "Vom Handy"


async def test_two_devices_editing_different_fields_both_survive(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """The reason for per-field resolution: whole-record merging loses one edit."""
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)

    await _push(
        api,
        headers,
        trip_id,
        {
            "trip": {
                "id": trip_id,
                "updated_at": MUCH_LATER.isoformat(),
                "title": "Titel vom Handy",
                "field_updated_at": {"title": MUCH_LATER.isoformat()},
            }
        },
    )

    # The tablet has an older record overall, but touched the description later.
    tablet = await _push(
        api,
        headers,
        trip_id,
        {
            "trip": {
                "id": trip_id,
                "updated_at": T0.isoformat(),
                "title": "Titel vom Tablet",
                "description": "Beschreibung vom Tablet",
                "field_updated_at": {
                    "title": T0.isoformat(),
                    "description": (MUCH_LATER + timedelta(days=1)).isoformat(),
                },
            }
        },
    )

    assert tablet["trip"]["conflicts"] == [{"id": trip_id, "fields": ["title"]}]
    pulled = await _pull(api, headers, trip_id)
    assert pulled["trip"]["title"] == "Titel vom Handy"
    assert pulled["trip"]["description"] == "Beschreibung vom Tablet"


async def test_a_newer_edit_revives_a_deleted_record(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    stop = await api.post(
        f"{TRIPS}/{trip_id}/stops",
        json={"name": "Umstritten", "lat": ZURICH[0], "lon": ZURICH[1]},
        headers=headers,
    )
    stop_id = stop.json()["id"]
    await api.delete(f"{TRIPS}/{trip_id}/stops/{stop_id}", headers=headers)

    await _push(
        api,
        headers,
        trip_id,
        {
            "stops": [
                {
                    "id": stop_id,
                    "updated_at": MUCH_LATER.isoformat(),
                    "name": "Doch behalten",
                    "deleted_at": None,
                }
            ]
        },
    )

    pulled = await _pull(api, headers, trip_id)
    assert [s["name"] for s in pulled["stops"]["updated"]] == ["Doch behalten"]
    assert pulled["stops"]["deleted"] == []


async def test_pushing_the_same_change_twice_is_a_no_op(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    # Over-delivery has to be harmless: the cursor deliberately repeats records.
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    payload = {
        "trip": {"id": trip_id, "updated_at": MUCH_LATER.isoformat(), "title": "Einmalig"}
    }

    await _push(api, headers, trip_id, payload)
    second = await _push(api, headers, trip_id, payload)

    assert second["trip"]["conflicts"] == []
    assert (await _pull(api, headers, trip_id))["trip"]["title"] == "Einmalig"


async def test_waypoint_push_is_append_only_and_idempotent(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    import uuid

    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    point = {
        "id": str(uuid.uuid4()),
        "lat": ZURICH[0],
        "lon": ZURICH[1],
        "recorded_at": T0.isoformat(),
    }

    assert (await _push(api, headers, trip_id, {"waypoints": [point]}))["waypoints_stored"] == 1
    assert (await _push(api, headers, trip_id, {"waypoints": [point]}))["waypoints_stored"] == 0
    assert len((await _pull(api, headers, trip_id))["waypoints"]["updated"]) == 1


async def test_photo_metadata_push_needs_the_bytes_first(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    import uuid

    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)

    response = await api.post(
        f"{TRIPS}/{trip_id}/sync/push",
        json={
            "photos": [
                {"id": str(uuid.uuid4()), "updated_at": LATER.isoformat(), "caption": "x"}
            ]
        },
        headers=headers,
    )
    assert response.status_code == 400

    uploaded = await api.post(
        f"{TRIPS}/{trip_id}/photos",
        files={"file": ("a.jpg", jpeg(), "image/jpeg")},
        headers=headers,
    )
    photo_id = uploaded.json()["photo"]["id"]
    result = await _push(
        api,
        headers,
        trip_id,
        {"photos": [{"id": photo_id, "updated_at": MUCH_LATER.isoformat(), "caption": "Titel"}]},
    )
    assert result["photos"]["applied"] == [photo_id]
    pulled = await _pull(api, headers, trip_id)
    assert pulled["photos"]["updated"][0]["caption"] == "Titel"


async def test_a_new_stop_without_a_position_is_refused(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    import uuid

    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    response = await api.post(
        f"{TRIPS}/{trip_id}/sync/push",
        json={
            "stops": [
                {"id": str(uuid.uuid4()), "updated_at": LATER.isoformat(), "name": "Nirgends"}
            ]
        },
        headers=headers,
    )
    assert response.status_code == 400


async def test_viewers_may_pull_but_not_push(
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

    assert (
        await api.get(f"{TRIPS}/{trip_id}/sync/pull", headers=viewer_headers)
    ).status_code == 200
    denied = await api.post(
        f"{TRIPS}/{trip_id}/sync/push",
        json={"trip": {"id": trip_id, "updated_at": MUCH_LATER.isoformat(), "title": "nope"}},
        headers=viewer_headers,
    )
    assert denied.status_code == 403


async def test_strangers_see_nothing(api: AsyncClient, db_session: AsyncSession) -> None:
    _, owner_headers = await as_user(api, db_session)
    _, stranger_headers = await as_user(api, db_session)
    trip_id = await _trip(api, owner_headers)
    assert (
        await api.get(f"{TRIPS}/{trip_id}/sync/pull", headers=stranger_headers)
    ).status_code == 404
