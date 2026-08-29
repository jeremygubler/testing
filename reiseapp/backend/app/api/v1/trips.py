from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, SessionDep
from app.core.errors import NotFoundError
from app.models import MemberRole
from app.models.trip import Trip
from app.schemas.trip import (
    TripCreate,
    TripMemberCreate,
    TripMemberRead,
    TripMemberUpdate,
    TripRead,
    TripUpdate,
    TripWithRole,
)
from app.services import auth as auth_service
from app.services import trips as trip_service

router = APIRouter(tags=["trips"])


def _with_role(trip: Trip, role: MemberRole) -> TripWithRole:
    """The role is per requesting user, so it cannot come off the ORM object."""
    return TripWithRole(**TripRead.model_validate(trip).model_dump(), role=role)


@router.post("", response_model=TripWithRole, status_code=status.HTTP_201_CREATED)
async def create_trip(session: SessionDep, user: CurrentUser, data: TripCreate) -> TripWithRole:
    trip = await trip_service.create_trip(session, user, data)
    return _with_role(trip, MemberRole.OWNER)


@router.get("", response_model=list[TripWithRole])
async def list_trips(session: SessionDep, user: CurrentUser) -> list[TripWithRole]:
    return [
        _with_role(trip, role)
        for trip, role in await trip_service.list_trips_for_user(session, user)
    ]


@router.get("/{trip_id}", response_model=TripWithRole)
async def get_trip(session: SessionDep, user: CurrentUser, trip_id: UUID) -> TripWithRole:
    trip, role = await trip_service.get_trip_for_user(session, trip_id, user, MemberRole.VIEWER)
    return _with_role(trip, role)


@router.patch("/{trip_id}", response_model=TripWithRole)
async def update_trip(
    session: SessionDep, user: CurrentUser, trip_id: UUID, data: TripUpdate
) -> TripWithRole:
    trip, role = await trip_service.get_trip_for_user(session, trip_id, user, MemberRole.EDITOR)
    trip = await trip_service.update_trip(session, trip, data)
    return _with_role(trip, role)


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(session: SessionDep, user: CurrentUser, trip_id: UUID) -> Response:
    trip, _ = await trip_service.get_trip_for_user(session, trip_id, user, MemberRole.OWNER)
    await trip_service.delete_trip(session, trip)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{trip_id}/members", response_model=list[TripMemberRead])
async def list_members(
    session: SessionDep, user: CurrentUser, trip_id: UUID
) -> list[TripMemberRead]:
    trip, _ = await trip_service.get_trip_for_user(session, trip_id, user, MemberRole.VIEWER)
    return [
        TripMemberRead(
            user_id=member.id, email=member.email, display_name=member.display_name, role=role
        )
        for member, role in await trip_service.list_members(session, trip)
    ]


@router.post(
    "/{trip_id}/members", response_model=TripMemberRead, status_code=status.HTTP_201_CREATED
)
async def add_member(
    session: SessionDep, user: CurrentUser, trip_id: UUID, data: TripMemberCreate
) -> TripMemberRead:
    trip, _ = await trip_service.get_trip_for_user(session, trip_id, user, MemberRole.OWNER)
    invitee = await auth_service.get_user_by_email(session, data.email)
    if invitee is None:
        # Inviting someone who has no account yet needs an invite code first.
        raise NotFoundError("No account with this email address")
    member = await trip_service.add_member(session, trip, invitee, data.role)
    return TripMemberRead(
        user_id=invitee.id,
        email=invitee.email,
        display_name=invitee.display_name,
        role=member.role,
    )


@router.patch("/{trip_id}/members/{user_id}", response_model=TripMemberRead)
async def update_member(
    session: SessionDep,
    user: CurrentUser,
    trip_id: UUID,
    user_id: UUID,
    data: TripMemberUpdate,
) -> TripMemberRead:
    trip, _ = await trip_service.get_trip_for_user(session, trip_id, user, MemberRole.OWNER)
    member = await trip_service.get_member(session, trip, user_id)
    member = await trip_service.set_member_role(session, member, data.role)
    target = await auth_service.get_user(session, user_id)
    return TripMemberRead(
        user_id=target.id,
        email=target.email,
        display_name=target.display_name,
        role=member.role,
    )


@router.delete("/{trip_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    session: SessionDep, user: CurrentUser, trip_id: UUID, user_id: UUID
) -> Response:
    trip, _ = await trip_service.get_trip_for_user(session, trip_id, user, MemberRole.OWNER)
    member = await trip_service.get_member(session, trip, user_id)
    await trip_service.remove_member(session, member)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
