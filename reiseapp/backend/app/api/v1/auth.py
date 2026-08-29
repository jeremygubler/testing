from __future__ import annotations

from fastapi import APIRouter, Request, Response, status
from sqlalchemy import select

from app.api.deps import CurrentAdmin, CurrentUser, SessionDep
from app.models import Invite
from app.schemas.auth import (
    InviteCreate,
    InviteCreated,
    InviteRead,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
)
from app.schemas.user import UserRead
from app.services import auth as auth_service

router = APIRouter(tags=["auth"])


def _user_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(session: SessionDep, data: RegisterRequest) -> UserRead:
    user = await auth_service.register_user(session, data)
    return UserRead.model_validate(user)


@router.post("/login", response_model=TokenPair)
async def login(session: SessionDep, data: LoginRequest, request: Request) -> TokenPair:
    user = await auth_service.authenticate(session, data.email, data.password)
    access, refresh, expires_at = await auth_service.issue_tokens(
        session, user, _user_agent(request)
    )
    return TokenPair(access_token=access, refresh_token=refresh, expires_at=expires_at)


@router.post("/refresh", response_model=TokenPair)
async def refresh(session: SessionDep, data: RefreshRequest, request: Request) -> TokenPair:
    access, new_refresh, expires_at = await auth_service.rotate_refresh_token(
        session, data.refresh_token, _user_agent(request)
    )
    return TokenPair(access_token=access, refresh_token=new_refresh, expires_at=expires_at)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(session: SessionDep, data: RefreshRequest) -> Response:
    await auth_service.revoke_refresh_token(session, data.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserRead)
async def me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.post("/invites", response_model=InviteCreated, status_code=status.HTTP_201_CREATED)
async def create_invite(
    session: SessionDep, admin: CurrentAdmin, data: InviteCreate
) -> InviteCreated:
    invite, code = await auth_service.create_invite(session, admin, data)
    return InviteCreated(
        id=invite.id,
        email=invite.email,
        expires_at=invite.expires_at,
        used_at=invite.used_at,
        code=code,
    )


@router.get("/invites", response_model=list[InviteRead])
async def list_invites(session: SessionDep, admin: CurrentAdmin) -> list[InviteRead]:
    result = await session.execute(select(Invite).order_by(Invite.created_at.desc()))
    return [InviteRead.model_validate(invite) for invite in result.scalars().all()]
