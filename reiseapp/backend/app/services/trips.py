from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import Select, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ConflictError, NotFoundError, PermissionDeniedError
from app.models import MemberRole, Trip, TripMember, User
from app.schemas.trip import TripCreate, TripUpdate

# viewer < editor < owner
ROLE_RANK: dict[MemberRole, int] = {
    MemberRole.VIEWER: 0,
    MemberRole.EDITOR: 1,
    MemberRole.OWNER: 2,
}


def _alive(statement: Select[tuple[Trip]]) -> Select[tuple[Trip]]:
    return statement.where(Trip.deleted_at.is_(None))


async def effective_role(session: AsyncSession, trip: Trip, user: User) -> MemberRole | None:
    """Ownership lives on Trip.owner_id; trip_members holds everyone else."""
    if trip.owner_id == user.id:
        return MemberRole.OWNER
    result = await session.execute(
        select(TripMember).where(
            TripMember.trip_id == trip.id,
            TripMember.user_id == user.id,
            TripMember.deleted_at.is_(None),
        )
    )
    member = result.scalar_one_or_none()
    return member.role if member is not None else None


async def get_trip_for_user(
    session: AsyncSession, trip_id: UUID, user: User, minimum: MemberRole
) -> tuple[Trip, MemberRole]:
    result = await session.execute(_alive(select(Trip)).where(Trip.id == trip_id))
    trip = result.scalar_one_or_none()
    if trip is None:
        raise NotFoundError("Trip not found")
    role = await effective_role(session, trip, user)
    # A user without any role must not be able to tell an existing private trip
    # from a non-existent one.
    if role is None:
        raise NotFoundError("Trip not found")
    if ROLE_RANK[role] < ROLE_RANK[minimum]:
        raise PermissionDeniedError(f"This action requires the {minimum.value} role")
    return trip, role


async def list_trips_for_user(
    session: AsyncSession, user: User
) -> list[tuple[Trip, MemberRole]]:
    member_trip_ids = select(TripMember.trip_id).where(
        TripMember.user_id == user.id, TripMember.deleted_at.is_(None)
    )
    result = await session.execute(
        _alive(select(Trip))
        .where(or_(Trip.owner_id == user.id, Trip.id.in_(member_trip_ids)))
        .order_by(Trip.start_date.desc().nullslast(), Trip.created_at.desc())
    )
    return [
        (trip, await effective_role(session, trip, user) or MemberRole.VIEWER)
        for trip in result.scalars().all()
    ]


async def create_trip(session: AsyncSession, user: User, data: TripCreate) -> Trip:
    if data.id is not None and await session.get(Trip, data.id) is not None:
        raise ConflictError("A trip with this id already exists")
    trip = Trip(
        owner_id=user.id,
        title=data.title.strip(),
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
        visibility=data.visibility,
    )
    if data.id is not None:
        trip.id = data.id
    session.add(trip)
    await session.flush()
    return trip


async def update_trip(session: AsyncSession, trip: Trip, data: TripUpdate) -> Trip:
    values = data.model_dump(exclude_unset=True)
    for field, value in values.items():
        setattr(trip, field, value)

    start, end = trip.start_date, trip.end_date
    if start and end and end < start:
        raise AppError("end_date must not be before start_date")
    await session.flush()
    return trip


async def delete_trip(session: AsyncSession, trip: Trip) -> None:
    # Soft delete – an offline client still has to learn that this trip is gone.
    trip.deleted_at = datetime.now(UTC)
    await session.flush()


async def list_members(session: AsyncSession, trip: Trip) -> list[tuple[User, MemberRole]]:
    owner = await session.get(User, trip.owner_id)
    members: list[tuple[User, MemberRole]] = []
    if owner is not None:
        members.append((owner, MemberRole.OWNER))
    result = await session.execute(
        select(TripMember, User)
        .join(User, User.id == TripMember.user_id)
        .where(TripMember.trip_id == trip.id, TripMember.deleted_at.is_(None))
        .order_by(User.display_name)
    )
    members.extend((user, member.role) for member, user in result.all())
    return members


async def add_member(
    session: AsyncSession, trip: Trip, user: User, role: MemberRole
) -> TripMember:
    if role is MemberRole.OWNER:
        raise AppError("A trip has exactly one owner; transfer ownership instead")
    if user.id == trip.owner_id:
        raise ConflictError("The owner is already a member of this trip")

    result = await session.execute(
        select(TripMember).where(TripMember.trip_id == trip.id, TripMember.user_id == user.id)
    )
    member = result.scalar_one_or_none()
    if member is not None:
        if member.deleted_at is None:
            raise ConflictError("This user is already a member of this trip")
        # Re-adding someone who was removed reuses the row the clients already know.
        member.deleted_at = None
        member.role = role
    else:
        member = TripMember(trip_id=trip.id, user_id=user.id, role=role)
        session.add(member)
    await session.flush()
    return member


async def get_member(session: AsyncSession, trip: Trip, user_id: UUID) -> TripMember:
    result = await session.execute(
        select(TripMember).where(
            TripMember.trip_id == trip.id,
            TripMember.user_id == user_id,
            TripMember.deleted_at.is_(None),
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise NotFoundError("This user is not a member of this trip")
    return member


async def set_member_role(
    session: AsyncSession, member: TripMember, role: MemberRole
) -> TripMember:
    if role is MemberRole.OWNER:
        raise AppError("A trip has exactly one owner; transfer ownership instead")
    member.role = role
    await session.flush()
    return member


async def remove_member(session: AsyncSession, member: TripMember) -> None:
    member.deleted_at = datetime.now(UTC)
    await session.flush()
