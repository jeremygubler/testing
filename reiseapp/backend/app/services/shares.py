from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.errors import NotFoundError
from app.models import ShareLink, Trip, User
from app.schemas.share import ShareCreate

VIEWER_PATH = "/s"


async def create_share(
    session: AsyncSession, trip: Trip, creator: User, data: ShareCreate
) -> tuple[ShareLink, str]:
    token = security.generate_opaque_token()
    share = ShareLink(
        trip_id=trip.id,
        created_by_id=creator.id,
        token_hash=security.fingerprint(token),
        label=data.label,
        include_photos=data.include_photos,
        expires_at=(
            datetime.now(UTC) + timedelta(days=data.expires_in_days)
            if data.expires_in_days
            else None
        ),
    )
    session.add(share)
    await session.flush()
    return share, token


async def list_shares(session: AsyncSession, trip: Trip) -> list[ShareLink]:
    result = await session.execute(
        select(ShareLink)
        .where(ShareLink.trip_id == trip.id, ShareLink.deleted_at.is_(None))
        .order_by(ShareLink.created_at.desc())
    )
    return list(result.scalars().all())


async def revoke_share(session: AsyncSession, trip: Trip, share_id: UUID) -> None:
    result = await session.execute(
        select(ShareLink).where(
            ShareLink.id == share_id,
            ShareLink.trip_id == trip.id,
            ShareLink.deleted_at.is_(None),
        )
    )
    share = result.scalar_one_or_none()
    if share is None:
        raise NotFoundError("Share link not found")
    share.revoked_at = datetime.now(UTC)


async def resolve(session: AsyncSession, token: str) -> tuple[ShareLink, Trip]:
    """Looks up a share token.

    Everything unusable answers the same 404: a revoked link, an expired one and
    a token that never existed must be indistinguishable, or the endpoint becomes
    an oracle for guessing valid tokens.
    """
    result = await session.execute(
        select(ShareLink).where(ShareLink.token_hash == security.fingerprint(token))
    )
    share = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if share is None or not share.is_usable(now):
        raise NotFoundError("This link is not valid")

    trip = await session.get(Trip, share.trip_id)
    if trip is None or trip.deleted_at is not None:
        raise NotFoundError("This link is not valid")

    share.view_count += 1
    share.last_viewed_at = now
    return share, trip
