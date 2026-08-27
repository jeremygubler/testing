from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.deps import CurrentHousehold, DbSession
from app.models import Member
from app.schemas import MemberCreate, MemberRead, MemberUpdate

router = APIRouter(prefix="/api/members", tags=["members"])


def _get(db: DbSession, household: CurrentHousehold, member_id: int) -> Member:
    member = db.get(Member, member_id)
    if member is None or member.household_id != household.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Person nicht gefunden.")
    return member


@router.get("", response_model=list[MemberRead])
def list_members(
    household: CurrentHousehold, db: DbSession, include_inactive: bool = True
) -> list[MemberRead]:
    query = select(Member).where(Member.household_id == household.id)
    if not include_inactive:
        query = query.where(Member.is_active.is_(True))
    rows = db.scalars(query.order_by(Member.sort_order, Member.id))
    return [MemberRead.model_validate(row) for row in rows]


@router.post("", response_model=MemberRead, status_code=status.HTTP_201_CREATED)
def create_member(
    payload: MemberCreate, household: CurrentHousehold, db: DbSession
) -> MemberRead:
    existing = db.scalar(
        select(func.count())
        .select_from(Member)
        .where(Member.household_id == household.id, Member.is_active.is_(True))
    )
    if existing and existing >= 6:
        raise HTTPException(
            422,
            "Ein Haushalt umfasst hoechstens 6 aktive Personen.",
        )
    if db.scalar(
        select(Member).where(Member.household_id == household.id, Member.name == payload.name)
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Es gibt bereits eine Person namens '{payload.name}'."
        )
    member = Member(household_id=household.id, **payload.model_dump())
    db.add(member)
    db.flush()
    return MemberRead.model_validate(member)


@router.patch("/{member_id}", response_model=MemberRead)
def update_member(
    member_id: int, payload: MemberUpdate, household: CurrentHousehold, db: DbSession
) -> MemberRead:
    member = _get(db, household, member_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] != member.name:
        clash = db.scalar(
            select(Member).where(
                Member.household_id == household.id,
                Member.name == data["name"],
                Member.id != member.id,
            )
        )
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, "Name ist bereits vergeben.")
    for field, value in data.items():
        setattr(member, field, value)
    db.flush()
    return MemberRead.model_validate(member)


@router.delete("/{member_id}", response_model=MemberRead)
def deactivate_member(
    member_id: int, household: CurrentHousehold, db: DbSession
) -> MemberRead:
    """Personen werden nie hart geloescht, damit historische Buchungen intakt bleiben."""
    member = _get(db, household, member_id)
    active_left = db.scalar(
        select(func.count()).select_from(Member).where(
            Member.household_id == household.id,
            Member.is_active.is_(True),
            Member.id != member.id,
        )
    )
    if member.is_active and not active_left:
        raise HTTPException(
            422,
            "Die letzte aktive Person kann nicht deaktiviert werden.",
        )
    member.is_active = False
    db.flush()
    return MemberRead.model_validate(member)
