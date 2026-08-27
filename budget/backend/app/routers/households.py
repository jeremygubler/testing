from fastapi import APIRouter

from app.deps import CurrentHousehold, DbSession
from app.schemas import HouseholdRead, HouseholdUpdate

router = APIRouter(prefix="/api/household", tags=["household"])


@router.get("", response_model=HouseholdRead)
def read_household(household: CurrentHousehold) -> HouseholdRead:
    return HouseholdRead.model_validate(household)


@router.patch("", response_model=HouseholdRead)
def update_household(
    payload: HouseholdUpdate, household: CurrentHousehold, db: DbSession
) -> HouseholdRead:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(household, field, value)
    db.flush()
    return HouseholdRead.model_validate(household)
