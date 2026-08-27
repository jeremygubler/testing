from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import CurrentHousehold, DbSession
from app.models import Member, SettlementPayment
from app.schemas import SettlementPaymentCreate, SettlementPaymentRead

router = APIRouter(prefix="/api/settlements", tags=["settlements"])


def _require_member(db: Session, household_id: int, member_id: int) -> Member:
    member = db.get(Member, member_id)
    if member is None or member.household_id != household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Person nicht gefunden.")
    return member


@router.get("", response_model=list[SettlementPaymentRead])
def list_payments(
    household: CurrentHousehold,
    db: DbSession,
    year: int | None = Query(default=None, ge=1900, le=2200),
    month: int | None = Query(default=None, ge=1, le=12),
    months: int = Query(default=1, ge=1, le=120),
) -> list[SettlementPaymentRead]:
    """Festgehaltene Ausgleichszahlungen, wahlweise auf eine Periode eingegrenzt."""
    query = select(SettlementPayment).where(SettlementPayment.household_id == household.id)
    if year is not None and month is not None:
        end_index = year * 12 + month
        start_index = end_index - (months - 1)
        query = query.where(
            SettlementPayment.period_year.is_not(None),
            (SettlementPayment.period_year * 12 + SettlementPayment.period_month) >= start_index,
            (SettlementPayment.period_year * 12 + SettlementPayment.period_month) <= end_index,
        )
    rows = db.scalars(query.order_by(SettlementPayment.date.desc(), SettlementPayment.id.desc()))
    return [SettlementPaymentRead.model_validate(row) for row in rows]


@router.post("", response_model=SettlementPaymentRead, status_code=status.HTTP_201_CREATED)
def create_payment(
    payload: SettlementPaymentCreate, household: CurrentHousehold, db: DbSession
) -> SettlementPaymentRead:
    """Haelt fest, dass eine empfohlene Zahlung tatsaechlich geflossen ist.

    Die Zahlung ist **keine Buchung**: sie verschiebt Geld zwischen Personen, veraendert
    aber weder Einnahmen noch Ausgaben des Haushalts. Deshalb liegt sie in einer eigenen
    Tabelle und nicht in ``txn``.
    """
    _require_member(db, household.id, payload.from_member_id)
    _require_member(db, household.id, payload.to_member_id)

    payment = SettlementPayment(household_id=household.id, **payload.model_dump())
    db.add(payment)
    db.flush()
    return SettlementPaymentRead.model_validate(payment)


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(payment_id: int, household: CurrentHousehold, db: DbSession) -> None:
    """Nimmt eine festgehaltene Zahlung zurueck -- Vertippen soll korrigierbar sein."""
    payment = db.get(SettlementPayment, payment_id)
    if payment is None or payment.household_id != household.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Zahlung nicht gefunden.")
    db.delete(payment)
    db.flush()
