"""Anlegen und Aendern von Buchungen samt ihrer Aufteilung."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category, Household, Member, Transaction, TransactionSplit
from app.schemas import SplitSpec
from app.services.splits import SplitError, SplitLine, build_splits, validate


def active_members(db: Session, household_id: int) -> list[Member]:
    return list(
        db.scalars(
            select(Member)
            .where(Member.household_id == household_id, Member.is_active.is_(True))
            .order_by(Member.sort_order, Member.id)
        )
    )


def resolve_split(
    db: Session,
    household: Household,
    amount_minor: int,
    spec: SplitSpec,
) -> list[SplitLine]:
    """Loest eine Aufteilungsvorlage in konkrete Splits auf und prueft sie."""
    members = active_members(db, household.id)
    manual = (
        [SplitLine(line.member_id, line.amount_minor) for line in spec.lines]
        if spec.lines
        else None
    )
    if manual:
        known = {m.id for m in db.scalars(select(Member).where(Member.household_id == household.id))}
        unknown = [line.member_id for line in manual if line.member_id not in known]
        if unknown:
            raise SplitError(f"Unbekannte Person(en) in der Aufteilung: {unknown}")
    lines = build_splits(
        spec.template,
        amount_minor,
        members,
        single_member_id=spec.member_id,
        manual=manual,
    )
    validate(amount_minor, lines)
    return lines


def _require_category(db: Session, household: Household, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None or category.household_id != household.id:
        raise SplitError("Die Kategorie existiert nicht.")
    return category


def create_transaction(
    db: Session,
    household: Household,
    *,
    date: dt.date,
    category_id: int,
    description: str,
    note: str | None,
    amount_minor: int,
    split: SplitSpec,
    recurring_rule_id: int | None = None,
    recurring_occurrence_date: dt.date | None = None,
) -> Transaction:
    category = _require_category(db, household, category_id)
    if not category.is_active:
        raise SplitError(f"Die Kategorie '{category.name}' ist deaktiviert.")
    lines = resolve_split(db, household, amount_minor, split)

    txn = Transaction(
        household_id=household.id,
        date=date,
        category_id=category.id,
        description=description,
        note=note,
        recurring_rule_id=recurring_rule_id,
        recurring_occurrence_date=recurring_occurrence_date,
    )
    db.add(txn)
    db.flush()
    for line in lines:
        db.add(
            TransactionSplit(
                txn_id=txn.id, member_id=line.member_id, amount_minor=line.amount_minor
            )
        )
    db.flush()
    db.refresh(txn)
    return txn


def update_transaction(
    db: Session,
    household: Household,
    txn: Transaction,
    *,
    date: dt.date | None = None,
    category_id: int | None = None,
    description: str | None = None,
    note: str | None = None,
    amount_minor: int | None = None,
    split: SplitSpec | None = None,
) -> Transaction:
    if category_id is not None:
        txn.category_id = _require_category(db, household, category_id).id
    if date is not None:
        txn.date = date
    if description is not None:
        txn.description = description
    if note is not None:
        txn.note = note

    if amount_minor is not None or split is not None:
        target_amount = amount_minor if amount_minor is not None else txn.amount_minor
        if split is None:
            # Nur der Betrag aendert sich: bestehende Verteilung proportional mitziehen.
            from app.services.money import allocate

            existing = sorted(txn.splits, key=lambda s: s.id)
            weights = [abs(s.amount_minor) for s in existing]
            amounts = allocate(target_amount, weights)
            for split_row, value in zip(existing, amounts, strict=True):
                split_row.amount_minor = value
            db.flush()
        else:
            lines = resolve_split(db, household, target_amount, split)
            # Erst leeren, dann neu schreiben -- die Trigger halten die Summe konsistent.
            for row in list(txn.splits):
                db.delete(row)
            db.flush()
            for line in lines:
                db.add(
                    TransactionSplit(
                        txn_id=txn.id, member_id=line.member_id, amount_minor=line.amount_minor
                    )
                )
            db.flush()
        db.expire(txn, ["splits", "amount_minor"])

    db.flush()
    db.refresh(txn)
    return txn
