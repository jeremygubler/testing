import datetime as dt

from fastapi import APIRouter, Query

from app.deps import CurrentHousehold, DbSession
from app.schemas import (
    AccountBalanceRead,
    CategoryComparisonRead,
    CategoryFigureRead,
    ForecastRead,
    GroupFigureRead,
    MemberBalanceRead,
    MemberFigureRead,
    MonthSummaryRead,
    PaymentRead,
    SettlementPaymentRead,
    SettlementRead,
    TrendPointRead,
    YearSummaryRead,
)
from app.services import accounts as account_service
from app.services import analytics

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary", response_model=MonthSummaryRead)
def summary(
    household: CurrentHousehold,
    db: DbSession,
    year: int = Query(ge=1900, le=2200),
    month: int = Query(ge=1, le=12),
) -> MonthSummaryRead:
    result = analytics.month_summary(db, household, year, month)
    return MonthSummaryRead(
        year=result.year,
        month=result.month,
        income_minor=result.income_minor,
        expense_minor=result.expense_minor,
        balance_minor=result.balance_minor,
        savings_minor=result.savings_minor,
        available_minor=result.available_minor,
        net_worth_minor=result.net_worth_minor,
        savings_ratio=result.savings_ratio,
        fixed_cost_ratio=result.fixed_cost_ratio,
        accounts=[
            AccountBalanceRead(
                account_id=row.account_id,
                name=row.name,
                kind=row.kind,
                color=row.color,
                include_in_available=row.include_in_available,
                is_active=row.is_active,
                opening_balance_minor=row.opening_balance_minor,
                flow_minor=row.flow_minor,
                transfer_minor=row.transfer_minor,
                balance_minor=row.balance_minor,
            )
            for row in account_service.balances(
                db, household, analytics.month_bounds(year, month)[1]
            )
        ],
        categories=[
            CategoryFigureRead(
                category_id=figure.category_id,
                name=figure.name,
                group=figure.group,
                flow=figure.flow,
                color=figure.color,
                actual_minor=figure.actual_minor,
                budget_minor=figure.budget_minor,
                budget_source=figure.budget_source,
                transfer_minor=figure.transfer_minor,
                difference_minor=figure.difference_minor,
                usage=figure.usage,
            )
            for figure in result.categories
        ],
        groups=[
            GroupFigureRead(
                group=group.group,
                actual_minor=group.actual_minor,
                budget_minor=group.budget_minor,
                has_budget=group.has_budget,
            )
            for group in result.groups
        ],
        members=[
            MemberFigureRead(
                member_id=member.member_id,
                income_minor=member.income_minor,
                expense_minor=member.expense_minor,
                balance_minor=member.balance_minor,
            )
            for member in result.members
        ],
    )


@router.get("/settlement", response_model=SettlementRead)
def settlement(
    household: CurrentHousehold,
    db: DbSession,
    year: int = Query(ge=1900, le=2200),
    month: int = Query(ge=1, le=12),
    months: int = Query(default=1, ge=1, le=60, description="Anzahl Monate rueckwaerts"),
) -> SettlementRead:
    _, end = analytics.month_bounds(year, month)
    first_index = year * 12 + (month - 1) - (months - 1)
    start = dt.date(first_index // 12, first_index % 12 + 1, 1)

    result = analytics.settlement_for_period(db, household, start, end)
    return SettlementRead(
        basis=result.basis,
        total_expense_minor=result.total_expense_minor,
        balances=[
            MemberBalanceRead(
                member_id=balance.member_id,
                borne_minor=balance.borne_minor,
                share_minor=balance.share_minor,
                settled_minor=balance.settled_minor,
                gross_balance_minor=balance.gross_balance_minor,
                balance_minor=balance.balance_minor,
            )
            for balance in result.balances
        ],
        payments=[
            PaymentRead(
                from_member_id=payment.from_member_id,
                to_member_id=payment.to_member_id,
                amount_minor=payment.amount_minor,
            )
            for payment in result.payments
        ],
        recorded=[SettlementPaymentRead.model_validate(row) for row in result.recorded],
    )


@router.get("/trend", response_model=list[TrendPointRead])
def trend(
    household: CurrentHousehold,
    db: DbSession,
    year: int = Query(ge=1900, le=2200),
    month: int = Query(ge=1, le=12),
    months: int = Query(default=6, ge=1, le=36),
) -> list[TrendPointRead]:
    return [
        TrendPointRead(
            year=point.year,
            month=point.month,
            income_minor=point.income_minor,
            expense_minor=point.expense_minor,
            balance_minor=point.balance_minor,
            savings_minor=point.savings_minor,
            available_minor=point.available_minor,
            has_data=point.has_data,
        )
        for point in analytics.trend(db, household, year, month, months)
    ]


@router.get("/forecast", response_model=ForecastRead)
def forecast(
    household: CurrentHousehold,
    db: DbSession,
    year: int = Query(ge=1900, le=2200),
    month: int = Query(ge=1, le=12),
) -> ForecastRead:
    """Wie der Monat endet, wenn die offenen Vorschlaege noch bestaetigt werden."""
    result = analytics.forecast(db, household, year, month)
    return ForecastRead(
        year=result.year,
        month=result.month,
        expected_income_minor=result.expected_income_minor,
        expected_expense_minor=result.expected_expense_minor,
        open_count=result.open_count,
        projected_balance_minor=result.projected_balance_minor,
        projected_available_minor=result.projected_available_minor,
    )


@router.get("/comparison", response_model=list[CategoryComparisonRead])
def comparison(
    household: CurrentHousehold,
    db: DbSession,
    year: int = Query(ge=1900, le=2200),
    month: int = Query(ge=1, le=12),
    months: int = Query(default=6, ge=1, le=36),
) -> list[CategoryComparisonRead]:
    """Ist des Monats gegen den Schnitt der abgeschlossenen Vormonate."""
    return [
        CategoryComparisonRead(
            category_id=row.category_id,
            name=row.name,
            group=row.group,
            flow=row.flow,
            actual_minor=row.actual_minor,
            average_minor=row.average_minor,
            delta_minor=row.delta_minor,
            delta_ratio=row.delta_ratio,
            based_on_months=row.based_on_months,
        )
        for row in analytics.comparison(db, household, year, month, months)
    ]


@router.get("/year", response_model=YearSummaryRead)
def year_summary(
    household: CurrentHousehold,
    db: DbSession,
    year: int = Query(ge=1900, le=2200),
) -> YearSummaryRead:
    """Zwoelf Monate am Stueck."""
    result = analytics.year_summary(db, household, year)
    return YearSummaryRead(
        year=result.year,
        months=[
            TrendPointRead(
                year=point.year,
                month=point.month,
                income_minor=point.income_minor,
                expense_minor=point.expense_minor,
                balance_minor=point.balance_minor,
                savings_minor=point.savings_minor,
                available_minor=point.available_minor,
                has_data=point.has_data,
            )
            for point in result.months
        ],
        income_minor=result.income_minor,
        expense_minor=result.expense_minor,
        balance_minor=result.balance_minor,
        savings_minor=result.savings_minor,
        savings_ratio=result.savings_ratio,
        fixed_cost_ratio=result.fixed_cost_ratio,
        groups=[
            GroupFigureRead(
                group=group.group,
                actual_minor=group.actual_minor,
                budget_minor=group.budget_minor,
                has_budget=group.has_budget,
            )
            for group in result.groups
        ],
        categories=[
            CategoryFigureRead(
                category_id=figure.category_id,
                name=figure.name,
                group=figure.group,
                flow=figure.flow,
                color=figure.color,
                actual_minor=figure.actual_minor,
                budget_minor=figure.budget_minor,
                budget_source=figure.budget_source,
                transfer_minor=figure.transfer_minor,
                difference_minor=figure.difference_minor,
                usage=figure.usage,
            )
            for figure in result.categories
        ],
    )
