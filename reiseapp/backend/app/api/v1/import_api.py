from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, UploadFile, status

from app.api.deps import CurrentUser, SessionDep
from app.core.config import get_settings
from app.core.errors import AppError
from app.models import MemberRole, Trip
from app.schemas.import_schema import ImportSummary
from app.services import import_service
from app.services import trips as trip_service
from app.services.importers import ImportFormat, detect_format, parse

router = APIRouter(tags=["import"])


@router.post("/import", response_model=ImportSummary, status_code=status.HTTP_201_CREATED)
async def import_file(
    session: SessionDep,
    user: CurrentUser,
    file: Annotated[UploadFile, File()],
    trip_id: Annotated[UUID | None, Form()] = None,
    format: Annotated[ImportFormat | None, Form()] = None,
    title: Annotated[str | None, Form()] = None,
) -> ImportSummary:
    """Imports GPX, a Zugvogel export, a Polarsteps export or a Google Timeline.

    Without trip_id a new trip is created from the file's own metadata. Importing
    the same file twice is a no-op: ids are derived from content, so the second
    run collides with the first instead of doubling the route.
    """
    settings = get_settings()
    data = await file.read()
    if not data:
        raise AppError("Empty file")
    if len(data) > settings.max_import_bytes:
        raise AppError(
            f"File is larger than the allowed {settings.max_import_bytes // (1024 * 1024)} MB"
        )

    detected = format or detect_format(data)
    imported = parse(data, detected)

    created = False
    if trip_id is None:
        trip = Trip(owner_id=user.id, title=import_service.trip_title(imported, title))
        if imported.description:
            trip.description = imported.description
        session.add(trip)
        await session.flush()
        created = True
    else:
        trip, _ = await trip_service.get_trip_for_user(
            session, trip_id, user, MemberRole.EDITOR
        )

    result = await import_service.apply(session, trip, user, imported)
    return ImportSummary(
        trip_id=trip.id,
        trip_created=created,
        detected_format=detected,
        waypoints_stored=result.waypoints_stored,
        waypoints_duplicate=result.waypoints_duplicate,
        stops_created=result.stops_created,
        stops_duplicate=result.stops_duplicate,
        entries_created=result.entries_created,
        warnings=result.warnings,
    )
