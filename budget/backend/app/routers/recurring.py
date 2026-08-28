import datetime as dt

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.deps import CurrentHousehold, DbSession
from app.enums import SplitTemplate
from app.models import (
    Category,
    RecurringRule,
    RecurringRuleSplit,
    RecurringSkip,
    Transaction,
)
from app.routers.transactions import to_read
from app.schemas import (
    ConfirmBatch,
    ConfirmOccurrence,
    OccurrenceRead,
    RecurringRuleCreate,
    RecurringRuleRead,
    RecurringRuleUpdate,
    SkipOccurrence,
    SplitLineIn,
    SplitSpec,
    TransactionRead,
)
from app.services import recurring as service
from app.services import transactions as txn_service
from app.services.analytics import month_bounds
from app.services.clock import household_today
from app.services.splits import SplitError

router = APIRouter(prefix="/api/recurring", tags=["recurring"])


def _get_rule(db: Session, household_id: int, rule_id: int) -> RecurringRule:
    rule = db.get(RecurringRule, rule_id)
    if rule is None or rule.household_id != household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Regel nicht gefunden.")
    return rule


def _rule_split(rule: RecurringRule) -> SplitSpec:
    if rule.split_template is SplitTemplate.MANUAL:
        return SplitSpec(
            template=SplitTemplate.MANUAL,
            lines=[
                SplitLineIn(member_id=row.member_id, amount_minor=row.amount_minor)
                for row in rule.manual_splits
            ],
        )
    return SplitSpec(template=rule.split_template, member_id=rule.split_member_id)


#: Felder, die das Faelligkeitsraster bestimmen. Aendert sich eines davon, passen die
#: gespeicherten Faelligkeitstermine bereits gebuchter Transaktionen nicht mehr dazu.
SCHEDULE_FIELDS = ("interval", "day_of_period", "anchor_month", "start_date")


def _to_read(
    db: Session, rule: RecurringRule, today: dt.date, supersedes: int | None = None
) -> RecurringRuleRead:
    return RecurringRuleRead(
        id=rule.id,
        category_id=rule.category_id,
        category_name=rule.category.name,
        category_group=rule.category.group,
        category_color=rule.category.color,
        description=rule.description,
        amount_minor=rule.amount_minor,
        interval=rule.interval,
        day_of_period=rule.day_of_period,
        anchor_month=rule.anchor_month,
        start_date=rule.start_date,
        end_date=rule.end_date,
        is_active=rule.is_active,
        note=rule.note,
        split=_rule_split(rule),
        monthly_estimate_minor=service.monthly_estimate(rule),
        yearly_estimate_minor=service.yearly_estimate(rule),
        open_streak=service.stale_since_months(db, rule, today) if rule.is_active else 0,
        supersedes_rule_id=supersedes,
    )


def _apply_split(db: Session, rule: RecurringRule, spec: SplitSpec) -> None:
    """Standard-Aufteilung der Regel setzen. MANUAL landet in einer eigenen Tabelle."""
    rule.split_template = spec.template
    rule.split_member_id = spec.member_id if spec.template is SplitTemplate.SINGLE else None
    db.execute(delete(RecurringRuleSplit).where(RecurringRuleSplit.rule_id == rule.id))
    if spec.template is SplitTemplate.MANUAL:
        lines = [line for line in (spec.lines or []) if line.amount_minor != 0]
        if not lines:
            raise SplitError("Fuer die manuelle Aufteilung fehlen die Betraege.")
        total = sum(line.amount_minor for line in lines)
        if total != rule.amount_minor:
            raise SplitError(f"Die Aufteilung ergibt {total} statt {rule.amount_minor}.")
        for line in lines:
            db.add(
                RecurringRuleSplit(
                    rule_id=rule.id, member_id=line.member_id, amount_minor=line.amount_minor
                )
            )
    db.flush()


@router.get("", response_model=list[RecurringRuleRead])
def list_rules(
    household: CurrentHousehold,
    db: DbSession,
    include_inactive: bool = True,
    today: dt.date | None = None,
) -> list[RecurringRuleRead]:
    query = select(RecurringRule).where(RecurringRule.household_id == household.id)
    if not include_inactive:
        query = query.where(RecurringRule.is_active.is_(True))
    reference = today or household_today(household)
    rows = db.scalars(
        query.order_by(RecurringRule.interval, RecurringRule.day_of_period, RecurringRule.id)
    )
    return [_to_read(db, rule, reference) for rule in rows]


@router.post("", response_model=RecurringRuleRead, status_code=status.HTTP_201_CREATED)
def create_rule(
    payload: RecurringRuleCreate, household: CurrentHousehold, db: DbSession
) -> RecurringRuleRead:
    category = db.get(Category, payload.category_id)
    if category is None or category.household_id != household.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kategorie nicht gefunden.")

    data = payload.model_dump(exclude={"split"})
    rule = RecurringRule(household_id=household.id, **data)
    db.add(rule)
    db.flush()
    _apply_split(db, rule, payload.split)
    db.refresh(rule)
    return _to_read(db, rule, household_today(household))


@router.patch("/{rule_id}", response_model=RecurringRuleRead)
def update_rule(
    rule_id: int, payload: RecurringRuleUpdate, household: CurrentHousehold, db: DbSession
) -> RecurringRuleRead:
    """Aendert eine Regel.

    Verschiebt die Aenderung das Faelligkeitsraster (Intervall, Buchungstag,
    Ankermonat, Start) **und** hat die Regel bereits bestaetigte Buchungen, wird nicht
    in place geaendert: die alte Regel wird zum Stichtag beendet und eine neue mit dem
    neuen Raster angelegt. Sonst wuerden die gespeicherten Faelligkeitstermine der
    bereits gebuchten Transaktionen zu keinem erzeugten Termin mehr passen -- die
    Vergangenheit erschiene wieder als offener Vorschlag und liesse sich ein zweites
    Mal buchen.
    """
    rule = _get_rule(db, household.id, rule_id)
    today = household_today(household)
    data = payload.model_dump(exclude_unset=True, exclude={"split", "effective_from"})

    if "category_id" in data:
        category = db.get(Category, data["category_id"])
        if category is None or category.household_id != household.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Kategorie nicht gefunden.")

    schedule_changed = any(
        field in data and data[field] != getattr(rule, field) for field in SCHEDULE_FIELDS
    )
    confirmed = (
        db.scalar(
            select(func.count())
            .select_from(Transaction)
            .where(
                Transaction.recurring_rule_id == rule.id,
                Transaction.recurring_occurrence_date.is_not(None),
            )
        )
        or 0
    )

    if schedule_changed and confirmed:
        return _supersede(db, household, rule, payload, data, today)

    for field, value in data.items():
        setattr(rule, field, value)
    db.flush()
    if payload.split is not None:
        _apply_split(db, rule, payload.split)
    db.refresh(rule)
    return _to_read(db, rule, today)


def _supersede(
    db: Session,
    household,
    rule: RecurringRule,
    payload: RecurringRuleUpdate,
    data: dict,
    today: dt.date,
) -> RecurringRuleRead:
    """Beendet die alte Regel und legt die geaenderte als Nachfolgerin an."""
    effective_from = payload.effective_from or today
    if effective_from < rule.start_date:
        effective_from = rule.start_date

    # Kein Termin darf zwischen Stuhl und Bank fallen: die alte Regel laeuft bis zum
    # Tag vor dem Stichtag weiter, die neue beginnt am Stichtag.
    previous_end = effective_from - dt.timedelta(days=1)
    rule.end_date = previous_end if previous_end >= rule.start_date else rule.start_date

    successor = RecurringRule(
        household_id=household.id,
        category_id=data.get("category_id", rule.category_id),
        description=data.get("description", rule.description),
        amount_minor=data.get("amount_minor", rule.amount_minor),
        interval=data.get("interval", rule.interval),
        day_of_period=data.get("day_of_period", rule.day_of_period),
        anchor_month=data.get("anchor_month", rule.anchor_month),
        start_date=max(data.get("start_date", effective_from), effective_from),
        end_date=data.get("end_date", rule.end_date if rule.end_date != previous_end else None),
        is_active=data.get("is_active", rule.is_active),
        note=data.get("note", rule.note),
    )
    db.add(successor)
    db.flush()
    _apply_split(db, successor, payload.split or _rule_split(rule))
    db.refresh(successor)
    return _to_read(db, successor, today, supersedes=rule.id)


@router.delete("/{rule_id}", response_model=RecurringRuleRead)
def deactivate_rule(rule_id: int, household: CurrentHousehold, db: DbSession) -> RecurringRuleRead:
    """Regeln werden deaktiviert -- bereits daraus gebuchte Transaktionen bleiben."""
    rule = _get_rule(db, household.id, rule_id)
    rule.is_active = False
    db.flush()
    return _to_read(db, rule, household_today(household))


@router.get("/occurrences", response_model=list[OccurrenceRead])
def list_occurrences(
    household: CurrentHousehold,
    db: DbSession,
    year: int = Query(ge=1900, le=2200),
    month: int = Query(ge=1, le=12),
    only_open: bool = False,
) -> list[OccurrenceRead]:
    start, end = month_bounds(year, month)
    entries = service.occurrences_for_period(db, household.id, start, end)
    rules = {
        rule.id: rule
        for rule in db.scalars(
            select(RecurringRule).where(RecurringRule.household_id == household.id)
        )
    }
    result = []
    for entry in entries:
        if only_open and entry.status != service.OPEN:
            continue
        rule = rules[entry.rule_id]
        result.append(
            OccurrenceRead(
                rule_id=entry.rule_id,
                due_date=entry.due_date,
                status=entry.status,
                transaction_id=entry.transaction_id,
                booked_amount_minor=entry.booked_amount_minor,
                booked_date=entry.booked_date,
                description=rule.description,
                category_id=rule.category_id,
                category_name=rule.category.name,
                category_group=rule.category.group,
                amount_minor=rule.amount_minor,
            )
        )
    return result


def _confirm_one(db: Session, household, entry: ConfirmOccurrence) -> TransactionRead:
    rule = _get_rule(db, household.id, entry.rule_id)
    already = db.scalar(
        select(Transaction.id).where(
            Transaction.recurring_rule_id == rule.id,
            Transaction.recurring_occurrence_date == entry.due_date,
        )
    )
    if already is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Der Termin {entry.due_date.isoformat()} ist bereits gebucht.",
        )

    amount = entry.amount_minor if entry.amount_minor is not None else rule.amount_minor
    split = entry.split or _rule_split(rule)
    txn = txn_service.create_transaction(
        db,
        household,
        date=entry.date or entry.due_date,
        category_id=rule.category_id,
        description=entry.description or rule.description,
        note=entry.note,
        amount_minor=amount,
        split=split,
        recurring_rule_id=rule.id,
        recurring_occurrence_date=entry.due_date,
    )
    # Eine zuvor uebersprungene Faelligkeit ist jetzt gebucht.
    db.execute(
        delete(RecurringSkip).where(
            RecurringSkip.rule_id == rule.id, RecurringSkip.occurrence_date == entry.due_date
        )
    )
    db.flush()
    return to_read(txn)


@router.post("/occurrences/confirm", response_model=list[TransactionRead])
def confirm_occurrences(
    payload: ConfirmBatch, household: CurrentHousehold, db: DbSession
) -> list[TransactionRead]:
    """Bestaetigt einen oder mehrere Vorschlaege. Betrag, Datum und Aufteilung sind anpassbar."""
    return [_confirm_one(db, household, entry) for entry in payload.occurrences]


@router.post("/occurrences/skip", status_code=status.HTTP_204_NO_CONTENT)
def skip_occurrence(payload: SkipOccurrence, household: CurrentHousehold, db: DbSession) -> None:
    rule = _get_rule(db, household.id, payload.rule_id)
    existing = db.scalar(
        select(RecurringSkip).where(
            RecurringSkip.rule_id == rule.id, RecurringSkip.occurrence_date == payload.due_date
        )
    )
    if existing is None:
        db.add(RecurringSkip(rule_id=rule.id, occurrence_date=payload.due_date))
        db.flush()


@router.delete("/occurrences/skip", status_code=status.HTTP_204_NO_CONTENT)
def unskip_occurrence(
    rule_id: int, due_date: dt.date, household: CurrentHousehold, db: DbSession
) -> None:
    rule = _get_rule(db, household.id, rule_id)
    db.execute(
        delete(RecurringSkip).where(
            RecurringSkip.rule_id == rule.id, RecurringSkip.occurrence_date == due_date
        )
    )
    db.flush()
