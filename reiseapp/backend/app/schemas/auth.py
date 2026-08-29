from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel

# Long enough to matter, short enough that a passphrase still fits comfortably.
Password = Field(min_length=10, max_length=200)


class RegisterRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=80)
    password: str = Password
    # Required unless the instance runs with open registration.
    invite_code: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=512)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_at: datetime


class InviteCreate(BaseModel):
    email: EmailStr | None = None
    ttl_days: int | None = Field(default=None, ge=1, le=365)


class InviteRead(ORMModel):
    id: UUID
    email: str | None
    expires_at: datetime
    used_at: datetime | None


class InviteCreated(InviteRead):
    # Returned exactly once – only the hash is stored.
    code: str
