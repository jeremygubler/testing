from fastapi import APIRouter, HTTPException, status

from app.deps import CurrentHousehold, DbSession
from app.schemas import HouseholdCreate, HouseholdRead, HouseholdUpdate
from app.services import setup

router = APIRouter(prefix="/api/household", tags=["household"])


@router.post("", response_model=HouseholdRead, status_code=status.HTTP_201_CREATED)
def create_household(payload: HouseholdCreate, db: DbSession) -> HouseholdRead:
    """Erstinbetriebnahme. Existiert bereits ein Haushalt, wird abgelehnt --
    ein Ueberschreiben waere Datenverlust, kein Einrichten."""
    if setup.household_exists(db):
        raise HTTPException(status.HTTP_409_CONFLICT, "Es ist bereits ein Haushalt eingerichtet.")
    household = setup.create_household(
        db,
        name=payload.name,
        currency=payload.currency,
        locale=payload.locale,
        timezone=payload.timezone,
        opening_balance_minor=payload.opening_balance_minor,
        member_names=payload.member_names,
        with_starter_categories=payload.with_starter_categories,
        account_name=payload.account_name,
    )
    return HouseholdRead.model_validate(household)


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
