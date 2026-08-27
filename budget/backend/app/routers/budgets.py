from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import CurrentHousehold, DbSession
from app.models import Budget, Category
from app.schemas import BudgetRead, BudgetUpsert

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


@router.get("", response_model=list[BudgetRead])
def list_budgets(
    household: CurrentHousehold,
    db: DbSession,
    year: int | None = None,
    month: int | None = None,
) -> list[BudgetRead]:
    """Standardbudgets plus -- falls Jahr/Monat gesetzt -- die Uebersteuerungen dieses Monats."""
    query = select(Budget).where(Budget.household_id == household.id)
    if year is not None and month is not None:
        query = query.where(
            (Budget.is_default.is_(True)) | ((Budget.year == year) & (Budget.month == month))
        )
    else:
        query = query.where(Budget.is_default.is_(True))
    return [BudgetRead.model_validate(row) for row in db.scalars(query.order_by(Budget.id))]


@router.put("", response_model=BudgetRead)
def upsert_budget(
    payload: BudgetUpsert, household: CurrentHousehold, db: DbSession
) -> BudgetRead:
    category = db.get(Category, payload.category_id)
    if category is None or category.household_id != household.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kategorie nicht gefunden.")

    is_default = payload.year is None
    existing = db.scalar(
        select(Budget).where(
            Budget.household_id == household.id,
            Budget.category_id == payload.category_id,
            Budget.is_default.is_(is_default),
            Budget.year.is_(None) if is_default else Budget.year == payload.year,
            Budget.month.is_(None) if is_default else Budget.month == payload.month,
        )
    )
    if existing is None:
        existing = Budget(
            household_id=household.id,
            category_id=payload.category_id,
            year=payload.year,
            month=payload.month,
            is_default=is_default,
        )
        db.add(existing)
    existing.amount_minor = payload.amount_minor
    db.flush()
    return BudgetRead.model_validate(existing)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(budget_id: int, household: CurrentHousehold, db: DbSession) -> None:
    """Loescht eine Uebersteuerung; danach greift wieder das Standardbudget."""
    budget = db.get(Budget, budget_id)
    if budget is None or budget.household_id != household.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Budget nicht gefunden.")
    db.delete(budget)
    db.flush()
