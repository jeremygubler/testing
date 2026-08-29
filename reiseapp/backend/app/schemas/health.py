from __future__ import annotations

from pydantic import BaseModel


class LivenessResponse(BaseModel):
    status: str
    version: str
    env: str


class ReadinessResponse(BaseModel):
    status: str
    database: bool
    postgis: str | None = None
    object_storage: bool
