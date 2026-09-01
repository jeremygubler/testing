from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, Response, UploadFile, status

from app.api.deps import SessionDep, TripForEditor, TripForViewer
from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError
from app.schemas.photo import PhotoRead, PhotoUpdate, PhotoUploadResult
from app.services import photos as photo_service
from app.storage import ObjectNotFoundError, get_store

router = APIRouter(tags=["photos"])

# Cache aggressively: a photo's bytes never change – a new photo is a new id.
_IMMUTABLE = "private, max-age=31536000, immutable"


@router.post(
    "/{trip_id}/photos", response_model=PhotoUploadResult, status_code=status.HTTP_201_CREATED
)
async def upload_photo(
    session: SessionDep,
    trip: TripForEditor,
    file: Annotated[UploadFile, File()],
    photo_id: Annotated[UUID | None, Form()] = None,
    caption: Annotated[str | None, Form()] = None,
    stop_id: Annotated[UUID | None, Form()] = None,
    taken_at: Annotated[datetime | None, Form()] = None,
    lat: Annotated[float | None, Form()] = None,
    lon: Annotated[float | None, Form()] = None,
) -> PhotoUploadResult:
    """Upload one photo. The original is stored byte-for-byte, EXIF included.

    taken_at/lat/lon are hints from the client, used only when the file itself
    carries no EXIF – the bytes on the server stay the source of truth.
    """
    settings = get_settings()
    data = await file.read()
    if len(data) > settings.max_upload_bytes:
        raise AppError("Photo exceeds the maximum upload size")

    photo, duplicate = await photo_service.store_photo(
        session,
        get_store(),
        trip,
        data=data,
        filename=file.filename,
        content_type=file.content_type or "application/octet-stream",
        photo_id=photo_id,
        caption=caption,
        stop_id=stop_id,
        hint_taken_at=taken_at,
        hint_lat=lat,
        hint_lon=lon,
    )
    return PhotoUploadResult(photo=photo_service.to_read(photo), duplicate=duplicate)


@router.get("/{trip_id}/photos", response_model=list[PhotoRead])
async def list_photos(session: SessionDep, trip: TripForViewer) -> list[PhotoRead]:
    stored = await photo_service.list_photos(session, trip)
    return [photo_service.to_read(photo) for photo in stored]


@router.get("/{trip_id}/photos/{photo_id}", response_model=PhotoRead)
async def get_photo(session: SessionDep, trip: TripForViewer, photo_id: UUID) -> PhotoRead:
    return photo_service.to_read(await photo_service.get_photo(session, trip, photo_id))


@router.get("/{trip_id}/photos/{photo_id}/file")
async def download_photo(
    session: SessionDep,
    trip: TripForViewer,
    photo_id: UUID,
    variant: str = "original",
) -> Response:
    """Streams the bytes through the backend.

    Deliberately not a presigned redirect: one hostname and one certificate is a
    great deal less to get wrong on a homelab than exposing the object store.
    """
    photo = await photo_service.get_photo(session, trip, photo_id)
    if variant == "thumb":
        key, content_type = photo.thumbnail_key, "image/jpeg"
        if key is None:
            key, content_type = photo.storage_key, photo.content_type
    else:
        key, content_type = photo.storage_key, photo.content_type

    try:
        data = await get_store().get(key)
    except ObjectNotFoundError as exc:
        raise NotFoundError("The stored file for this photo is missing") from exc

    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Cache-Control": _IMMUTABLE,
            "Content-Disposition": f'inline; filename="{photo.original_filename or photo.id}"',
        },
    )


@router.patch("/{trip_id}/photos/{photo_id}", response_model=PhotoRead)
async def update_photo(
    session: SessionDep, trip: TripForEditor, photo_id: UUID, data: PhotoUpdate
) -> PhotoRead:
    photo = await photo_service.get_photo(session, trip, photo_id)
    return photo_service.to_read(await photo_service.update_photo(session, photo, data))


@router.delete("/{trip_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(session: SessionDep, trip: TripForEditor, photo_id: UUID) -> Response:
    photo = await photo_service.get_photo(session, trip, photo_id)
    await photo_service.delete_photo(session, photo)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
