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


async def _trip(api: AsyncClient, headers: dict[str, str]) -> str:
    response = await api.post(TRIPS, json={"title": "Fotoreise"}, headers=headers)
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


async def _upload(
    api: AsyncClient,
    headers: dict[str, str],
    trip_id: str,
    data: bytes,
    *,
    name: str = "bild.jpg",
    **fields: str,
) -> dict:
    response = await api.post(
        f"{TRIPS}/{trip_id}/photos",
        files={"file": (name, data, "image/jpeg")},
        data=fields,
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return dict(response.json())


async def test_upload_reads_exif_and_stores_the_original(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    data = jpeg(taken_at="2026:06:01 09:15:00", lat=ZURICH[0], lon=ZURICH[1], size=(600, 400))

    result = await _upload(api, headers, trip_id, data)
    photo = result["photo"]

    assert result["duplicate"] is False
    assert photo["taken_at"].startswith("2026-06-01T09:15:00")
    assert photo["lat"] == pytest.approx(ZURICH[0], abs=1e-4)
    assert photo["position_source"] == "exif"
    assert (photo["width"], photo["height"]) == (600, 400)
    assert photo["byte_size"] == len(data)
    assert photo["has_thumbnail"] is True

    # The original comes back byte-for-byte – no re-encode, EXIF intact.
    original = await api.get(f"{TRIPS}/{trip_id}/photos/{photo['id']}/file", headers=headers)
    assert original.status_code == 200
    assert original.content == data

    thumb = await api.get(
        f"{TRIPS}/{trip_id}/photos/{photo['id']}/file?variant=thumb", headers=headers
    )
    assert thumb.status_code == 200
    assert 0 < len(thumb.content) < len(data)


async def test_reuploading_the_same_bytes_is_a_no_op(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    data = jpeg(taken_at="2026:06:01 09:15:00")

    first = await _upload(api, headers, trip_id, data)
    second = await _upload(api, headers, trip_id, data)

    assert second["duplicate"] is True
    assert second["photo"]["id"] == first["photo"]["id"]
    assert len((await api.get(f"{TRIPS}/{trip_id}/photos", headers=headers)).json()) == 1


async def test_client_hints_only_fill_gaps(api: AsyncClient, db_session: AsyncSession) -> None:
    # The file's own EXIF wins: the server is the source of truth, whatever the
    # app believes it read.
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)

    with_exif = await _upload(
        api,
        headers,
        trip_id,
        jpeg(taken_at="2026:06:01 09:15:00", lat=ZURICH[0], lon=ZURICH[1]),
        lat=str(BERN[0]),
        lon=str(BERN[1]),
    )
    assert with_exif["photo"]["lat"] == pytest.approx(ZURICH[0], abs=1e-4)

    without_exif = await _upload(
        api,
        headers,
        trip_id,
        jpeg(colour="blue"),
        name="ohne-exif.jpg",
        lat=str(BERN[0]),
        lon=str(BERN[1]),
    )
    assert without_exif["photo"]["lat"] == pytest.approx(BERN[0], abs=1e-4)


async def test_photo_is_assigned_to_the_nearest_stop(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)

    near = await api.post(
        f"{TRIPS}/{trip_id}/stops",
        json={"name": "Zürich HB", "lat": ZURICH[0], "lon": ZURICH[1]},
        headers=headers,
    )
    await api.post(
        f"{TRIPS}/{trip_id}/stops",
        json={"name": "Bern", "lat": BERN[0], "lon": BERN[1]},
        headers=headers,
    )

    photo = (
        await _upload(
            api, headers, trip_id, jpeg(lat=ZURICH[0] + 0.001, lon=ZURICH[1] + 0.001)
        )
    )["photo"]
    assert photo["stop_id"] == near.json()["id"]


async def test_photo_far_from_every_stop_stays_unassigned(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    await api.post(
        f"{TRIPS}/{trip_id}/stops",
        json={"name": "Bern", "lat": BERN[0], "lon": BERN[1]},
        headers=headers,
    )
    photo = (await _upload(api, headers, trip_id, jpeg(lat=ZURICH[0], lon=ZURICH[1])))["photo"]
    assert photo["stop_id"] is None


async def test_photo_without_gps_is_placed_on_the_recorded_track(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """The feature Polarsteps does not have: if the phone was tracking, we know
    where the camera was even when the camera did not."""
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)

    await api.post(
        f"{TRIPS}/{trip_id}/waypoints",
        json={
            "waypoints": [
                {"lat": ZURICH[0], "lon": ZURICH[1], "recorded_at": T0.isoformat()},
                {
                    "lat": BERN[0],
                    "lon": BERN[1],
                    "recorded_at": (T0 + timedelta(hours=2)).isoformat(),
                },
            ]
        },
        headers=headers,
    )

    # Taken exactly halfway between the two fixes.
    photo = (
        await _upload(api, headers, trip_id, jpeg(taken_at="2026:06:01 09:00:00"))
    )["photo"]

    assert photo["position_source"] == "interpolated"
    assert photo["lat"] == pytest.approx((ZURICH[0] + BERN[0]) / 2, abs=1e-3)
    assert photo["lon"] == pytest.approx((ZURICH[1] + BERN[1]) / 2, abs=1e-3)


async def test_no_interpolation_across_an_implausible_gap(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    await api.post(
        f"{TRIPS}/{trip_id}/waypoints",
        json={
            "waypoints": [
                {"lat": ZURICH[0], "lon": ZURICH[1], "recorded_at": T0.isoformat()},
                {
                    "lat": BERN[0],
                    "lon": BERN[1],
                    "recorded_at": (T0 + timedelta(days=3)).isoformat(),
                },
            ]
        },
        headers=headers,
    )
    photo = (
        await _upload(api, headers, trip_id, jpeg(taken_at="2026:06:02 12:00:00"))
    )["photo"]

    # A photo between two fixes three days apart says nothing about its location.
    assert photo["position_source"] == "none"
    assert photo["lat"] is None


async def test_photo_is_assigned_by_time_when_it_has_no_position(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    stop = await api.post(
        f"{TRIPS}/{trip_id}/stops",
        json={
            "name": "Hotel",
            "lat": BERN[0],
            "lon": BERN[1],
            "arrived_at": T0.isoformat(),
            "left_at": (T0 + timedelta(hours=10)).isoformat(),
        },
        headers=headers,
    )
    photo = (
        await _upload(api, headers, trip_id, jpeg(taken_at="2026:06:01 12:00:00"))
    )["photo"]
    assert photo["stop_id"] == stop.json()["id"]


async def test_manual_position_overrides_and_is_marked_as_such(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    photo = (await _upload(api, headers, trip_id, jpeg(lat=ZURICH[0], lon=ZURICH[1])))["photo"]

    patched = await api.patch(
        f"{TRIPS}/{trip_id}/photos/{photo['id']}",
        json={"lat": BERN[0], "lon": BERN[1], "caption": "Bundeshaus"},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["position_source"] == "manual"
    assert patched.json()["caption"] == "Bundeshaus"


async def test_photos_are_listed_in_capture_order(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    await _upload(api, headers, trip_id, jpeg(taken_at="2026:06:02 10:00:00"), name="b.jpg")
    await _upload(api, headers, trip_id, jpeg(taken_at="2026:06:01 10:00:00"), name="a.jpg")
    await _upload(api, headers, trip_id, jpeg(colour="green"), name="undated.jpg")

    listed = (await api.get(f"{TRIPS}/{trip_id}/photos", headers=headers)).json()
    assert [item["original_filename"] for item in listed] == ["a.jpg", "b.jpg", "undated.jpg"]


async def test_delete_hides_the_photo(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    photo = (await _upload(api, headers, trip_id, jpeg()))["photo"]

    assert (
        await api.delete(f"{TRIPS}/{trip_id}/photos/{photo['id']}", headers=headers)
    ).status_code == 204
    assert (await api.get(f"{TRIPS}/{trip_id}/photos", headers=headers)).json() == []


async def test_non_images_are_rejected(api: AsyncClient, db_session: AsyncSession) -> None:
    _, headers = await as_user(api, db_session)
    trip_id = await _trip(api, headers)
    response = await api.post(
        f"{TRIPS}/{trip_id}/photos",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        headers=headers,
    )
    assert response.status_code == 400


async def test_viewers_may_read_but_not_upload(
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
    photo = (await _upload(api, owner_headers, trip_id, jpeg()))["photo"]

    assert (await api.get(f"{TRIPS}/{trip_id}/photos", headers=viewer_headers)).status_code == 200
    assert (
        await api.get(f"{TRIPS}/{trip_id}/photos/{photo['id']}/file", headers=viewer_headers)
    ).status_code == 200

    denied = await api.post(
        f"{TRIPS}/{trip_id}/photos",
        files={"file": ("x.jpg", jpeg(colour="black"), "image/jpeg")},
        headers=viewer_headers,
    )
    assert denied.status_code == 403
