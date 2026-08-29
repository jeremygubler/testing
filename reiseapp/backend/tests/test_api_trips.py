from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import as_user, make_user

pytestmark = pytest.mark.integration

TRIPS = "/api/v1/trips"


async def _create_trip(api: AsyncClient, headers: dict[str, str], **overrides: object) -> dict:
    payload: dict[str, object] = {"title": "Island 2026"}
    payload.update(overrides)
    response = await api.post(TRIPS, json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return dict(response.json())


async def test_create_and_read_own_trip(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    trip = await _create_trip(
        api, headers, description="Ringstrasse", start_date="2026-07-01", end_date="2026-07-21"
    )
    assert trip["role"] == "owner"
    assert trip["visibility"] == "private"

    fetched = await api.get(f"{TRIPS}/{trip['id']}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "Island 2026"


async def test_client_supplied_id_is_kept(api: AsyncClient, db_session: AsyncSession) -> None:
    # Offline-first: a trip created without network keeps its id after syncing.
    _, headers = await as_user(api, db_session)
    trip_id = str(uuid.uuid4())
    trip = await _create_trip(api, headers, id=trip_id)
    assert trip["id"] == trip_id

    duplicate = await api.post(TRIPS, json={"title": "Nochmal", "id": trip_id}, headers=headers)
    assert duplicate.status_code == 409


async def test_end_date_before_start_date_is_rejected(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    response = await api.post(
        TRIPS,
        json={"title": "Zeitreise", "start_date": "2026-07-21", "end_date": "2026-07-01"},
        headers=headers,
    )
    assert response.status_code == 422


async def test_trip_list_is_scoped_to_the_user(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, mine = await as_user(api, db_session)
    _, other = await as_user(api, db_session)
    trip = await _create_trip(api, mine, title="Meine Reise")
    await _create_trip(api, other, title="Fremde Reise")

    listed = await api.get(TRIPS, headers=mine)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [trip["id"]]


async def test_foreign_trip_looks_nonexistent(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner = await as_user(api, db_session)
    _, stranger = await as_user(api, db_session)
    trip = await _create_trip(api, owner)

    # 404 and not 403: a stranger must not learn that this trip exists.
    assert (await api.get(f"{TRIPS}/{trip['id']}", headers=stranger)).status_code == 404
    patch = await api.patch(f"{TRIPS}/{trip['id']}", json={"title": "x"}, headers=stranger)
    assert patch.status_code == 404


async def test_trip_endpoints_require_authentication(api: AsyncClient) -> None:
    assert (await api.get(TRIPS)).status_code == 401
    assert (await api.post(TRIPS, json={"title": "x"})).status_code == 401


async def test_update_and_soft_delete(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    trip = await _create_trip(api, headers)

    patched = await api.patch(
        f"{TRIPS}/{trip['id']}",
        json={"title": "Island 2027", "visibility": "link"},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Island 2027"
    assert patched.json()["visibility"] == "link"

    assert (await api.delete(f"{TRIPS}/{trip['id']}", headers=headers)).status_code == 204
    assert (await api.get(f"{TRIPS}/{trip['id']}", headers=headers)).status_code == 404
    assert (await api.get(TRIPS, headers=headers)).json() == []


async def test_member_roles_gate_writes(api: AsyncClient, db_session: AsyncSession) -> None:
    owner, owner_headers = await as_user(api, db_session)
    viewer, viewer_headers = await as_user(api, db_session)
    editor, editor_headers = await as_user(api, db_session)
    trip = await _create_trip(api, owner_headers)

    for user, role in ((viewer, "viewer"), (editor, "editor")):
        added = await api.post(
            f"{TRIPS}/{trip['id']}/members",
            json={"email": user.email, "role": role},
            headers=owner_headers,
        )
        assert added.status_code == 201, added.text

    # Viewer: read yes, write no.
    assert (await api.get(f"{TRIPS}/{trip['id']}", headers=viewer_headers)).status_code == 200
    denied = await api.patch(
        f"{TRIPS}/{trip['id']}", json={"title": "nope"}, headers=viewer_headers
    )
    assert denied.status_code == 403
    assert denied.json()["error"]["type"] == "forbidden"

    # Editor: may edit, may not delete or manage members.
    allowed = await api.patch(
        f"{TRIPS}/{trip['id']}", json={"title": "Gemeinsam"}, headers=editor_headers
    )
    assert allowed.status_code == 200
    assert (await api.delete(f"{TRIPS}/{trip['id']}", headers=editor_headers)).status_code == 403
    forbidden = await api.post(
        f"{TRIPS}/{trip['id']}/members",
        json={"email": viewer.email, "role": "editor"},
        headers=editor_headers,
    )
    assert forbidden.status_code == 403

    # Shared trips show up for members, with their own role.
    listed = await api.get(TRIPS, headers=editor_headers)
    assert [item["role"] for item in listed.json()] == ["editor"]


async def test_member_management(api: AsyncClient, db_session: AsyncSession) -> None:
    owner, owner_headers = await as_user(api, db_session)
    friend = await make_user(db_session)
    trip = await _create_trip(api, owner_headers)
    members_url = f"{TRIPS}/{trip['id']}/members"

    await api.post(
        members_url, json={"email": friend.email, "role": "viewer"}, headers=owner_headers
    )
    listed = await api.get(members_url, headers=owner_headers)
    assert listed.status_code == 200
    assert {(m["email"], m["role"]) for m in listed.json()} == {
        (owner.email, "owner"),
        (friend.email, "viewer"),
    }

    promoted = await api.patch(
        f"{members_url}/{friend.id}", json={"role": "editor"}, headers=owner_headers
    )
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "editor"

    removed = await api.delete(f"{members_url}/{friend.id}", headers=owner_headers)
    assert removed.status_code == 204
    remaining = await api.get(members_url, headers=owner_headers)
    assert [m["email"] for m in remaining.json()] == [owner.email]

    # Re-adding someone who was removed works and reuses their row.
    again = await api.post(
        members_url, json={"email": friend.email, "role": "viewer"}, headers=owner_headers
    )
    assert again.status_code == 201


async def test_member_edge_cases(api: AsyncClient, db_session: AsyncSession) -> None:
    owner, owner_headers = await as_user(api, db_session)
    friend = await make_user(db_session)
    trip = await _create_trip(api, owner_headers)
    members_url = f"{TRIPS}/{trip['id']}/members"

    unknown = await api.post(
        members_url, json={"email": "nobody@example.com"}, headers=owner_headers
    )
    assert unknown.status_code == 404

    self_add = await api.post(members_url, json={"email": owner.email}, headers=owner_headers)
    assert self_add.status_code == 409

    second_owner = await api.post(
        members_url, json={"email": friend.email, "role": "owner"}, headers=owner_headers
    )
    assert second_owner.status_code == 400

    await api.post(members_url, json={"email": friend.email}, headers=owner_headers)
    duplicate = await api.post(members_url, json={"email": friend.email}, headers=owner_headers)
    assert duplicate.status_code == 409
