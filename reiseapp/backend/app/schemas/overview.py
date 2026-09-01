from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import MemberRole


class TripOverview(BaseModel):
    """One trip as it appears on the world map: a coarse line and a few numbers."""

    id: UUID
    title: str
    start_date: date | None
    end_date: date | None
    role: MemberRole
    countries: list[str]
    point_count: int
    distance_m: float
    #: [lon, lat] pairs, simplified for a world-scale view. Empty when the trip
    #: has no recorded route yet — that is a normal state, not an error.
    coordinates: list[list[float]]
    #: [west, south, east, north], the order MapLibre's fitBounds expects.
    bounds: list[float] | None = None


class WorldOverview(BaseModel):
    trips: list[TripOverview]
    #: Every country touched by any trip, each one once.
    countries: list[str] = Field(default_factory=list)
    total_distance_m: float
