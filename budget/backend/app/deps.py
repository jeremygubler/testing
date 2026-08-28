from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Household

DbSession = Annotated[Session, Depends(get_db)]


def get_household(db: DbSession) -> Household:
    """Version 1 kennt genau einen Haushalt pro Installation."""
    settings = get_settings()
    household = db.get(Household, settings.single_household_id)
    if household is None:
        household = db.scalar(select(Household).order_by(Household.id).limit(1))
    if household is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Es ist noch kein Haushalt eingerichtet.",
        )
    return household


CurrentHousehold = Annotated[Household, Depends(get_household)]
