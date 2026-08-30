from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import PositionSource
from app.schemas.geo import Latitude, Longitude


class PhotoRead(BaseModel):
    id: UUID
    trip_id: UUID
    stop_id: UUID | None
    taken_at: datetime | None
    lat: float | None
    lon: float | None
    altitude_m: float | None
    position_source: PositionSource
    width: int | None
    height: int | None
    byte_size: int | None
    content_type: str
    original_filename: str | None
    caption: str | None
    has_thumbnail: bool
    created_at: datetime


class PhotoUpdate(BaseModel):
    caption: str | None = Field(default=None, max_length=500)
    stop_id: UUID | None = None
    taken_at: datetime | None = None
    lat: Latitude | None = None
    lon: Longitude | None = None


class PhotoUploadResult(BaseModel):
    photo: PhotoRead
    # True when the same bytes were already stored for this trip; the upload is
    # then a no-op and the existing photo comes back.
    duplicate: bool
