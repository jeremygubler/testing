"""Anlegen und Aendern von Buchungen samt ihrer Aufteilung."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, Category, Household, Member, Transaction, TransactionSplit
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
        known = {
            m.id for m in db.scalars(select(Member).where(Member.household_id == household.id))
        }
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


def default_account(db: Session, household_id: int) -> Account | None:
    return db.scalar(
        select(Account)
        .where(Account.household_id == household_id, Account.is_active.is_(True))
        .order_by(Account.sort_order, Account.id)
        .limit(1)
    )


def _require_account(db: Session, household: Household, account_id: int) -> Account:
    account = db.get(Account, account_id)
    if account is None or account.household_id != household.id:
        raise SplitError("Das Konto existiert nicht.")
    return account


def _resolve_accounts(
    db: Session,
    household: Household,
    account_id: int | None,
    counter_account_id: int | None,
) -> tuple[int, int | None]:
    if account_id is None:
        account = default_account(db, household.id)
        if account is None:
            raise SplitError("Der Haushalt hat kein aktives Konto.")
    else:
        account = _require_account(db, household, account_id)
        if not account.is_active:
            raise SplitError(f"Das Konto '{account.name}' ist deaktiviert.")

    if counter_account_id is None:
        return account.id, None

    counter = _require_account(db, household, counter_account_id)
    if counter.id == account.id:
        raise SplitError("Eine Umbuchung braucht zwei verschiedene Konten.")
    if not counter.is_active:
        raise SplitError(f"Das Konto '{counter.name}' ist deaktiviert.")
    return account.id, counter.id


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
    account_id: int | None = None,
    counter_account_id: int | None = None,
    recurring_rule_id: int | None = None,
    recurring_occurrence_date: dt.date | None = None,
) -> Transaction:
    category = _require_category(db, household, category_id)
    if not category.is_active:
        raise SplitError(f"Die Kategorie '{category.name}' ist deaktiviert.")
    resolved_account, resolved_counter = _resolve_accounts(
        db, household, account_id, counter_account_id
    )
    lines = resolve_split(db, household, amount_minor, split)

    txn = Transaction(
        household_id=household.id,
        date=date,
        category_id=category.id,
        account_id=resolved_account,
        counter_account_id=resolved_counter,
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
    account_id: int | None = None,
    counter_account_id: int | None = None,
    counter_account_set: bool = False,
) -> Transaction:
    if category_id is not None:
        txn.category_id = _require_category(db, household, category_id).id
    if account_id is not None or counter_account_set:
        txn.account_id, txn.counter_account_id = _resolve_accounts(
            db,
            household,
            account_id if account_id is not None else txn.account_id,
            counter_account_id if counter_account_set else txn.counter_account_id,
        )
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
