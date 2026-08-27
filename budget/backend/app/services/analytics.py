"""Auswertungen.

Grundsatz: jede Kennzahl wird aus ``txn``/``txn_split`` berechnet. Es gibt keine
gespeicherten Summen, die auseinanderlaufen koennten.
"""

from __future__ import annotations

import calendar
import datetime as dt
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.enums import CategoryGroup, Flow, SettlementBasis
from app.models import Budget, Category, Household, Member, Transaction, TransactionSplit
from app.services.settlement import MemberBalance, Payment, compute_balances, settle


def month_bounds(year: int, month: int) -> tuple[dt.date, dt.date]:
    last = calendar.monthrange(year, month)[1]
    return dt.date(year, month, 1), dt.date(year, month, last)


def ratio(part: int, whole: int) -> float | None:
    """Verhaeltnis oder ``None``. Ein fehlender Nenner ist nicht dasselbe wie 0 %."""
    if whole == 0:
        return None
    return part / whole


# --------------------------------------------------------------------------- Budgets


def resolve_budgets(db: Session, household_id: int, year: int, month: int) -> dict[int, tuple[int, str]]:
    """Kategorie-ID -> (Budget in Minoreinheiten, Herkunft ``MONTH``/``DEFAULT``).

    Kategorien ohne jeden Budgeteintrag fehlen im Ergebnis -- ``0`` waere eine Aussage,
    "kein Budget gesetzt" ist eine andere.
    """
    rows = db.execute(
        select(Budget.category_id, Budget.amount_minor, Budget.is_default, Budget.year, Budget.month)
        .where(
            Budget.household_id == household_id,
            (Budget.is_default.is_(True))
            | ((Budget.year == year) & (Budget.month == month)),
        )
    ).all()

    result: dict[int, tuple[int, str]] = {}
    for category_id, amount_minor, is_default, _year, _month in rows:
        if is_default:
            result.setdefault(category_id, (amount_minor, "DEFAULT"))
        else:
            result[category_id] = (amount_minor, "MONTH")
    return result


# ------------------------------------------------------------------------- Kennzahlen


@dataclass(slots=True)
class CategoryFigure:
    category_id: int
    name: str
    group: CategoryGroup
    flow: Flow
    color: str
    actual_minor: int
    budget_minor: int | None
    budget_source: str | None

    @property
    def difference_minor(self) -> int | None:
        if self.budget_minor is None:
            return None
        return self.budget_minor - self.actual_minor

    @property
    def usage(self) -> float | None:
        return ratio(self.actual_minor, self.budget_minor) if self.budget_minor else None


@dataclass(slots=True)
class GroupFigure:
    group: CategoryGroup
    actual_minor: int = 0
    budget_minor: int = 0
    has_budget: bool = False


@dataclass(slots=True)
class MemberFigure:
    member_id: int
    income_minor: int = 0
    expense_minor: int = 0

    @property
    def balance_minor(self) -> int:
        return self.income_minor - self.expense_minor


@dataclass(slots=True)
class MonthSummary:
    year: int
    month: int
    income_minor: int
    expense_minor: int
    balance_minor: int
    balance_excl_savings_minor: int
    available_minor: int
    savings_ratio: float | None
    fixed_cost_ratio: float | None
    categories: list[CategoryFigure] = field(default_factory=list)
    groups: list[GroupFigure] = field(default_factory=list)
    members: list[MemberFigure] = field(default_factory=list)


def _actuals_by_category(
    db: Session, household_id: int, start: dt.date, end: dt.date
) -> dict[int, int]:
    rows = db.execute(
        select(Transaction.category_id, func.coalesce(func.sum(Transaction.amount_minor), 0))
        .where(
            Transaction.household_id == household_id,
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .group_by(Transaction.category_id)
    ).all()
    return {category_id: total for category_id, total in rows}


def _actuals_by_member(
    db: Session, household_id: int, start: dt.date, end: dt.date
) -> dict[int, MemberFigure]:
    rows = db.execute(
        select(
            TransactionSplit.member_id,
            Category.flow,
            func.coalesce(func.sum(TransactionSplit.amount_minor), 0),
        )
        .join(Transaction, Transaction.id == TransactionSplit.txn_id)
        .join(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.household_id == household_id,
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .group_by(TransactionSplit.member_id, Category.flow)
    ).all()

    figures: dict[int, MemberFigure] = {}
    for member_id, flow, total in rows:
        figure = figures.setdefault(member_id, MemberFigure(member_id=member_id))
        if flow == Flow.INCOME:
            figure.income_minor += total
        else:
            figure.expense_minor += total
    return figures


def cumulative_balance(db: Session, household_id: int, until: dt.date) -> int:
    """Summe aller Einnahmen minus Ausgaben bis einschliesslich ``until``."""
    rows = db.execute(
        select(Category.flow, func.coalesce(func.sum(Transaction.amount_minor), 0))
        .join(Category, Category.id == Transaction.category_id)
        .where(Transaction.household_id == household_id, Transaction.date <= until)
        .group_by(Category.flow)
    ).all()
    totals = {flow: total for flow, total in rows}
    return totals.get(Flow.INCOME, 0) - totals.get(Flow.EXPENSE, 0)


def month_summary(db: Session, household: Household, year: int, month: int) -> MonthSummary:
    start, end = month_bounds(year, month)

    categories = list(
        db.scalars(
            select(Category)
            .where(Category.household_id == household.id)
            .order_by(Category.sort_order, Category.id)
        )
    )
    actuals = _actuals_by_category(db, household.id, start, end)
    budgets = resolve_budgets(db, household.id, year, month)

    figures: list[CategoryFigure] = []
    groups: dict[CategoryGroup, GroupFigure] = {
        group: GroupFigure(group=group) for group in CategoryGroup
    }

    for category in categories:
        actual = actuals.get(category.id, 0)
        budget = budgets.get(category.id)
        if not category.is_active and actual == 0 and budget is None:
            continue  # deaktivierte Kategorien ohne Bezug zu diesem Monat weglassen
        figure = CategoryFigure(
            category_id=category.id,
            name=category.name,
            group=category.group,
            flow=category.flow,
            color=category.color,
            actual_minor=actual,
            budget_minor=budget[0] if budget else None,
            budget_source=budget[1] if budget else None,
        )
        figures.append(figure)

        group_figure = groups[category.group]
        group_figure.actual_minor += actual
        if budget:
            group_figure.budget_minor += budget[0]
            group_figure.has_budget = True

    income = groups[CategoryGroup.EINKOMMEN].actual_minor
    expense = sum(
        figure.actual_minor for group, figure in groups.items() if group is not CategoryGroup.EINKOMMEN
    )
    savings = groups[CategoryGroup.SPAREN].actual_minor
    fixed = groups[CategoryGroup.FIXKOSTEN].actual_minor

    balance = income - expense
    available = household.opening_balance_minor + cumulative_balance(db, household.id, end)

    member_figures = _actuals_by_member(db, household.id, start, end)
    members = list(
        db.scalars(
            select(Member).where(Member.household_id == household.id).order_by(Member.sort_order, Member.id)
        )
    )
    ordered_members = [
        member_figures.get(member.id, MemberFigure(member_id=member.id))
        for member in members
        if member.is_active or member.id in member_figures
    ]

    return MonthSummary(
        year=year,
        month=month,
        income_minor=income,
        expense_minor=expense,
        balance_minor=balance,
        # Sparen ist buchhalterisch eine Ausgabe, aber kein Verlust. Beide Zahlen zeigen.
        balance_excl_savings_minor=balance + savings,
        available_minor=available,
        savings_ratio=ratio(savings, income),
        fixed_cost_ratio=ratio(fixed, income),
        categories=figures,
        groups=[groups[group] for group in CategoryGroup],
        members=ordered_members,
    )


# --------------------------------------------------------------------------- Ausgleich


@dataclass(slots=True)
class SettlementResult:
    basis: SettlementBasis
    total_expense_minor: int
    balances: list[MemberBalance]
    payments: list[Payment]


def settlement_for_period(
    db: Session, household: Household, start: dt.date, end: dt.date
) -> SettlementResult:
    """Wer hat mehr getragen als sein Anteil -- und wie gleicht man das aus?"""
    rows = db.execute(
        select(TransactionSplit.member_id, func.coalesce(func.sum(TransactionSplit.amount_minor), 0))
        .join(Transaction, Transaction.id == TransactionSplit.txn_id)
        .join(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.household_id == household.id,
            Transaction.date >= start,
            Transaction.date <= end,
            Category.flow == Flow.EXPENSE,
        )
        .group_by(TransactionSplit.member_id)
    ).all()
    borne = {member_id: total for member_id, total in rows}

    members = list(
        db.scalars(
            select(Member)
            .where(Member.household_id == household.id, Member.is_active.is_(True))
            .order_by(Member.sort_order, Member.id)
        )
    )

    if household.settlement_basis is SettlementBasis.INCOME:
        income_rows = db.execute(
            select(TransactionSplit.member_id, func.coalesce(func.sum(TransactionSplit.amount_minor), 0))
            .join(Transaction, Transaction.id == TransactionSplit.txn_id)
            .join(Category, Category.id == Transaction.category_id)
            .where(
                Transaction.household_id == household.id,
                Transaction.date >= start,
                Transaction.date <= end,
                Category.flow == Flow.INCOME,
            )
            .group_by(TransactionSplit.member_id)
        ).all()
        income = {member_id: max(0, total) for member_id, total in income_rows}
        weights = {member.id: income.get(member.id, 0) for member in members}
        if sum(weights.values()) == 0:
            # Kein Einkommen in der Periode erfasst -> auf den Schluessel zurueckfallen,
            # statt eine Verteilung zu erfinden.
            weights = {member.id: member.share_weight for member in members}
    else:
        weights = {member.id: member.share_weight for member in members}

    balances = compute_balances(borne, weights)
    return SettlementResult(
        basis=household.settlement_basis,
        total_expense_minor=sum(borne.values()),
        balances=balances,
        payments=settle(balances),
    )


# ------------------------------------------------------------------------------ Trend


@dataclass(slots=True)
class TrendPoint:
    year: int
    month: int
    income_minor: int
    expense_minor: int
    balance_minor: int
    savings_minor: int


def trend(db: Session, household: Household, year: int, month: int, months: int) -> list[TrendPoint]:
    """Die letzten ``months`` Monate bis einschliesslich ``(year, month)``."""
    index = year * 12 + (month - 1)
    first_index = index - (months - 1)
    start = dt.date(first_index // 12, first_index % 12 + 1, 1)
    _, end = month_bounds(year, month)

    rows = db.execute(
        select(
            func.strftime("%Y", Transaction.date),
            func.strftime("%m", Transaction.date),
            Category.flow,
            Category.group,
            func.coalesce(func.sum(Transaction.amount_minor), 0),
        )
        .join(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.household_id == household.id,
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .group_by(
            func.strftime("%Y", Transaction.date),
            func.strftime("%m", Transaction.date),
            Category.flow,
            Category.group,
        )
    ).all()

    points = {
        first_index + offset: TrendPoint(
            year=(first_index + offset) // 12,
            month=(first_index + offset) % 12 + 1,
            income_minor=0,
            expense_minor=0,
            balance_minor=0,
            savings_minor=0,
        )
        for offset in range(months)
    }

    for year_text, month_text, flow, group, total in rows:
        key = int(year_text) * 12 + (int(month_text) - 1)
        point = points.get(key)
        if point is None:
            continue
        if flow == Flow.INCOME:
            point.income_minor += total
        else:
            point.expense_minor += total
            if group == CategoryGroup.SPAREN:
                point.savings_minor += total

    for point in points.values():
        point.balance_minor = point.income_minor - point.expense_minor

    return [points[key] for key in sorted(points)]
