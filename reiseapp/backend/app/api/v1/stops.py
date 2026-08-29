from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Response, status

from app.api.deps import SessionDep, TripForEditor, TripForViewer
from app.schemas.geo import StopCreate, StopRead, StopUpdate
from app.services import stops as stop_service

router = APIRouter(tags=["stops"])


@router.post("/{trip_id}/stops", response_model=StopRead, status_code=status.HTTP_201_CREATED)
async def create_stop(session: SessionDep, trip: TripForEditor, data: StopCreate) -> StopRead:
    stop = await stop_service.create_stop(session, trip, data)
    return stop_service.to_read(stop)


@router.get("/{trip_id}/stops", response_model=list[StopRead])
async def list_stops(session: SessionDep, trip: TripForViewer) -> list[StopRead]:
    return [stop_service.to_read(stop) for stop in await stop_service.list_stops(session, trip)]


@router.get("/{trip_id}/stops/{stop_id}", response_model=StopRead)
async def get_stop(session: SessionDep, trip: TripForViewer, stop_id: UUID) -> StopRead:
    return stop_service.to_read(await stop_service.get_stop(session, trip, stop_id))


@router.patch("/{trip_id}/stops/{stop_id}", response_model=StopRead)
async def update_stop(
    session: SessionDep, trip: TripForEditor, stop_id: UUID, data: StopUpdate
) -> StopRead:
    stop = await stop_service.get_stop(session, trip, stop_id)
    return stop_service.to_read(await stop_service.update_stop(session, stop, data))


@router.delete("/{trip_id}/stops/{stop_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stop(session: SessionDep, trip: TripForEditor, stop_id: UUID) -> Response:
    stop = await stop_service.get_stop(session, trip, stop_id)
    await stop_service.delete_stop(session, stop)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
