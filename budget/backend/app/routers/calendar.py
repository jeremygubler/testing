import datetime as dt

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import CurrentHousehold, DbSession
from app.models import CalendarEntry, Member
from app.schemas import CalendarEntryCreate, CalendarEntryRead, CalendarEntryUpdate

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


def _get(db: Session, household_id: int, entry_id: int) -> CalendarEntry:
    entry = db.get(CalendarEntry, entry_id)
    if entry is None or entry.household_id != household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Termin nicht gefunden.")
    return entry


@router.get("", response_model=list[CalendarEntryRead])
def list_entries(
    household: CurrentHousehold,
    db: DbSession,
    date_from: dt.date | None = Query(default=None),
    date_to: dt.date | None = Query(default=None),
) -> list[CalendarEntryRead]:
    query = select(CalendarEntry).where(CalendarEntry.household_id == household.id)
    if date_from:
        query = query.where(CalendarEntry.date >= date_from)
    if date_to:
        query = query.where(CalendarEntry.date <= date_to)
    rows = db.scalars(query.order_by(CalendarEntry.date, CalendarEntry.id))
    return [CalendarEntryRead.model_validate(row) for row in rows]


@router.post("", response_model=CalendarEntryRead, status_code=status.HTTP_201_CREATED)
def create_entry(
    payload: CalendarEntryCreate, household: CurrentHousehold, db: DbSession
) -> CalendarEntryRead:
    if payload.member_id is not None:
        member = db.get(Member, payload.member_id)
        if member is None or member.household_id != household.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Person nicht gefunden.")
    entry = CalendarEntry(household_id=household.id, **payload.model_dump())
    db.add(entry)
    db.flush()
    return CalendarEntryRead.model_validate(entry)


@router.patch("/{entry_id}", response_model=CalendarEntryRead)
def update_entry(
    entry_id: int, payload: CalendarEntryUpdate, household: CurrentHousehold, db: DbSession
) -> CalendarEntryRead:
    entry = _get(db, household.id, entry_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    db.flush()
    return CalendarEntryRead.model_validate(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: int, household: CurrentHousehold, db: DbSession) -> None:
    entry = _get(db, household.id, entry_id)
    db.delete(entry)
    db.flush()
