from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Annotated
from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.errors import AuthenticationError, PermissionDeniedError
from app.db.session import get_session
from app.models import MemberRole, Trip, User
from app.services import trips as trip_service

# auto_error=False so a missing header produces our error envelope, not Starlette's.
_bearer = HTTPBearer(auto_error=False, description="JWT access token")

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
) -> User:
    if credentials is None or not credentials.credentials:
        raise AuthenticationError("Missing bearer token")
    try:
        payload = security.decode_access_token(credentials.credentials)
    except security.TokenError as exc:
        raise AuthenticationError("Invalid or expired access token") from exc

    user = await session.get(User, payload.user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("Account is not active")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_current_admin(user: CurrentUser) -> User:
    if not user.is_admin:
        raise PermissionDeniedError("Administrator rights required")
    return user


CurrentAdmin = Annotated[User, Depends(get_current_admin)]


def trip_access(minimum: MemberRole) -> Callable[..., Awaitable[Trip]]:
    """Dependency factory: resolves the trip and enforces a minimum role.

    Keeps the permission check in one place instead of repeating the same three
    lines at the top of every trip-scoped endpoint.
    """

    async def dependency(session: SessionDep, user: CurrentUser, trip_id: UUID) -> Trip:
        trip, _ = await trip_service.get_trip_for_user(session, trip_id, user, minimum)
        return trip

    return dependency


TripForViewer = Annotated[Trip, Depends(trip_access(MemberRole.VIEWER))]
TripForEditor = Annotated[Trip, Depends(trip_access(MemberRole.EDITOR))]
TripForOwner = Annotated[Trip, Depends(trip_access(MemberRole.OWNER))]
