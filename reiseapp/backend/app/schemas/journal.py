from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.geo import StopRead
from app.schemas.photo import PhotoRead


class JournalEntryCreate(BaseModel):
    # Offline-first: the client may bring its own id.
    id: UUID | None = None
    title: str | None = Field(default=None, max_length=200)
    text: str = Field(default="", max_length=100_000)
    timestamp: datetime
    stop_id: UUID | None = None
    # Order matters and is preserved as given.
    photo_ids: list[UUID] = Field(default_factory=list, max_length=200)


class JournalEntryUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    text: str | None = Field(default=None, max_length=100_000)
    timestamp: datetime | None = None
    stop_id: UUID | None = None
    photo_ids: list[UUID] | None = Field(default=None, max_length=200)


class JournalEntryRead(BaseModel):
    id: UUID
    trip_id: UUID
    stop_id: UUID | None
    author_id: UUID | None
    title: str | None
    text: str
    timestamp: datetime
    photos: list[PhotoRead]
    created_at: datetime
    updated_at: datetime


TimelineKind = Literal["stop", "journal", "photos"]


class TimelineItem(BaseModel):
    """One row of the merged trip timeline.

    Assembled server-side so the app, the web viewer (phase 9) and the PDF
    travel book (phase 8) all order and group it identically.
    """

    kind: TimelineKind
    at: datetime
    stop: StopRead | None = None
    entry: JournalEntryRead | None = None
    photos: list[PhotoRead] = Field(default_factory=list)


class Timeline(BaseModel):
    items: list[TimelineItem]
