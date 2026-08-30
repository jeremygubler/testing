from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel
from app.schemas.geo import RouteRead, StopRead, TripStats
from app.schemas.journal import TimelineItem


class ShareCreate(BaseModel):
    label: str | None = Field(default=None, max_length=120)
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)
    include_photos: bool = True


class ShareRead(ORMModel):
    id: UUID
    label: str | None
    expires_at: datetime | None
    revoked_at: datetime | None
    include_photos: bool
    view_count: int
    last_viewed_at: datetime | None
    created_at: datetime


class ShareCreated(ShareRead):
    #: Returned exactly once – only the hash is stored.
    token: str
    url_path: str


class SharedTrip(BaseModel):
    """Everything a read-only viewer needs, in one request."""

    title: str
    description: str | None
    start_date: str | None
    end_date: str | None
    owner_name: str
    include_photos: bool
    map_style_url: str
    route: RouteRead
    stats: TripStats
    stops: list[StopRead]
    timeline: list[TimelineItem]
