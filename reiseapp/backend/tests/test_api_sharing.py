from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import as_user
from tests.images import jpeg

pytestmark = pytest.mark.integration

TRIPS = "/api/v1/trips"
SHARED = "/api/v1/shared"
ZURICH = (47.3769, 8.5417)
BERN = (46.9480, 7.4474)
T0 = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)


async def _trip_with_content(api: AsyncClient, headers: dict[str, str]) -> tuple[str, str]:
    trip = await api.post(
        TRIPS, json={"title": "Island", "description": "Ringstrasse"}, headers=headers
    )
    trip_id = str(trip.json()["id"])
    await api.post(
        f"{TRIPS}/{trip_id}/waypoints",
        json={
            "waypoints": [
                {"lat": ZURICH[0], "lon": ZURICH[1], "recorded_at": T0.isoformat()},
                {"lat": BERN[0], "lon": BERN[1],
                 "recorded_at": (T0 + timedelta(hours=2)).isoformat()},
            ]
        },
        headers=headers,
    )
    await api.post(
        f"{TRIPS}/{trip_id}/stops",
        json={"name": "Zürich HB", "lat": ZURICH[0], "lon": ZURICH[1],
              "arrived_at": T0.isoformat()},
        headers=headers,
    )
    await api.post(
        f"{TRIPS}/{trip_id}/journal",
        json={"title": "Tag 1", "text": "Losgefahren.",
              "timestamp": (T0 + timedelta(hours=1)).isoformat()},
        headers=headers,
    )
    await api.post(
        f"{TRIPS}/{trip_id}/photos",
        files={"file": ("a.jpg", jpeg(taken_at="2026:06:01 12:00:00"), "image/jpeg")},
        headers=headers,
    )
    return trip_id, headers.get("Authorization", "")


async def _share(api: AsyncClient, headers: dict[str, str], trip_id: str, **body: object) -> dict:
    response = await api.post(f"{TRIPS}/{trip_id}/shares", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return dict(response.json())


async def test_shared_trip_is_readable_without_a_token(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id, _ = await _trip_with_content(api, headers)
    share = await _share(api, headers, trip_id, label="Für die Familie")

    assert share["url_path"].startswith("/s/")

    # No Authorization header: that is the entire point of a share link.
    public = await api.get(f"{SHARED}/{share['token']}")
    assert public.status_code == 200
    payload = public.json()
    assert payload["title"] == "Island"
    assert payload["route"]["point_count"] == 2
    assert [stop["name"] for stop in payload["stops"]] == ["Zürich HB"]
    assert [item["kind"] for item in payload["timeline"]] == ["stop", "journal", "photos"]
    assert payload["map_style_url"].startswith("http")


async def test_shared_photos_are_reachable(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    trip_id, _ = await _trip_with_content(api, headers)
    share = await _share(api, headers, trip_id)

    payload = (await api.get(f"{SHARED}/{share['token']}")).json()
    photo_id = payload["timeline"][-1]["photos"][0]["id"]

    image = await api.get(f"{SHARED}/{share['token']}/photos/{photo_id}/file")
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"


async def test_a_link_without_photos_hides_them_entirely(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """Stripped server-side, not filtered in the viewer: the bytes must not be
    reachable at all."""
    _, headers = await as_user(api, db_session)
    trip_id, _ = await _trip_with_content(api, headers)
    share = await _share(api, headers, trip_id, include_photos=False)

    payload = (await api.get(f"{SHARED}/{share['token']}")).json()
    assert all(item["kind"] != "photos" for item in payload["timeline"])
    assert all(not item["entry"]["photos"] for item in payload["timeline"] if item["entry"])

    with_photos = await _share(api, headers, trip_id)
    visible = (await api.get(f"{SHARED}/{with_photos['token']}")).json()
    photo_id = visible["timeline"][-1]["photos"][0]["id"]
    blocked = await api.get(f"{SHARED}/{share['token']}/photos/{photo_id}/file")
    assert blocked.status_code == 404


async def test_revoked_and_expired_links_answer_like_unknown_ones(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """All three must be indistinguishable, or the endpoint is a guessing oracle."""
    _, headers = await as_user(api, db_session)
    trip_id, _ = await _trip_with_content(api, headers)

    revoked = await _share(api, headers, trip_id)
    await api.delete(f"{TRIPS}/{trip_id}/shares/{revoked['id']}", headers=headers)

    unknown = await api.get(f"{SHARED}/not-a-real-token")
    gone = await api.get(f"{SHARED}/{revoked['token']}")

    assert unknown.status_code == gone.status_code == 404
    assert unknown.json()["error"]["message"] == gone.json()["error"]["message"]


async def test_an_expired_link_stops_working(api: AsyncClient, db_session: AsyncSession) -> None:
    from sqlalchemy import select

    from app.models import ShareLink

    _, headers = await as_user(api, db_session)
    trip_id, _ = await _trip_with_content(api, headers)
    share = await _share(api, headers, trip_id, expires_in_days=1)
    assert (await api.get(f"{SHARED}/{share['token']}")).status_code == 200

    row = (
        await db_session.execute(select(ShareLink).where(ShareLink.id == share["id"]))
    ).scalar_one()
    row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db_session.commit()

    assert (await api.get(f"{SHARED}/{share['token']}")).status_code == 404


async def test_views_are_counted(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    trip_id, _ = await _trip_with_content(api, headers)
    share = await _share(api, headers, trip_id)

    for _ in range(3):
        await api.get(f"{SHARED}/{share['token']}")

    listed = (await api.get(f"{TRIPS}/{trip_id}/shares", headers=headers)).json()
    assert listed[0]["view_count"] == 3
    assert listed[0]["last_viewed_at"] is not None
    # The token itself is never returned again.
    assert "token" not in listed[0]


async def test_deleting_the_trip_kills_the_link(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id, _ = await _trip_with_content(api, headers)
    share = await _share(api, headers, trip_id)
    await api.delete(f"{TRIPS}/{trip_id}", headers=headers)

    assert (await api.get(f"{SHARED}/{share['token']}")).status_code == 404


async def test_only_the_owner_may_manage_links(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    owner, owner_headers = await as_user(api, db_session)
    editor, editor_headers = await as_user(api, db_session)
    trip_id, _ = await _trip_with_content(api, owner_headers)
    await api.post(
        f"{TRIPS}/{trip_id}/members",
        json={"email": editor.email, "role": "editor"},
        headers=owner_headers,
    )

    # Publishing someone's trip is an owner's decision, not an editor's.
    denied = await api.post(f"{TRIPS}/{trip_id}/shares", json={}, headers=editor_headers)
    assert denied.status_code == 403
    assert (await api.get(f"{TRIPS}/{trip_id}/shares", headers=editor_headers)).status_code == 403


async def test_the_viewer_page_is_served(api: AsyncClient) -> None:
    response = await api.get("/s/any-token-at-all")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    # The page resolves the token client-side, so it must not appear in the HTML.
    assert "any-token-at-all" not in response.text
