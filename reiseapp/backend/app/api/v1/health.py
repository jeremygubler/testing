from __future__ import annotations

import anyio
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.schemas.health import LivenessResponse, ReadinessResponse
from app.storage.s3 import bucket_reachable

router = APIRouter(tags=["health"])


@router.get("/live", response_model=LivenessResponse)
async def liveness(settings: Settings = Depends(get_settings)) -> LivenessResponse:
    """Process is up. Deliberately dependency-free so it never flaps on a DB blip."""
    return LivenessResponse(status="ok", version=__version__, env=settings.env)


@router.get("/ready", response_model=ReadinessResponse)
async def readiness(
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> ReadinessResponse:
    postgis_version: str | None = None
    database_ok = False
    try:
        postgis_version = (await session.execute(text("SELECT PostGIS_Lib_Version()"))).scalar_one()
        database_ok = True
    except Exception:
        database_ok = False

    # boto3 is blocking – keep it off the event loop.
    storage_ok = await anyio.to_thread.run_sync(bucket_reachable)

    ready = database_ok and storage_ok
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadinessResponse(
        status="ok" if ready else "degraded",
        database=database_ok,
        postgis=postgis_version,
        object_storage=storage_ok,
    )
