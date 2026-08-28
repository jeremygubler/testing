"""Auswertungen.

Grundsatz: jede Kennzahl wird aus ``txn``/``txn_split`` berechnet. Es gibt keine
gespeicherten Summen, die auseinanderlaufen koennten.
"""

from __future__ import annotations

import calendar
import datetime as dt
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.enums import AccountKind, CategoryGroup, Flow, SettlementBasis
from app.models import (
    Account,
    Budget,
    Category,
    Household,
    Member,
    RecurringRule,
    SettlementPayment,
    Transaction,
    TransactionSplit,
)
from app.services import accounts
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


def resolve_budgets(
    db: Session, household_id: int, year: int, month: int
) -> dict[int, tuple[int, str]]:
    """Kategorie-ID -> (Budget in Minoreinheiten, Herkunft ``MONTH``/``DEFAULT``).

    Kategorien ohne jeden Budgeteintrag fehlen im Ergebnis -- ``0`` waere eine Aussage,
    "kein Budget gesetzt" ist eine andere.
    """
    rows = db.execute(
        select(
            Budget.category_id, Budget.amount_minor, Budget.is_default, Budget.year, Budget.month
        ).where(
            Budget.household_id == household_id,
            (Budget.is_default.is_(True)) | ((Budget.year == year) & (Budget.month == month)),
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
    #: Der Anteil des Ist, der aus Umbuchungen stammt. Fuers Budget zaehlt er mit,
    #: als Ausgabe gilt er nicht -- die Oberflaeche braucht beide Zahlen.
    transfer_minor: int = 0

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
    #: Was in der Periode auf Sparkonten umgebucht wurde.
    savings_minor: int
    #: Frei verfuegbares Geld auf den dafuer vorgesehenen Konten.
    available_minor: int
    #: Alle Konten zusammen.
    net_worth_minor: int
    savings_ratio: float | None
    fixed_cost_ratio: float | None
    categories: list[CategoryFigure] = field(default_factory=list)
    groups: list[GroupFigure] = field(default_factory=list)
    members: list[MemberFigure] = field(default_factory=list)


def _actuals_by_category(
    db: Session, household_id: int, start: dt.date, end: dt.date, transfers: bool = False
) -> dict[int, int]:
    """Ist je Kategorie.

    ``transfers=False`` laesst Umbuchungen weg -- sie sind weder Einnahme noch Ausgabe,
    sondern nur ein Wechsel des Topfes. ``transfers=True`` liefert genau diese, etwa
    fuer die Sparquote.
    """
    rows = db.execute(
        select(Transaction.category_id, func.coalesce(func.sum(Transaction.amount_minor), 0))
        .where(
            Transaction.household_id == household_id,
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.counter_account_id.is_not(None)
            if transfers
            else Transaction.counter_account_id.is_(None),
        )
        .group_by(Transaction.category_id)
    ).all()
    return dict(rows)


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
            Transaction.counter_account_id.is_(None),
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


def savings_transfers(db: Session, household_id: int, start: dt.date, end: dt.date) -> int:
    """Was in der Periode auf Sparkonten umgebucht wurde.

    Seit Konten und Umbuchungen ist Sparen keine Ausgabe mehr, sondern ein Wechsel
    des Topfes. Die Sparquote misst deshalb nicht mehr die Gruppe SPAREN, sondern das,
    was tatsaechlich auf einem Sparkonto gelandet ist.
    """
    counter = aliased(Account)
    return (
        db.scalar(
            select(func.coalesce(func.sum(Transaction.amount_minor), 0))
            .join(counter, counter.id == Transaction.counter_account_id)
            .where(
                Transaction.household_id == household_id,
                Transaction.date >= start,
                Transaction.date <= end,
                counter.kind == AccountKind.SAVINGS,
            )
        )
        or 0
    )


def cumulative_balance(db: Session, household_id: int, until: dt.date) -> int:
    """Summe aller Einnahmen minus Ausgaben bis einschliesslich ``until``.

    Ohne Umbuchungen: die verschieben Geld zwischen Konten, veraendern aber nicht,
    wie viel der Haushalt insgesamt hat.
    """
    rows = db.execute(
        select(Category.flow, func.coalesce(func.sum(Transaction.amount_minor), 0))
        .join(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.household_id == household_id,
            Transaction.date <= until,
            Transaction.counter_account_id.is_(None),
        )
        .group_by(Category.flow)
    ).all()
    totals = dict(rows)
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
    # Eine Umbuchung ist keine Ausgabe -- aber sie ist sehr wohl das, was auf der
    # Kategorie passiert ist. Wer 1'400 aufs Sparkonto budgetiert, will sehen, ob er
    # 1'400 umgebucht hat. Deshalb zaehlen Umbuchungen ins Ist der Kategorie, aber
    # nicht in Einnahmen, Ausgaben und Saldo.
    transfer_actuals = _actuals_by_category(db, household.id, start, end, transfers=True)
    budgets = resolve_budgets(db, household.id, year, month)

    figures: list[CategoryFigure] = []
    groups: dict[CategoryGroup, GroupFigure] = {
        group: GroupFigure(group=group) for group in CategoryGroup
    }
    flow_by_group: dict[CategoryGroup, int] = dict.fromkeys(CategoryGroup, 0)

    for category in categories:
        flow_actual = actuals.get(category.id, 0)
        transfer_actual = transfer_actuals.get(category.id, 0)
        actual = flow_actual + transfer_actual
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
            transfer_minor=transfer_actual,
        )
        figures.append(figure)

        group_figure = groups[category.group]
        group_figure.actual_minor += actual
        flow_by_group[category.group] += flow_actual
        if budget:
            group_figure.budget_minor += budget[0]
            group_figure.has_budget = True

    income = flow_by_group[CategoryGroup.EINKOMMEN]
    expense = sum(
        total for group, total in flow_by_group.items() if group is not CategoryGroup.EINKOMMEN
    )
    fixed = flow_by_group[CategoryGroup.FIXKOSTEN]

    # Sparen mindert den Saldo nicht mehr: das Geld hat nur das Konto gewechselt.
    savings = savings_transfers(db, household.id, start, end)
    balance = income - expense

    member_figures = _actuals_by_member(db, household.id, start, end)
    members = list(
        db.scalars(
            select(Member)
            .where(Member.household_id == household.id)
            .order_by(Member.sort_order, Member.id)
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
        savings_minor=savings,
        available_minor=accounts.available(db, household, end),
        net_worth_minor=accounts.net_worth(db, household, end),
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
    #: Empfehlungen fuer das, was noch offen ist.
    payments: list[Payment]
    #: Bereits festgehaltene Zahlungen der Periode.
    recorded: list[SettlementPayment]


def settlement_for_period(
    db: Session, household: Household, start: dt.date, end: dt.date
) -> SettlementResult:
    """Wer hat mehr getragen als sein Anteil -- und wie gleicht man das aus?"""
    rows = db.execute(
        select(
            TransactionSplit.member_id, func.coalesce(func.sum(TransactionSplit.amount_minor), 0)
        )
        .join(Transaction, Transaction.id == TransactionSplit.txn_id)
        .join(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.household_id == household.id,
            Transaction.date >= start,
            Transaction.date <= end,
            Category.flow == Flow.EXPENSE,
            # Umbuchungen sind keine getragenen Ausgaben -- niemand hat dabei etwas
            # fuer die anderen ausgelegt, das Geld liegt weiter im Haushalt.
            Transaction.counter_account_id.is_(None),
        )
        .group_by(TransactionSplit.member_id)
    ).all()
    borne = dict(rows)

    members = list(
        db.scalars(
            select(Member)
            .where(Member.household_id == household.id, Member.is_active.is_(True))
            .order_by(Member.sort_order, Member.id)
        )
    )

    if household.settlement_basis is SettlementBasis.INCOME:
        income_rows = db.execute(
            select(
                TransactionSplit.member_id,
                func.coalesce(func.sum(TransactionSplit.amount_minor), 0),
            )
            .join(Transaction, Transaction.id == TransactionSplit.txn_id)
            .join(Category, Category.id == Transaction.category_id)
            .where(
                Transaction.household_id == household.id,
                Transaction.date >= start,
                Transaction.date <= end,
                Category.flow == Flow.INCOME,
                Transaction.counter_account_id.is_(None),
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

    # Bereits geleistete Ausgleichszahlungen der Periode. Wer erhalten hat, ist
    # entschaedigt; wer gezahlt hat, hat getilgt.
    recorded = list(
        db.scalars(
            select(SettlementPayment)
            .where(
                SettlementPayment.household_id == household.id,
                SettlementPayment.period_year.is_not(None),
                (SettlementPayment.period_year * 12 + SettlementPayment.period_month)
                >= (start.year * 12 + start.month),
                (SettlementPayment.period_year * 12 + SettlementPayment.period_month)
                <= (end.year * 12 + end.month),
            )
            .order_by(SettlementPayment.date, SettlementPayment.id)
        )
    )
    settled: dict[int, int] = {}
    for payment in recorded:
        settled[payment.to_member_id] = settled.get(payment.to_member_id, 0) + payment.amount_minor
        settled[payment.from_member_id] = (
            settled.get(payment.from_member_id, 0) - payment.amount_minor
        )

    balances = compute_balances(borne, weights, settled)
    return SettlementResult(
        basis=household.settlement_basis,
        total_expense_minor=sum(borne.values()),
        balances=balances,
        payments=settle(balances),
        recorded=recorded,
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
    #: Startsaldo plus kumulierter Saldo bis einschliesslich dieses Monats.
    available_minor: int = 0
    #: Ob in diesem Monat ueberhaupt gebucht wurde. Ein Monat ohne Daten ist kein
    #: Monat ohne Ausgaben -- die Oberflaeche laesst ihn weg statt ihn als Null zu zeichnen.
    has_data: bool = False


def trend(
    db: Session, household: Household, year: int, month: int, months: int
) -> list[TrendPoint]:
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
            Transaction.counter_account_id.is_(None),
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
        del group

    ordered = [points[key] for key in sorted(points)]

    # Umbuchungen auf Sparkonten je Monat -- seit Konten ist Sparen keine Ausgabe mehr.
    counter = aliased(Account)
    for month_key, total in db.execute(
        select(
            func.strftime("%Y-%m", Transaction.date),
            func.coalesce(func.sum(Transaction.amount_minor), 0),
        )
        .join(counter, counter.id == Transaction.counter_account_id)
        .where(
            Transaction.household_id == household.id,
            Transaction.date >= start,
            Transaction.date <= end,
            counter.kind == AccountKind.SAVINGS,
        )
        .group_by(func.strftime("%Y-%m", Transaction.date))
    ).all():
        year_text, month_text = month_key.split("-")
        point = points.get(int(year_text) * 12 + (int(month_text) - 1))
        if point is not None:
            point.savings_minor += total

    for point in ordered:
        point.balance_minor = point.income_minor - point.expense_minor
        point.has_data = (
            point.income_minor != 0 or point.expense_minor != 0 or point.savings_minor != 0
        )
        # Bewusst je Monat neu gerechnet statt den Saldo aufzuaddieren: der Saldo kennt
        # weder Umbuchungen noch Buchungen auf Konten, die nicht zum verfuegbaren Geld
        # zaehlen. Aufsummiert liefe die Linie von der Kennzahl auf der Uebersicht weg.
        point.available_minor = accounts.available(
            db, household, month_bounds(point.year, point.month)[1]
        )

    return ordered


# ------------------------------------------------------------------------ Prognose


@dataclass(slots=True)
class Forecast:
    year: int
    month: int
    #: Erwartete, aber noch nicht bestaetigte Buchungen aus wiederkehrenden Regeln.
    expected_income_minor: int
    expected_expense_minor: int
    open_count: int
    #: Saldo und Kontostand, wenn alle offenen Vorschlaege bestaetigt wuerden.
    projected_balance_minor: int
    projected_available_minor: int


def forecast(db: Session, household: Household, year: int, month: int) -> Forecast:
    """Wie der Monat endet, wenn die erwarteten Buchungen noch kommen.

    Das ist die Zahl, die man wirklich wissen will: nicht was bisher passiert ist,
    sondern was am Monatsende dasteht. Gerechnet wird nur mit **offenen** Vorschlaegen --
    bestaetigte sind ja schon im Ist enthalten, uebersprungene kommen nicht mehr.
    """
    from app.services.recurring import OPEN, occurrences_for_period

    start, end = month_bounds(year, month)
    summary_income = 0
    summary_expense = 0
    open_count = 0

    rules = {
        rule.id: rule
        for rule in db.scalars(
            select(RecurringRule).where(RecurringRule.household_id == household.id)
        )
    }
    for entry in occurrences_for_period(db, household.id, start, end):
        if entry.status != OPEN:
            continue
        rule = rules.get(entry.rule_id)
        if rule is None:
            continue
        open_count += 1
        if rule.category.flow == Flow.INCOME:
            summary_income += rule.amount_minor
        else:
            summary_expense += rule.amount_minor

    current = month_summary(db, household, year, month)
    expected_net = summary_income - summary_expense
    return Forecast(
        year=year,
        month=month,
        expected_income_minor=summary_income,
        expected_expense_minor=summary_expense,
        open_count=open_count,
        projected_balance_minor=current.balance_minor + expected_net,
        projected_available_minor=current.available_minor + expected_net,
    )


# ----------------------------------------------------------------------- Vergleich


@dataclass(slots=True)
class CategoryComparison:
    category_id: int
    name: str
    group: CategoryGroup
    flow: Flow
    actual_minor: int
    average_minor: int
    delta_minor: int
    #: Abweichung als Verhaeltnis, oder ``None`` wenn es keinen Schnitt gibt.
    delta_ratio: float | None
    based_on_months: int


def comparison(
    db: Session, household: Household, year: int, month: int, months: int = 6
) -> list[CategoryComparison]:
    """Ist des Monats gegen den Schnitt der abgeschlossenen Vormonate.

    Wie beim Budgetvorschlag wird durch die Monate geteilt, in denen tatsaechlich
    gebucht wurde -- nicht durch die Fensterbreite.
    """
    end_index = year * 12 + (month - 1) - 1
    start_index = end_index - (months - 1)
    start = dt.date(start_index // 12, start_index % 12 + 1, 1)
    end_year, end_month = end_index // 12, end_index % 12 + 1
    end = dt.date(end_year, end_month, calendar.monthrange(end_year, end_month)[1])

    history = dict(
        db.execute(
            select(Transaction.category_id, func.coalesce(func.sum(Transaction.amount_minor), 0))
            .where(
                Transaction.household_id == household.id,
                Transaction.date >= start,
                Transaction.date <= end,
            )
            .group_by(Transaction.category_id)
        ).all()
    )
    recorded = (
        db.scalar(
            select(func.count(func.distinct(func.strftime("%Y-%m", Transaction.date)))).where(
                Transaction.household_id == household.id,
                Transaction.date >= start,
                Transaction.date <= end,
            )
        )
        or 0
    )
    divisor = max(1, min(months, recorded))

    current_start, current_end = month_bounds(year, month)
    # Umbuchungen zaehlen mit -- sonst verglichen wir den Monat ohne sie gegen einen
    # Schnitt mit ihnen und meldeten jede Sparkategorie als Einbruch.
    actuals = _actuals_by_category(db, household.id, current_start, current_end)
    for category_id, total in _actuals_by_category(
        db, household.id, current_start, current_end, transfers=True
    ).items():
        actuals[category_id] = actuals.get(category_id, 0) + total

    result: list[CategoryComparison] = []
    for category in db.scalars(
        select(Category)
        .where(Category.household_id == household.id)
        .order_by(Category.sort_order, Category.id)
    ):
        actual = actuals.get(category.id, 0)
        average = round(history.get(category.id, 0) / divisor)
        if actual == 0 and average == 0:
            continue
        result.append(
            CategoryComparison(
                category_id=category.id,
                name=category.name,
                group=category.group,
                flow=category.flow,
                actual_minor=actual,
                average_minor=average,
                delta_minor=actual - average,
                delta_ratio=ratio(actual - average, average) if average else None,
                based_on_months=recorded if recorded else 0,
            )
        )
    return result


# ------------------------------------------------------------------------ Jahr


@dataclass(slots=True)
class YearSummary:
    year: int
    months: list[TrendPoint]
    income_minor: int
    expense_minor: int
    balance_minor: int
    savings_minor: int
    savings_ratio: float | None
    fixed_cost_ratio: float | None
    groups: list[GroupFigure]
    categories: list[CategoryFigure]


def year_summary(db: Session, household: Household, year: int) -> YearSummary:
    """Zwoelf Monate am Stueck -- der Jahresabschluss des Haushalts."""
    months = trend(db, household, year, 12, 12)

    start = dt.date(year, 1, 1)
    end = dt.date(year, 12, 31)
    actuals = _actuals_by_category(db, household.id, start, end)
    # Wie im Monat: Umbuchungen zaehlen ins Ist der Kategorie, nicht in die Ausgaben.
    transfer_actuals = _actuals_by_category(db, household.id, start, end, transfers=True)

    groups: dict[CategoryGroup, GroupFigure] = {
        group: GroupFigure(group=group) for group in CategoryGroup
    }
    flow_by_group: dict[CategoryGroup, int] = dict.fromkeys(CategoryGroup, 0)
    figures: list[CategoryFigure] = []
    for category in db.scalars(
        select(Category)
        .where(Category.household_id == household.id)
        .order_by(Category.sort_order, Category.id)
    ):
        flow_actual = actuals.get(category.id, 0)
        transfer_actual = transfer_actuals.get(category.id, 0)
        actual = flow_actual + transfer_actual
        if actual == 0 and not category.is_active:
            continue
        figures.append(
            CategoryFigure(
                category_id=category.id,
                name=category.name,
                group=category.group,
                flow=category.flow,
                color=category.color,
                actual_minor=actual,
                budget_minor=None,
                budget_source=None,
                transfer_minor=transfer_actual,
            )
        )
        groups[category.group].actual_minor += actual
        flow_by_group[category.group] += flow_actual

    income = flow_by_group[CategoryGroup.EINKOMMEN]
    expense = sum(
        total for group, total in flow_by_group.items() if group is not CategoryGroup.EINKOMMEN
    )
    savings = savings_transfers(db, household.id, start, end)
    fixed = flow_by_group[CategoryGroup.FIXKOSTEN]

    return YearSummary(
        year=year,
        months=months,
        income_minor=income,
        expense_minor=expense,
        balance_minor=income - expense,
        savings_minor=savings,
        savings_ratio=ratio(savings, income),
        fixed_cost_ratio=ratio(fixed, income),
        groups=[groups[group] for group in CategoryGroup],
        categories=figures,
    )
