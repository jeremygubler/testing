from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import TripVisibility
from app.schemas.geo import Latitude, Longitude, StopRead, WaypointCreate, WaypointRead
from app.schemas.journal import JournalEntryRead
from app.schemas.photo import PhotoRead
from app.schemas.trip import TripMemberRead, TripRead


class Changes[T](BaseModel):
    updated: list[T] = Field(default_factory=list)
    #: Soft-deleted since the cursor. Ids only – the client just removes them.
    deleted: list[UUID] = Field(default_factory=list)


class SyncPull(BaseModel):
    """Everything that changed on one trip since the client's cursor."""

    cursor: datetime
    trip: TripRead | None = None
    trip_deleted: bool = False
    members: list[TripMemberRead] = Field(default_factory=list)
    stops: Changes[StopRead] = Field(default_factory=Changes[StopRead])
    waypoints: Changes[WaypointRead] = Field(default_factory=Changes[WaypointRead])
    photos: Changes[PhotoRead] = Field(default_factory=Changes[PhotoRead])
    journal_entries: Changes[JournalEntryRead] = Field(
        default_factory=Changes[JournalEntryRead]
    )
    #: True when the page was capped; pull again with the returned cursor.
    has_more: bool = False


class PushRecord(BaseModel):
    """Common envelope for a locally changed record."""

    id: UUID
    #: When the client last touched the record as a whole.
    updated_at: datetime
    #: Optional per-field timestamps; anything missing falls back to updated_at.
    field_updated_at: dict[str, datetime] = Field(default_factory=dict)

    def changed_fields(self) -> dict[str, object]:
        return self.model_dump(
            exclude_unset=True, exclude={"id", "updated_at", "field_updated_at"}
        )


class TripPush(PushRecord):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    visibility: TripVisibility | None = None
    cover_photo_id: UUID | None = None
    deleted_at: datetime | None = None


class StopPush(PushRecord):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    lat: Latitude | None = None
    lon: Longitude | None = None
    altitude_m: float | None = None
    arrived_at: datetime | None = None
    left_at: datetime | None = None
    country: str | None = Field(default=None, min_length=2, max_length=2)
    locality: str | None = Field(default=None, max_length=200)
    notes: str | None = None
    deleted_at: datetime | None = None


class JournalPush(PushRecord):
    title: str | None = Field(default=None, max_length=200)
    text: str | None = Field(default=None, max_length=100_000)
    timestamp: datetime | None = None
    stop_id: UUID | None = None
    deleted_at: datetime | None = None


class PhotoPush(PushRecord):
    """Metadata only – the bytes go through the upload endpoint."""

    caption: str | None = Field(default=None, max_length=500)
    stop_id: UUID | None = None
    deleted_at: datetime | None = None


class SyncPush(BaseModel):
    trip: TripPush | None = None
    stops: list[StopPush] = Field(default_factory=list, max_length=1000)
    journal_entries: list[JournalPush] = Field(default_factory=list, max_length=1000)
    photos: list[PhotoPush] = Field(default_factory=list, max_length=1000)
    #: Append-only: waypoints are never edited, only added, and duplicate ids
    #: are ignored rather than merged.
    waypoints: list[WaypointCreate] = Field(default_factory=list, max_length=5000)


class Conflict(BaseModel):
    id: UUID
    #: Fields the server kept because its version was newer.
    fields: list[str]


class EntityResult(BaseModel):
    applied: list[UUID] = Field(default_factory=list)
    created: list[UUID] = Field(default_factory=list)
    conflicts: list[Conflict] = Field(default_factory=list)


class SyncPushResult(BaseModel):
    cursor: datetime
    trip: EntityResult = Field(default_factory=EntityResult)
    stops: EntityResult = Field(default_factory=EntityResult)
    journal_entries: EntityResult = Field(default_factory=EntityResult)
    photos: EntityResult = Field(default_factory=EntityResult)
    waypoints_stored: int = 0
