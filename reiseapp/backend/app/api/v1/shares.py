from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, SessionDep, TripForOwner
from app.schemas.share import ShareCreate, ShareCreated, ShareRead
from app.services import shares as share_service

router = APIRouter(tags=["sharing"])


@router.post(
    "/{trip_id}/shares", response_model=ShareCreated, status_code=status.HTTP_201_CREATED
)
async def create_share(
    session: SessionDep, trip: TripForOwner, user: CurrentUser, data: ShareCreate
) -> ShareCreated:
    """Creates a read-only link. The token is shown once and stored only as a hash."""
    share, token = await share_service.create_share(session, trip, user, data)
    return ShareCreated(
        id=share.id,
        label=share.label,
        expires_at=share.expires_at,
        revoked_at=share.revoked_at,
        include_photos=share.include_photos,
        view_count=share.view_count,
        last_viewed_at=share.last_viewed_at,
        created_at=share.created_at,
        token=token,
        url_path=f"{share_service.VIEWER_PATH}/{token}",
    )


@router.get("/{trip_id}/shares", response_model=list[ShareRead])
async def list_shares(session: SessionDep, trip: TripForOwner) -> list[ShareRead]:
    shares = await share_service.list_shares(session, trip)
    return [ShareRead.model_validate(share) for share in shares]


@router.delete("/{trip_id}/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share(session: SessionDep, trip: TripForOwner, share_id: UUID) -> Response:
    await share_service.revoke_share(session, trip, share_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
