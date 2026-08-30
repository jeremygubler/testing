from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    auth,
    export,
    health,
    import_api,
    journal,
    photos,
    stops,
    sync,
    trips,
    waypoints,
)

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health")
api_router.include_router(auth.router, prefix="/auth")
api_router.include_router(trips.router, prefix="/trips")
api_router.include_router(waypoints.router, prefix="/trips")
api_router.include_router(stops.router, prefix="/trips")
api_router.include_router(photos.router, prefix="/trips")
api_router.include_router(journal.router, prefix="/trips")
api_router.include_router(sync.router, prefix="/trips")
api_router.include_router(export.router, prefix="/trips")
api_router.include_router(import_api.router)
