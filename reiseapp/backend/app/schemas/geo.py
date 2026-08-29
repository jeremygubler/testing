from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.enums import WaypointSource
from app.schemas.common import ORMModel

Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]


class PointIn(BaseModel):
    lat: Latitude
    lon: Longitude


class WaypointCreate(PointIn):
    # Client-generated so a retried batch upload is idempotent instead of
    # duplicating the whole leg.
    id: UUID | None = None
    altitude_m: float | None = None
    accuracy_m: float | None = Field(default=None, ge=0)
    speed_mps: float | None = Field(default=None, ge=0)
    heading_deg: float | None = Field(default=None, ge=0, lt=360)
    recorded_at: datetime
    source: WaypointSource = WaypointSource.GPS
    device_id: str | None = Field(default=None, max_length=64)


class WaypointBatch(BaseModel):
    waypoints: list[WaypointCreate] = Field(min_length=1, max_length=5000)


class WaypointBatchResult(BaseModel):
    received: int
    stored: int
    duplicates: int


class WaypointRead(BaseModel):
    id: UUID
    lat: float
    lon: float
    altitude_m: float | None
    accuracy_m: float | None
    speed_mps: float | None
    heading_deg: float | None
    recorded_at: datetime
    source: WaypointSource
    device_id: str | None


class RouteRead(BaseModel):
    """GeoJSON LineString plus the numbers the map needs to frame it."""

    type: str = "LineString"
    coordinates: list[list[float]]
    point_count: int
    distance_m: float
    bounds: list[float] | None = None  # [west, south, east, north]


class StopCreate(PointIn):
    id: UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    altitude_m: float | None = None
    arrived_at: datetime | None = None
    left_at: datetime | None = None
    country: str | None = Field(default=None, min_length=2, max_length=2)
    locality: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=20_000)

    @model_validator(mode="after")
    def _check_interval(self) -> StopCreate:
        if self.arrived_at and self.left_at and self.left_at < self.arrived_at:
            raise ValueError("left_at must not be before arrived_at")
        return self


class StopUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    lat: Latitude | None = None
    lon: Longitude | None = None
    altitude_m: float | None = None
    arrived_at: datetime | None = None
    left_at: datetime | None = None
    country: str | None = Field(default=None, min_length=2, max_length=2)
    locality: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=20_000)

    @model_validator(mode="after")
    def _lat_lon_together(self) -> StopUpdate:
        if (self.lat is None) != (self.lon is None):
            raise ValueError("lat and lon must be updated together")
        return self


class StopRead(ORMModel):
    id: UUID
    trip_id: UUID
    name: str
    lat: float
    lon: float
    altitude_m: float | None
    arrived_at: datetime | None
    left_at: datetime | None
    country: str | None
    locality: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
