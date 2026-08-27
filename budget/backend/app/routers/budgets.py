import calendar
import datetime as dt

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.deps import CurrentHousehold, DbSession
from app.models import Budget, Category, Transaction
from app.schemas import (
    BudgetBulkUpsert,
    BudgetProposal,
    BudgetProposalRow,
    BudgetRead,
    BudgetUpsert,
)
from app.services import analytics

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
def upsert_budget(payload: BudgetUpsert, household: CurrentHousehold, db: DbSession) -> BudgetRead:
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


@router.get("/proposal", response_model=BudgetProposal)
def budget_proposal(
    household: CurrentHousehold,
    db: DbSession,
    year: int = Query(ge=1900, le=2200),
    month: int = Query(ge=1, le=12),
    source: str = Query(default="AVERAGE", pattern="^(AVERAGE|LAST_MONTH)$"),
    months: int = Query(default=6, ge=1, le=36),
) -> BudgetProposal:
    """Schlaegt Budgets aus dem tatsaechlichen Verlauf vor. Schreibt nichts.

    ``AVERAGE`` mittelt die abgeschlossenen Monate **vor** dem gewaehlten Monat -- der
    laufende Monat ist unvollstaendig und wuerde den Schnitt nach unten ziehen.
    ``LAST_MONTH`` nimmt schlicht den Vormonat.

    Geteilt wird durch die Monate, in denen ueberhaupt gebucht wurde, nicht durch die
    Fensterbreite. Wer die App seit drei Monaten benutzt und ein Halbjahr auswaehlt,
    bekaeme sonst die halbe Miete vorgeschlagen: Monate vor der ersten Buchung sind
    keine Monate ohne Ausgaben, sondern Monate ohne Daten.

    Vorschlaege werden auf ganze Waehrungseinheiten gerundet; ein Budget von 947.83
    waere eine Genauigkeit, die es nicht gibt.
    """
    window = 1 if source == "LAST_MONTH" else months
    end_index = year * 12 + (month - 1) - 1  # letzter abgeschlossener Monat
    start_index = end_index - (window - 1)
    start = dt.date(start_index // 12, start_index % 12 + 1, 1)
    end_year, end_month = end_index // 12, end_index % 12 + 1
    end = dt.date(end_year, end_month, calendar.monthrange(end_year, end_month)[1])

    totals = dict(
        db.execute(
            select(
                Transaction.category_id,
                func.coalesce(func.sum(Transaction.amount_minor), 0),
            )
            .where(
                Transaction.household_id == household.id,
                Transaction.date >= start,
                Transaction.date <= end,
            )
            .group_by(Transaction.category_id)
        ).all()
    )
    # Monate mit mindestens einer Buchung -- das ist der ehrliche Nenner.
    recorded_months = (
        db.scalar(
            select(func.count(func.distinct(func.strftime("%Y-%m", Transaction.date)))).where(
                Transaction.household_id == household.id,
                Transaction.date >= start,
                Transaction.date <= end,
            )
        )
        or 0
    )
    divisor = max(1, min(window, recorded_months))

    existing = analytics.resolve_budgets(db, household.id, year, month)

    rows: list[BudgetProposalRow] = []
    for category in db.scalars(
        select(Category)
        .where(Category.household_id == household.id, Category.is_active.is_(True))
        .order_by(Category.sort_order, Category.id)
    ):
        total = totals.get(category.id, 0)
        average = total / divisor
        # Auf ganze Waehrungseinheiten runden, kaufmaennisch.
        proposed = round(average / 100.0) * 100
        current = existing.get(category.id)
        rows.append(
            BudgetProposalRow(
                category_id=category.id,
                name=category.name,
                group=category.group,
                current_minor=current[0] if current else None,
                proposed_minor=max(0, proposed),
                based_on_months=divisor,
            )
        )
    return BudgetProposal(source=source, rows=rows)


@router.put("/bulk", response_model=list[BudgetRead])
def upsert_budgets(
    payload: BudgetBulkUpsert, household: CurrentHousehold, db: DbSession
) -> list[BudgetRead]:
    """Setzt mehrere Budgets auf einmal -- fuer das Uebernehmen eines Vorschlags."""
    result: list[BudgetRead] = []
    for entry in payload.entries:
        result.append(
            upsert_budget(
                BudgetUpsert(
                    category_id=entry.category_id,
                    amount_minor=entry.amount_minor,
                    year=payload.year,
                    month=payload.month,
                ),
                household,
                db,
            )
        )
    return result
