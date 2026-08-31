from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Query

from app.api.deps import SessionDep, TripForEditor, TripForViewer
from app.schemas.geo import (
    RouteRead,
    TrackCleared,
    TripStats,
    WaypointBatch,
    WaypointBatchResult,
    WaypointRead,
)
from app.services import waypoints as waypoint_service

router = APIRouter(tags=["waypoints"])


@router.post("/{trip_id}/waypoints", response_model=WaypointBatchResult)
async def upload_waypoints(
    session: SessionDep, trip: TripForEditor, data: WaypointBatch
) -> WaypointBatchResult:
    """Batch upload. Idempotent: re-sending a batch stores nothing twice."""
    return await waypoint_service.store_batch(session, trip, data.waypoints)


@router.delete("/{trip_id}/waypoints", response_model=TrackCleared)
async def clear_track(session: SessionDep, trip: TripForEditor) -> TrackCleared:
    """Throws away the recorded track and keeps everything else about the trip."""
    return TrackCleared(removed=await waypoint_service.clear_track(session, trip))


@router.get("/{trip_id}/waypoints", response_model=list[WaypointRead])
async def list_waypoints(
    session: SessionDep,
    trip: TripForViewer,
    since: datetime | None = Query(default=None, description="only points recorded after this"),
    limit: int = Query(default=1000, ge=1, le=5000),
) -> list[WaypointRead]:
    return await waypoint_service.list_waypoints(session, trip, since=since, limit=limit)


@router.get("/{trip_id}/route", response_model=RouteRead)
async def get_route(
    session: SessionDep,
    trip: TripForViewer,
    simplify_m: float = Query(
        default=0.0,
        ge=0,
        le=10_000,
        description="Douglas-Peucker tolerance in metres; 0 returns every point",
    ),
) -> RouteRead:
    return await waypoint_service.route(session, trip, simplify_m)


@router.get("/{trip_id}/stats", response_model=TripStats)
async def get_stats(session: SessionDep, trip: TripForViewer) -> TripStats:
    """Distance, pace split, climb, moving time and counts – all derived."""
    return await waypoint_service.stats(session, trip)
