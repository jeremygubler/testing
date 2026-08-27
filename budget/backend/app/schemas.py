"""Pydantic-Schemas der REST-API.

Konvention: **alle** Geldbetraege heissen ``*_minor`` und sind ganzzahlige
Minoreinheiten (Rappen/Cent). Die API liefert nie formatierte Betraege.
"""

from __future__ import annotations

import datetime as dt
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.enums import CategoryGroup, Flow, Interval, SettlementBasis, SplitTemplate

_HEX_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _validate_color(value: str) -> str:
    if not _HEX_COLOR.match(value):
        raise ValueError("Farbe muss als Hex-Wert angegeben werden, z. B. #2563eb")
    return value


# --------------------------------------------------------------------------- Household


class HouseholdRead(ApiModel):
    id: int
    name: str
    currency: str
    locale: str
    timezone: str
    opening_balance_minor: int
    settlement_basis: SettlementBasis


class HouseholdUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    locale: str | None = Field(default=None, min_length=2, max_length=10)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    opening_balance_minor: int | None = None
    settlement_basis: SettlementBasis | None = None


# ----------------------------------------------------------------------------- Member


class MemberBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str = "#64748b"
    sort_order: int = 0
    share_weight: int = Field(default=1, ge=1)

    _color = field_validator("color")(_validate_color)


class MemberCreate(MemberBase):
    pass


class MemberUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = None
    sort_order: int | None = None
    share_weight: int | None = Field(default=None, ge=1)
    is_active: bool | None = None

    @field_validator("color")
    @classmethod
    def _check_color(cls, value: str | None) -> str | None:
        return None if value is None else _validate_color(value)


class MemberRead(ApiModel):
    id: int
    name: str
    color: str
    is_active: bool
    sort_order: int
    share_weight: int


# --------------------------------------------------------------------------- Category


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    group: CategoryGroup
    icon: str | None = Field(default=None, max_length=40)
    color: str = "#64748b"
    sort_order: int = 0

    _color = field_validator("color")(_validate_color)


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    group: CategoryGroup | None = None
    icon: str | None = Field(default=None, max_length=40)
    color: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None

    @field_validator("color")
    @classmethod
    def _check_color(cls, value: str | None) -> str | None:
        return None if value is None else _validate_color(value)


class CategoryRead(ApiModel):
    id: int
    name: str
    flow: Flow
    group: CategoryGroup
    icon: str | None
    color: str
    is_active: bool
    sort_order: int


# ------------------------------------------------------------------------ Transaction


class SplitLineIn(BaseModel):
    member_id: int
    amount_minor: int


class SplitLineRead(ApiModel):
    member_id: int
    amount_minor: int


class SplitSpec(BaseModel):
    """Wie eine Buchung aufgeteilt werden soll.

    Die Vorlage ist nur ein Eingabe-Helfer -- gespeichert wird immer das aufgeloeste
    Ergebnis in ``TransactionSplit``.
    """

    template: SplitTemplate = SplitTemplate.EQUAL
    member_id: int | None = Field(
        default=None, description="Nur bei template=SINGLE: die zahlende Person."
    )
    lines: list[SplitLineIn] | None = Field(
        default=None, description="Nur bei template=MANUAL: die Betraege je Person."
    )

    @model_validator(mode="after")
    def _check_shape(self) -> SplitSpec:
        if self.template is SplitTemplate.SINGLE and self.member_id is None:
            raise ValueError("Fuer die Vorlage 'Eine Person' fehlt member_id.")
        if self.template is SplitTemplate.MANUAL and not self.lines:
            raise ValueError("Fuer die manuelle Aufteilung fehlen die Betraege (lines).")
        return self


class TransactionCreate(BaseModel):
    date: dt.date
    category_id: int
    description: str = Field(default="", max_length=200)
    note: str | None = None
    amount_minor: int = Field(
        description="Gesamtbetrag der Buchung. Muss der Summe der Splits entsprechen."
    )
    split: SplitSpec = SplitSpec()

    @field_validator("amount_minor")
    @classmethod
    def _nonzero(cls, value: int) -> int:
        if value == 0:
            raise ValueError("Der Betrag darf nicht 0 sein.")
        return value


class TransactionUpdate(BaseModel):
    date: dt.date | None = None
    category_id: int | None = None
    description: str | None = Field(default=None, max_length=200)
    note: str | None = None
    amount_minor: int | None = None
    split: SplitSpec | None = None

    @model_validator(mode="after")
    def _amount_needs_split(self) -> TransactionUpdate:
        if self.amount_minor is not None and self.amount_minor == 0:
            raise ValueError("Der Betrag darf nicht 0 sein.")
        return self


class TransactionRead(ApiModel):
    id: int
    date: dt.date
    category_id: int
    category_name: str
    category_group: CategoryGroup
    category_flow: Flow
    category_color: str
    description: str
    note: str | None
    amount_minor: int
    recurring_rule_id: int | None
    splits: list[SplitLineRead]


class TransactionPage(BaseModel):
    items: list[TransactionRead]
    total: int
    limit: int
    offset: int
    sum_income_minor: int
    sum_expense_minor: int


class SplitPreviewRequest(BaseModel):
    amount_minor: int
    split: SplitSpec


class SplitPreviewResponse(BaseModel):
    lines: list[SplitLineRead]
    total_minor: int


# ----------------------------------------------------------------------------- Budget


class BudgetUpsert(BaseModel):
    """Setzt ein Budget. ``year``/``month`` weglassen = Standardbudget."""

    category_id: int
    amount_minor: int = Field(ge=0)
    year: int | None = Field(default=None, ge=1900, le=2200)
    month: int | None = Field(default=None, ge=1, le=12)

    @model_validator(mode="after")
    def _check_shape(self) -> BudgetUpsert:
        if (self.year is None) != (self.month is None):
            raise ValueError("Jahr und Monat muessen gemeinsam gesetzt oder gemeinsam leer sein.")
        return self


class BudgetRead(ApiModel):
    id: int
    category_id: int
    year: int | None
    month: int | None
    amount_minor: int
    is_default: bool


# ------------------------------------------------------------------------- Analytics


class CategoryFigureRead(BaseModel):
    category_id: int
    name: str
    group: CategoryGroup
    flow: Flow
    color: str
    actual_minor: int
    budget_minor: int | None
    budget_source: str | None
    difference_minor: int | None
    usage: float | None


class GroupFigureRead(BaseModel):
    group: CategoryGroup
    actual_minor: int
    budget_minor: int
    has_budget: bool


class MemberFigureRead(BaseModel):
    member_id: int
    income_minor: int
    expense_minor: int
    balance_minor: int


class MonthSummaryRead(BaseModel):
    year: int
    month: int
    income_minor: int
    expense_minor: int
    balance_minor: int
    balance_excl_savings_minor: int
    available_minor: int
    savings_ratio: float | None
    fixed_cost_ratio: float | None
    categories: list[CategoryFigureRead]
    groups: list[GroupFigureRead]
    members: list[MemberFigureRead]


class MemberBalanceRead(BaseModel):
    member_id: int
    borne_minor: int
    share_minor: int
    balance_minor: int


class PaymentRead(BaseModel):
    from_member_id: int
    to_member_id: int
    amount_minor: int


class SettlementRead(BaseModel):
    basis: SettlementBasis
    total_expense_minor: int
    balances: list[MemberBalanceRead]
    payments: list[PaymentRead]


class TrendPointRead(BaseModel):
    year: int
    month: int
    income_minor: int
    expense_minor: int
    balance_minor: int
    savings_minor: int


# ------------------------------------------------------------------ RecurringRule


class RecurringRuleBase(BaseModel):
    category_id: int
    description: str = Field(min_length=1, max_length=200)
    amount_minor: int
    interval: Interval
    day_of_period: int = Field(default=1, ge=1, le=31)
    anchor_month: int | None = Field(default=None, ge=1, le=12)
    start_date: dt.date
    end_date: dt.date | None = None
    note: str | None = None
    split: SplitSpec = SplitSpec()

    @field_validator("amount_minor")
    @classmethod
    def _nonzero(cls, value: int) -> int:
        if value == 0:
            raise ValueError("Der Betrag darf nicht 0 sein.")
        return value

    @model_validator(mode="after")
    def _check_dates(self) -> RecurringRuleBase:
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("Das Enddatum liegt vor dem Startdatum.")
        if self.interval is Interval.WEEKLY and self.day_of_period > 7:
            raise ValueError("Bei woechentlichen Regeln ist der Tag der Wochentag (1-7).")
        return self


class RecurringRuleCreate(RecurringRuleBase):
    pass


class RecurringRuleUpdate(BaseModel):
    category_id: int | None = None
    description: str | None = Field(default=None, min_length=1, max_length=200)
    amount_minor: int | None = None
    interval: Interval | None = None
    day_of_period: int | None = Field(default=None, ge=1, le=31)
    anchor_month: int | None = Field(default=None, ge=1, le=12)
    start_date: dt.date | None = None
    end_date: dt.date | None = None
    is_active: bool | None = None
    note: str | None = None
    split: SplitSpec | None = None


class RecurringRuleRead(ApiModel):
    id: int
    category_id: int
    category_name: str
    category_group: CategoryGroup
    category_color: str
    description: str
    amount_minor: int
    interval: Interval
    day_of_period: int
    anchor_month: int | None
    start_date: dt.date
    end_date: dt.date | None
    is_active: bool
    note: str | None
    split: SplitSpec
    monthly_estimate_minor: int
    yearly_estimate_minor: int
    #: Anzahl der zuletzt in Folge unbestaetigten Faelligkeiten -- Hinweis auf ein
    #: vergessenes Abo.
    open_streak: int


class OccurrenceRead(BaseModel):
    rule_id: int
    due_date: dt.date
    status: str
    transaction_id: int | None
    booked_amount_minor: int | None
    booked_date: dt.date | None
    #: Vorbelegung fuer die Bestaetigung, aus der Regel uebernommen.
    description: str
    category_id: int
    category_name: str
    category_group: CategoryGroup
    amount_minor: int


class ConfirmOccurrence(BaseModel):
    rule_id: int
    due_date: dt.date
    #: Beim Bestaetigen anpassbar -- die Stromrechnung schwankt.
    date: dt.date | None = None
    amount_minor: int | None = None
    description: str | None = Field(default=None, max_length=200)
    note: str | None = None
    split: SplitSpec | None = None


class ConfirmBatch(BaseModel):
    occurrences: list[ConfirmOccurrence] = Field(min_length=1)


class SkipOccurrence(BaseModel):
    rule_id: int
    due_date: dt.date
