import datetime as dt

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.deps import CurrentHousehold, DbSession
from app.enums import CategoryGroup, Flow
from app.models import Category, Transaction, TransactionSplit
from app.schemas import (
    CategorySuggestion,
    SplitLineRead,
    SplitPreviewRequest,
    SplitPreviewResponse,
    TransactionCreate,
    TransactionPage,
    TransactionRead,
    TransactionUpdate,
)
from app.services import inference
from app.services import transactions as service

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def to_read(txn: Transaction) -> TransactionRead:
    return TransactionRead(
        id=txn.id,
        date=txn.date,
        account_id=txn.account_id,
        account_name=txn.account.name,
        counter_account_id=txn.counter_account_id,
        counter_account_name=txn.counter_account.name if txn.counter_account else None,
        is_transfer=txn.counter_account_id is not None,
        category_id=txn.category_id,
        category_name=txn.category.name,
        category_group=txn.category.group,
        category_flow=txn.category.flow,
        category_color=txn.category.color,
        description=txn.description,
        note=txn.note,
        amount_minor=txn.amount_minor,
        recurring_rule_id=txn.recurring_rule_id,
        attachment_count=len(txn.attachments),
        splits=[
            SplitLineRead(member_id=s.member_id, amount_minor=s.amount_minor)
            for s in sorted(txn.splits, key=lambda s: s.id)
        ],
    )


def _get(db: Session, household_id: int, txn_id: int) -> Transaction:
    txn = db.get(Transaction, txn_id)
    if txn is None or txn.household_id != household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Buchung nicht gefunden.")
    return txn


@router.get("", response_model=TransactionPage)
def list_transactions(
    household: CurrentHousehold,
    db: DbSession,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    category_id: list[int] | None = Query(default=None),
    group: list[CategoryGroup] | None = Query(default=None),
    member_id: list[int] | None = Query(default=None),
    account_id: list[int] | None = Query(default=None),
    transfers: bool | None = Query(
        default=None,
        description="true = nur Umbuchungen, false = nur Einnahmen/Ausgaben, leer = alles",
    ),
    q: str | None = Query(default=None, description="Freitextsuche in Beschreibung und Notiz"),
    recurring_rule_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    sort: str = Query(default="-date", pattern="^-?(date|amount|description)$"),
) -> TransactionPage:
    conditions = [Transaction.household_id == household.id]
    if date_from:
        conditions.append(Transaction.date >= date_from)
    if date_to:
        conditions.append(Transaction.date <= date_to)
    if category_id:
        conditions.append(Transaction.category_id.in_(category_id))
    if recurring_rule_id is not None:
        conditions.append(Transaction.recurring_rule_id == recurring_rule_id)
    if account_id:
        conditions.append(
            Transaction.account_id.in_(account_id) | Transaction.counter_account_id.in_(account_id)
        )
    if transfers is not None:
        conditions.append(
            Transaction.counter_account_id.is_not(None)
            if transfers
            else Transaction.counter_account_id.is_(None)
        )
    if group:
        conditions.append(
            Transaction.category_id.in_(
                select(Category.id).where(Category.group.in_([g.value for g in group]))
            )
        )
    if member_id:
        conditions.append(
            Transaction.id.in_(
                select(TransactionSplit.txn_id).where(TransactionSplit.member_id.in_(member_id))
            )
        )
    if q:
        needle = f"%{q.strip()}%"
        conditions.append(
            or_(Transaction.description.ilike(needle), Transaction.note.ilike(needle))
        )

    where = and_(*conditions)
    total = db.scalar(select(func.count()).select_from(Transaction).where(where)) or 0

    income_sum = (
        db.scalar(
            select(func.coalesce(func.sum(Transaction.amount_minor), 0))
            .select_from(Transaction)
            .join(Category, Category.id == Transaction.category_id)
            .where(where, Category.flow == Flow.INCOME, Transaction.counter_account_id.is_(None))
        )
        or 0
    )
    expense_sum = (
        db.scalar(
            select(func.coalesce(func.sum(Transaction.amount_minor), 0))
            .select_from(Transaction)
            .join(Category, Category.id == Transaction.category_id)
            .where(where, Category.flow == Flow.EXPENSE, Transaction.counter_account_id.is_(None))
        )
        or 0
    )

    descending = sort.startswith("-")
    key = sort.lstrip("-")
    column = {
        "date": Transaction.date,
        "amount": Transaction.amount_minor,
        "description": Transaction.description,
    }[key]
    order = column.desc() if descending else column.asc()

    rows = db.scalars(
        select(Transaction)
        .where(where)
        .order_by(order, Transaction.id.desc())
        .limit(limit)
        .offset(offset)
    ).unique()

    return TransactionPage(
        items=[to_read(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
        sum_income_minor=income_sum,
        sum_expense_minor=expense_sum,
    )


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreate, household: CurrentHousehold, db: DbSession
) -> TransactionRead:
    txn = service.create_transaction(
        db,
        household,
        date=payload.date,
        category_id=payload.category_id,
        description=payload.description,
        note=payload.note,
        amount_minor=payload.amount_minor,
        split=payload.split,
        account_id=payload.account_id,
        counter_account_id=payload.counter_account_id,
    )
    return to_read(txn)


@router.post("/preview-split", response_model=SplitPreviewResponse)
def preview_split(
    payload: SplitPreviewRequest, household: CurrentHousehold, db: DbSession
) -> SplitPreviewResponse:
    """Loest eine Vorlage auf, ohne zu speichern -- fuer die Live-Vorschau im Formular."""
    lines = service.resolve_split(db, household, payload.amount_minor, payload.split)
    return SplitPreviewResponse(
        lines=[
            SplitLineRead(member_id=line.member_id, amount_minor=line.amount_minor)
            for line in lines
        ],
        total_minor=sum(line.amount_minor for line in lines),
    )


@router.get("/suggest-category", response_model=CategorySuggestion | None)
def suggest_category(
    household: CurrentHousehold,
    db: DbSession,
    description: str = Query(min_length=1, max_length=200),
) -> CategorySuggestion | None:
    """Raet die Kategorie aus frueheren Buchungen mit aehnlicher Beschreibung.

    Nur ein Vorschlag -- angewendet wird er erst, wenn der Nutzer ihn uebernimmt.
    """
    suggestion = inference.suggest_category(db, household.id, description)
    if suggestion is None:
        return None
    return CategorySuggestion(
        category_id=suggestion.category_id,
        category_name=suggestion.category_name,
        matches=suggestion.matches,
        basis=suggestion.basis,
    )


@router.get("/{txn_id}", response_model=TransactionRead)
def read_transaction(txn_id: int, household: CurrentHousehold, db: DbSession) -> TransactionRead:
    return to_read(_get(db, household.id, txn_id))


@router.patch("/{txn_id}", response_model=TransactionRead)
def update_transaction(
    txn_id: int, payload: TransactionUpdate, household: CurrentHousehold, db: DbSession
) -> TransactionRead:
    txn = _get(db, household.id, txn_id)
    data = payload.model_dump(exclude_unset=True)
    txn = service.update_transaction(
        db,
        household,
        txn,
        date=data.get("date"),
        category_id=data.get("category_id"),
        description=data.get("description"),
        note=data.get("note"),
        amount_minor=data.get("amount_minor"),
        split=payload.split,
        account_id=data.get("account_id"),
        counter_account_id=data.get("counter_account_id"),
        counter_account_set="counter_account_id" in data,
    )
    return to_read(txn)


@router.delete("/{txn_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(txn_id: int, household: CurrentHousehold, db: DbSession) -> None:
    txn = _get(db, household.id, txn_id)
    db.delete(txn)
    db.flush()
