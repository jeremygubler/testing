from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, SessionDep, TripForEditor, TripForViewer
from app.schemas.journal import (
    JournalEntryCreate,
    JournalEntryRead,
    JournalEntryUpdate,
    Timeline,
)
from app.services import journal as journal_service
from app.services import timeline as timeline_service

router = APIRouter(tags=["journal"])


@router.post(
    "/{trip_id}/journal", response_model=JournalEntryRead, status_code=status.HTTP_201_CREATED
)
async def create_entry(
    session: SessionDep, trip: TripForEditor, user: CurrentUser, data: JournalEntryCreate
) -> JournalEntryRead:
    entry = await journal_service.create_entry(session, trip, user, data)
    return journal_service.to_read(entry)


@router.get("/{trip_id}/journal", response_model=list[JournalEntryRead])
async def list_entries(session: SessionDep, trip: TripForViewer) -> list[JournalEntryRead]:
    entries = await journal_service.list_entries(session, trip)
    return [journal_service.to_read(entry) for entry in entries]


@router.get("/{trip_id}/journal/{entry_id}", response_model=JournalEntryRead)
async def get_entry(
    session: SessionDep, trip: TripForViewer, entry_id: UUID
) -> JournalEntryRead:
    return journal_service.to_read(await journal_service.get_entry(session, trip, entry_id))


@router.patch("/{trip_id}/journal/{entry_id}", response_model=JournalEntryRead)
async def update_entry(
    session: SessionDep, trip: TripForEditor, entry_id: UUID, data: JournalEntryUpdate
) -> JournalEntryRead:
    entry = await journal_service.get_entry(session, trip, entry_id)
    return journal_service.to_read(
        await journal_service.update_entry(session, trip, entry, data)
    )


@router.delete("/{trip_id}/journal/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(session: SessionDep, trip: TripForEditor, entry_id: UUID) -> Response:
    entry = await journal_service.get_entry(session, trip, entry_id)
    await journal_service.delete_entry(session, entry)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{trip_id}/timeline", response_model=Timeline)
async def get_timeline(session: SessionDep, trip: TripForViewer) -> Timeline:
    return await timeline_service.build(session, trip)
