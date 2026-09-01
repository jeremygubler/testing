"""The public, unauthenticated side of a share link."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Response

from app.api.deps import SessionDep
from app.core.config import get_settings
from app.core.errors import NotFoundError
from app.models import User
from app.schemas.share import SharedTrip
from app.services import photos as photo_service
from app.services import shares as share_service
from app.services import stops as stop_service
from app.services import timeline as timeline_service
from app.services import waypoints as waypoint_service
from app.storage import ObjectNotFoundError, get_store

router = APIRouter(tags=["sharing"])


@router.get("/{token}", response_model=SharedTrip)
async def read_shared_trip(session: SessionDep, token: str) -> SharedTrip:
    share, trip = await share_service.resolve(session, token)

    owner = await session.get(User, trip.owner_id)
    timeline = await timeline_service.build(session, trip)
    items = timeline.items
    if not share.include_photos:
        # Strip photos rather than filtering them in the viewer: the bytes must
        # not be reachable at all when the link was created without them.
        items = [item for item in items if item.kind != "photos"]
        for item in items:
            if item.entry is not None:
                item.entry.photos = []

    return SharedTrip(
        title=trip.title,
        description=trip.description,
        start_date=trip.start_date.isoformat() if trip.start_date else None,
        end_date=trip.end_date.isoformat() if trip.end_date else None,
        owner_name=owner.display_name if owner else "",
        include_photos=share.include_photos,
        map_style_url=get_settings().viewer_map_style_url,
        route=await waypoint_service.route(session, trip, simplify_m=15),
        stats=await waypoint_service.stats(session, trip),
        stops=[stop_service.to_read(stop) for stop in await stop_service.list_stops(session, trip)],
        timeline=items,
    )


@router.get("/{token}/photos/{photo_id}/file")
async def read_shared_photo(
    session: SessionDep, token: str, photo_id: UUID, variant: str = "thumb"
) -> Response:
    share, trip = await share_service.resolve(session, token)
    if not share.include_photos:
        raise NotFoundError("This link does not include photos")

    photo = await photo_service.get_photo(session, trip, photo_id)
    key = photo.thumbnail_key if variant == "thumb" and photo.thumbnail_key else photo.storage_key
    content_type = "image/jpeg" if key == photo.thumbnail_key else photo.content_type

    try:
        data = await get_store().get(key)
    except ObjectNotFoundError as exc:
        raise NotFoundError("The stored file for this photo is missing") from exc

    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )
