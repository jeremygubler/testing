from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models.enums import MemberRole, TripVisibility
from app.schemas.common import ORMModel


class TripBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=20_000)
    start_date: date | None = None
    end_date: date | None = None
    visibility: TripVisibility = TripVisibility.PRIVATE

    @model_validator(mode="after")
    def _check_dates(self) -> TripBase:
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        return self


class TripCreate(TripBase):
    # Offline-first: the client may bring its own id so a trip created without
    # network keeps its identity after the first sync.
    id: UUID | None = None


class TripUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=20_000)
    start_date: date | None = None
    end_date: date | None = None
    visibility: TripVisibility | None = None
    cover_photo_id: UUID | None = None


class TripRead(ORMModel):
    id: UUID
    owner_id: UUID
    title: str
    description: str | None
    cover_photo_id: UUID | None
    start_date: date | None
    end_date: date | None
    visibility: TripVisibility
    created_at: datetime
    updated_at: datetime


class TripWithRole(TripRead):
    """A trip plus what the requesting user is allowed to do with it."""

    role: MemberRole


class TripMemberCreate(BaseModel):
    email: EmailStr
    role: MemberRole = MemberRole.VIEWER


class TripMemberUpdate(BaseModel):
    role: MemberRole


class TripMemberRead(BaseModel):
    user_id: UUID
    email: str
    display_name: str
    role: MemberRole
