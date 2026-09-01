from __future__ import annotations

from datetime import datetime
from uuid import UUID

from app.schemas.common import ORMModel


class UserRead(ORMModel):
    id: UUID
    email: str
    display_name: str
    is_admin: bool
    created_at: datetime
