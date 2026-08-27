"""Kontostaende.

Der Kontostand eines Kontos ist sein Startsaldo plus alles, was darauf zugeflossen,
minus alles, was davon abgeflossen ist -- Umbuchungen eingerechnet, weil sie ein Konto
belasten und ein anderes speisen.

Wie ueberall in diesem Projekt wird nichts gespeichert, was sich berechnen laesst.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.enums import Flow
from app.models import Account, Category, Household, Transaction


@dataclass(slots=True)
class AccountBalance:
    account_id: int
    name: str
    kind: str
    color: str
    include_in_available: bool
    is_active: bool
    opening_balance_minor: int
    #: Einnahmen minus Ausgaben auf diesem Konto, ohne Umbuchungen.
    flow_minor: int
    #: Zugefuehrt minus abgefuehrt durch Umbuchungen.
    transfer_minor: int

    @property
    def balance_minor(self) -> int:
        return self.opening_balance_minor + self.flow_minor + self.transfer_minor


def balances(
    db: Session, household: Household, until: dt.date | None = None
) -> list[AccountBalance]:
    """Kontostaende aller Konten, wahlweise zu einem Stichtag."""
    accounts = list(
        db.scalars(
            select(Account)
            .where(Account.household_id == household.id)
            .order_by(Account.sort_order, Account.id)
        )
    )
    if not accounts:
        return []

    conditions = [Transaction.household_id == household.id]
    if until is not None:
        conditions.append(Transaction.date <= until)

    # Einnahmen und Ausgaben je Konto -- Umbuchungen bleiben aussen vor, sie sind
    # weder das eine noch das andere.
    flow_rows = db.execute(
        select(
            Transaction.account_id,
            Category.flow,
            func.coalesce(func.sum(Transaction.amount_minor), 0),
        )
        .join(Category, Category.id == Transaction.category_id)
        .where(*conditions, Transaction.counter_account_id.is_(None))
        .group_by(Transaction.account_id, Category.flow)
    ).all()
    flow: dict[int, int] = {}
    for account_id, direction, total in flow_rows:
        sign = 1 if direction == Flow.INCOME else -1
        flow[account_id] = flow.get(account_id, 0) + sign * total

    # Umbuchungen belasten das Quellkonto und speisen das Zielkonto.
    out_rows = db.execute(
        select(Transaction.account_id, func.coalesce(func.sum(Transaction.amount_minor), 0))
        .where(*conditions, Transaction.counter_account_id.is_not(None))
        .group_by(Transaction.account_id)
    ).all()
    in_rows = db.execute(
        select(
            Transaction.counter_account_id,
            func.coalesce(func.sum(Transaction.amount_minor), 0),
        )
        .where(*conditions, Transaction.counter_account_id.is_not(None))
        .group_by(Transaction.counter_account_id)
    ).all()
    transfer: dict[int, int] = {}
    for account_id, total in out_rows:
        transfer[account_id] = transfer.get(account_id, 0) - total
    for account_id, total in in_rows:
        transfer[account_id] = transfer.get(account_id, 0) + total

    return [
        AccountBalance(
            account_id=account.id,
            name=account.name,
            kind=account.kind.value if hasattr(account.kind, "value") else str(account.kind),
            color=account.color,
            include_in_available=account.include_in_available,
            is_active=account.is_active,
            opening_balance_minor=account.opening_balance_minor,
            flow_minor=flow.get(account.id, 0),
            transfer_minor=transfer.get(account.id, 0),
        )
        for account in accounts
    ]


def available(db: Session, household: Household, until: dt.date | None = None) -> int:
    """Frei verfuegbares Geld: die Summe der Konten, die dafuer vorgesehen sind.

    Ein Sparkonto ist Vermoegen, aber typischerweise nicht das, was diesen Monat
    ausgegeben werden soll -- deshalb ist das je Konto einstellbar.
    """
    return sum(
        row.balance_minor for row in balances(db, household, until) if row.include_in_available
    )


def net_worth(db: Session, household: Household, until: dt.date | None = None) -> int:
    """Alle Konten zusammen."""
    return sum(row.balance_minor for row in balances(db, household, until))
