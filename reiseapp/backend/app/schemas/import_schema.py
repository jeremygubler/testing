from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field

from app.services.importers import ImportFormat


class ImportSummary(BaseModel):
    trip_id: UUID
    trip_created: bool
    detected_format: ImportFormat
    waypoints_stored: int
    waypoints_duplicate: int
    stops_created: int
    stops_duplicate: int
    entries_created: int
    #: Anything the file contained that could not be used – reported, not hidden.
    warnings: list[str] = Field(default_factory=list)
