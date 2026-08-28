import datetime as dt

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import CurrentHousehold, DbSession
from app.models import Category, SavingsGoal, Transaction
from app.schemas import SavingsGoalCreate, SavingsGoalRead, SavingsGoalUpdate
from app.services.clock import household_today

router = APIRouter(prefix="/api/savings-goals", tags=["savings"])


def _saved(db: Session, goal: SavingsGoal, until: dt.date) -> int:
    """Fortschritt kommt aus den Buchungen der Kategorie, nie aus einem eigenen Feld."""
    conditions = [
        Transaction.household_id == goal.household_id,
        Transaction.category_id == goal.category_id,
        Transaction.date <= until,
    ]
    if goal.start_date:
        conditions.append(Transaction.date >= goal.start_date)
    return (
        db.scalar(select(func.coalesce(func.sum(Transaction.amount_minor), 0)).where(*conditions))
        or 0
    )


def _to_read(db: Session, goal: SavingsGoal, today: dt.date) -> SavingsGoalRead:
    saved = _saved(db, goal, today)
    remaining = max(0, goal.target_amount_minor - saved)

    months_left: int | None = None
    monthly_needed: int | None = None
    if goal.target_date:
        months_left = max(
            0,
            (goal.target_date.year * 12 + goal.target_date.month) - (today.year * 12 + today.month),
        )
        if remaining == 0:
            monthly_needed = 0
        elif months_left > 0:
            monthly_needed = -(-remaining // months_left)  # aufrunden
        else:
            monthly_needed = remaining  # Zieldatum erreicht oder vorbei

    return SavingsGoalRead(
        id=goal.id,
        name=goal.name,
        target_amount_minor=goal.target_amount_minor,
        target_date=goal.target_date,
        category_id=goal.category_id,
        category_name=goal.category.name,
        category_color=goal.category.color,
        start_date=goal.start_date,
        is_active=goal.is_active,
        saved_minor=saved,
        remaining_minor=remaining,
        progress=saved / goal.target_amount_minor if goal.target_amount_minor else None,
        monthly_needed_minor=monthly_needed,
        months_left=months_left,
    )


def _get(db: Session, household_id: int, goal_id: int) -> SavingsGoal:
    goal = db.get(SavingsGoal, goal_id)
    if goal is None or goal.household_id != household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sparziel nicht gefunden.")
    return goal


@router.get("", response_model=list[SavingsGoalRead])
def list_goals(
    household: CurrentHousehold,
    db: DbSession,
    include_inactive: bool = True,
    today: dt.date | None = None,
) -> list[SavingsGoalRead]:
    query = select(SavingsGoal).where(SavingsGoal.household_id == household.id)
    if not include_inactive:
        query = query.where(SavingsGoal.is_active.is_(True))
    reference = today or household_today(household)
    return [_to_read(db, goal, reference) for goal in db.scalars(query.order_by(SavingsGoal.id))]


@router.post("", response_model=SavingsGoalRead, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: SavingsGoalCreate, household: CurrentHousehold, db: DbSession
) -> SavingsGoalRead:
    category = db.get(Category, payload.category_id)
    if category is None or category.household_id != household.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kategorie nicht gefunden.")
    goal = SavingsGoal(household_id=household.id, **payload.model_dump())
    db.add(goal)
    db.flush()
    db.refresh(goal)
    return _to_read(db, goal, household_today(household))


@router.patch("/{goal_id}", response_model=SavingsGoalRead)
def update_goal(
    goal_id: int, payload: SavingsGoalUpdate, household: CurrentHousehold, db: DbSession
) -> SavingsGoalRead:
    goal = _get(db, household.id, goal_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    db.flush()
    db.refresh(goal)
    return _to_read(db, goal, household_today(household))


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: int, household: CurrentHousehold, db: DbSession) -> None:
    """Sparziele tragen keine Historie -- der Fortschritt steckt in den Buchungen."""
    goal = _get(db, household.id, goal_id)
    db.delete(goal)
    db.flush()
