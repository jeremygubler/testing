import datetime as dt

from fastapi import APIRouter, Query

from app.deps import CurrentHousehold, DbSession
from app.schemas import (
    CategoryFigureRead,
    GroupFigureRead,
    MemberBalanceRead,
    MemberFigureRead,
    MonthSummaryRead,
    PaymentRead,
    SettlementRead,
    TrendPointRead,
)
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
        balance_excl_savings_minor=result.balance_excl_savings_minor,
        available_minor=result.available_minor,
        savings_ratio=result.savings_ratio,
        fixed_cost_ratio=result.fixed_cost_ratio,
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
        )
        for point in analytics.trend(db, household, year, month, months)
    ]
