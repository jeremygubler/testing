from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, SessionDep, TripForEditor, TripForViewer
from app.schemas.sync import SyncPull, SyncPush, SyncPushResult
from app.services import sync as sync_service

router = APIRouter(tags=["sync"])


@router.get("/{trip_id}/sync/pull", response_model=SyncPull)
async def pull(
    session: SessionDep,
    trip: TripForViewer,
    since: datetime | None = Query(
        default=None, description="cursor from the previous pull; omit for a full sync"
    ),
) -> SyncPull:
    """Everything that changed on this trip since the cursor.

    The returned cursor lags the server clock slightly on purpose – see
    services/sync.py for why. Pull again while has_more is true.
    """
    return await sync_service.pull(session, trip, since)


@router.post("/{trip_id}/sync/push", response_model=SyncPushResult)
async def push(
    session: SessionDep, trip: TripForEditor, user: CurrentUser, payload: SyncPush
) -> SyncPushResult:
    """Applies local changes with per-field last-write-wins.

    Fields the server kept because its version was newer come back as conflicts,
    so the client can show them rather than silently losing an edit.
    """
    return await sync_service.push(session, trip, user, payload)
