from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.errors import AuthenticationError, PermissionDeniedError
from app.db.session import get_session
from app.models import User

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
