"""Pydantic-Schemas der REST-API.

Konvention: **alle** Geldbetraege heissen ``*_minor`` und sind ganzzahlige
Minoreinheiten (Rappen/Cent). Die API liefert nie formatierte Betraege.
"""

from __future__ import annotations

import datetime as dt
import re
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.enums import (
    AccountKind,
    CategoryGroup,
    Flow,
    Interval,
    SettlementBasis,
    SplitTemplate,
)

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
    settlement_basis: SettlementBasis


class HouseholdUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    locale: str | None = Field(default=None, min_length=2, max_length=10)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    settlement_basis: SettlementBasis | None = None


# ---------------------------------------------------------------------------- Account


class AccountBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: AccountKind = AccountKind.CHECKING
    opening_balance_minor: int = 0
    color: str = "#1e3a5f"
    #: Zaehlt dieses Konto zum frei verfuegbaren Geld?
    include_in_available: bool = True
    sort_order: int = 0

    _color = field_validator("color")(_validate_color)


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    kind: AccountKind | None = None
    opening_balance_minor: int | None = None
    color: str | None = None
    include_in_available: bool | None = None
    sort_order: int | None = None
    is_active: bool | None = None

    @field_validator("color")
    @classmethod
    def _check_color(cls, value: str | None) -> str | None:
        return None if value is None else _validate_color(value)


class AccountRead(ApiModel):
    id: int
    name: str
    kind: AccountKind
    opening_balance_minor: int
    color: str
    include_in_available: bool
    is_active: bool
    sort_order: int


class AccountBalanceRead(BaseModel):
    account_id: int
    name: str
    kind: AccountKind
    color: str
    include_in_available: bool
    is_active: bool
    opening_balance_minor: int
    #: Einnahmen minus Ausgaben auf diesem Konto, ohne Umbuchungen.
    flow_minor: int
    #: Zugefuehrt minus abgefuehrt durch Umbuchungen.
    transfer_minor: int
    balance_minor: int


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
    #: Konto, auf dem die Buchung stattfindet. Fehlt es, wird das erste aktive genommen.
    account_id: int | None = None
    #: Gesetzt macht die Buchung zur Umbuchung auf dieses Konto -- weder Einnahme
    #: noch Ausgabe, sondern ein Wechsel des Topfes.
    counter_account_id: int | None = None
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
    account_id: int | None = None
    counter_account_id: int | None = None
    description: str | None = Field(default=None, max_length=200)
    note: str | None = None
    amount_minor: int | None = None
    split: SplitSpec | None = None

    @model_validator(mode="after")
    def _amount_needs_split(self) -> TransactionUpdate:
        if self.amount_minor is not None and self.amount_minor == 0:
            raise ValueError("Der Betrag darf nicht 0 sein.")
        return self


class AttachmentRead(ApiModel):
    """Ein Beleg -- ohne die Bytes. Die holt sich die Oberflaeche einzeln."""

    id: int
    txn_id: int
    filename: str
    content_type: str
    size_bytes: int
    width: int | None
    height: int | None
    created_at: dt.datetime
    #: Ob eine Vorschau existiert. PDFs haben keine.
    has_thumbnail: bool


class TransactionRead(ApiModel):
    id: int
    date: dt.date
    account_id: int
    account_name: str
    counter_account_id: int | None
    counter_account_name: str | None
    #: Umbuchung zwischen zwei Konten statt Einnahme oder Ausgabe.
    is_transfer: bool
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
    #: Nur die Anzahl -- die Liste soll nicht bei jeder Buchung Belegdaten mitschleppen.
    attachment_count: int


class TransactionPage(BaseModel):
    items: list[TransactionRead]
    total: int
    limit: int
    offset: int
    sum_income_minor: int
    sum_expense_minor: int


class CategorySuggestion(BaseModel):
    category_id: int
    category_name: str
    matches: int
    #: EXACT = identische Beschreibung schon gebucht, TOKEN = gemeinsames Stichwort.
    basis: str


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
    #: Der Anteil des Ist, der aus Umbuchungen stammt -- fuers Budget zaehlt er mit,
    #: als Ausgabe gilt er nicht.
    transfer_minor: int
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
    #: Was in der Periode auf Sparkonten umgebucht wurde.
    savings_minor: int
    #: Frei verfuegbares Geld auf den dafuer vorgesehenen Konten.
    available_minor: int
    #: Alle Konten zusammen.
    net_worth_minor: int
    savings_ratio: float | None
    fixed_cost_ratio: float | None
    accounts: list[AccountBalanceRead]
    categories: list[CategoryFigureRead]
    groups: list[GroupFigureRead]
    members: list[MemberFigureRead]


class MemberBalanceRead(BaseModel):
    member_id: int
    borne_minor: int
    share_minor: int
    #: Netto bereits ausgeglichen: erhaltene minus geleistete Zahlungen.
    settled_minor: int
    #: Saldo vor Beruecksichtigung der Zahlungen.
    gross_balance_minor: int
    #: Was noch offen ist.
    balance_minor: int


class PaymentRead(BaseModel):
    from_member_id: int
    to_member_id: int
    amount_minor: int


class SettlementPaymentRead(ApiModel):
    id: int
    from_member_id: int
    to_member_id: int
    amount_minor: int
    date: dt.date
    period_year: int | None
    period_month: int | None
    note: str | None


class SettlementPaymentCreate(BaseModel):
    """Haelt eine tatsaechlich geleistete Ausgleichszahlung fest."""

    from_member_id: int
    to_member_id: int
    amount_minor: int = Field(gt=0)
    date: dt.date
    #: Welche Periode die Zahlung ausgleicht -- getrennt vom Zahlungsdatum, weil man
    #: die Januar-Schuld typischerweise im Februar begleicht.
    period_year: int = Field(ge=1900, le=2200)
    period_month: int = Field(ge=1, le=12)
    note: str | None = None

    @model_validator(mode="after")
    def _distinct(self) -> SettlementPaymentCreate:
        if self.from_member_id == self.to_member_id:
            raise ValueError("Eine Person kann nicht an sich selbst zahlen.")
        return self


class SettlementRead(BaseModel):
    basis: SettlementBasis
    total_expense_minor: int
    balances: list[MemberBalanceRead]
    #: Empfehlungen fuer das, was noch offen ist.
    payments: list[PaymentRead]
    #: Bereits festgehaltene Zahlungen der Periode.
    recorded: list[SettlementPaymentRead]


class TrendPointRead(BaseModel):
    year: int
    month: int
    income_minor: int
    expense_minor: int
    balance_minor: int
    savings_minor: int
    #: Startsaldo plus kumulierter Saldo bis einschliesslich dieses Monats.
    available_minor: int
    #: Wurde in diesem Monat ueberhaupt gebucht?
    has_data: bool


class ForecastRead(BaseModel):
    year: int
    month: int
    expected_income_minor: int
    expected_expense_minor: int
    open_count: int
    projected_balance_minor: int
    projected_available_minor: int


class CategoryComparisonRead(BaseModel):
    category_id: int
    name: str
    group: CategoryGroup
    flow: Flow
    actual_minor: int
    average_minor: int
    delta_minor: int
    delta_ratio: float | None
    based_on_months: int


class YearSummaryRead(BaseModel):
    year: int
    months: list[TrendPointRead]
    income_minor: int
    expense_minor: int
    balance_minor: int
    savings_minor: int
    savings_ratio: float | None
    fixed_cost_ratio: float | None
    groups: list[GroupFigureRead]
    categories: list[CategoryFigureRead]


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
    #: Ab wann eine Terminaenderung gilt. Nur relevant, wenn Intervall, Buchungstag,
    #: Ankermonat oder Startdatum geaendert werden und die Regel schon bestaetigte
    #: Buchungen hat -- dann wird die alte Regel beendet und eine neue angelegt.
    effective_from: dt.date | None = None


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
    #: Gesetzt, wenn diese Regel eine Terminaenderung einer aelteren Regel fortsetzt.
    supersedes_rule_id: int | None = None


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


# ------------------------------------------------------------------- SavingsGoal


class SavingsGoalBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    target_amount_minor: int = Field(gt=0)
    target_date: dt.date | None = None
    category_id: int
    start_date: dt.date | None = None


class SavingsGoalCreate(SavingsGoalBase):
    pass


class SavingsGoalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    target_amount_minor: int | None = Field(default=None, gt=0)
    target_date: dt.date | None = None
    category_id: int | None = None
    start_date: dt.date | None = None
    is_active: bool | None = None


class SavingsGoalRead(BaseModel):
    id: int
    name: str
    target_amount_minor: int
    target_date: dt.date | None
    category_id: int
    category_name: str
    category_color: str
    start_date: dt.date | None
    is_active: bool
    saved_minor: int
    remaining_minor: int
    progress: float | None
    #: Was ab jetzt monatlich noetig waere, um das Ziel puenktlich zu erreichen.
    monthly_needed_minor: int | None
    months_left: int | None


# ----------------------------------------------------------------- CalendarEntry


class CalendarEntryBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    date: dt.date
    member_id: int | None = None
    note: str | None = None


class CalendarEntryCreate(CalendarEntryBase):
    pass


class CalendarEntryUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    date: dt.date | None = None
    member_id: int | None = None
    note: str | None = None


class CalendarEntryRead(ApiModel):
    id: int
    title: str
    date: dt.date
    member_id: int | None
    note: str | None


# ------------------------------------------------------------------ Import/Export


class ImportRow(BaseModel):
    """Eine Zeile aus der CSV, bereits den Spalten zugeordnet."""

    row_number: int
    date: str
    amount: str
    description: str = ""
    note: str | None = None
    category: str | None = None
    member: str | None = None


class ImportRequest(BaseModel):
    rows: list[ImportRow]
    #: Konto, auf das der Auszug gebucht wird. Fehlt es, wird das erste aktive genommen.
    account_id: int | None = None
    #: Kategorie fuer Zeilen ohne erkennbare Kategorie.
    fallback_category_id: int | None = None
    #: Aufteilung fuer Zeilen ohne erkennbare Person.
    fallback_split: SplitSpec = SplitSpec()
    #: Vorzeichen der CSV behalten? Standard: nein -- die Richtung steckt in der
    #: Kategorie, Bankauszuege schreiben Ausgaben nur konventionell negativ.
    keep_sign: bool = False
    #: Zeilen ohne Kategorie aus frueheren Buchungen mit aehnlicher Beschreibung raten.
    guess_categories: bool = True


class ImportRowPreview(BaseModel):
    row_number: int
    date: dt.date | None
    amount_minor: int | None
    description: str
    category_id: int | None
    category_name: str | None
    member_id: int | None
    #: CSV = aus der Datei, HISTORY = aus frueheren Buchungen erraten,
    #: FALLBACK = die im Dialog gewaehlte Ersatzkategorie.
    category_source: str | None
    is_duplicate: bool
    duplicate_transaction_id: int | None
    error: str | None

    @property
    def importable(self) -> bool:
        return self.error is None


class ImportPreview(BaseModel):
    rows: list[ImportRowPreview]
    total: int
    importable: int
    duplicates: int
    errors: int


class ImportResult(BaseModel):
    created: int
    skipped: int


class HouseholdCreate(BaseModel):
    """Erstinbetriebnahme. Version 1 kennt genau einen Haushalt pro Installation."""

    name: str = Field(min_length=1, max_length=120, default="Mein Haushalt")
    currency: str = Field(min_length=3, max_length=3, default="CHF")
    locale: str = Field(min_length=2, max_length=10, default="de-CH")
    timezone: str = Field(min_length=1, max_length=64, default="Europe/Zurich")
    #: Startsaldo des ersten Kontos, das dabei angelegt wird.
    opening_balance_minor: int = 0
    account_name: str = Field(default="Hauptkonto", min_length=1, max_length=80)
    member_names: list[str] = Field(min_length=1, max_length=6)
    with_starter_categories: bool = True

    @field_validator("member_names")
    @classmethod
    def _clean(cls, value: list[str]) -> list[str]:
        names = [name.strip() for name in value if name.strip()]
        if not names:
            raise ValueError("Mindestens eine Person ist noetig.")
        if len(names) != len(set(names)):
            raise ValueError("Die Namen der Personen muessen sich unterscheiden.")
        return names

    @field_validator("currency")
    @classmethod
    def _upper(cls, value: str) -> str:
        return value.upper()


class RestoreRequest(BaseModel):
    """Spielt ein JSON-Backup zurueck. Ersetzt den gesamten Haushalt."""

    backup: dict
    #: Muss ausdruecklich gesetzt werden -- das Zurueckspielen loescht alles Bisherige.
    confirm_replace: bool = False


class RestoreResult(BaseModel):
    restored: dict[str, int]


class ResetScope(StrEnum):
    TRANSACTIONS = "TRANSACTIONS"
    ALL = "ALL"


class ResetRequest(BaseModel):
    """Leert den Haushalt.

    ``TRANSACTIONS`` behaelt Personen, Kategorien, Budgets, Regeln, Sparziele und
    Termine und loescht nur die Buchungen. ``ALL`` loescht auch die Stammdaten -- die
    App zeigt danach wieder die Einrichtung.
    """

    scope: ResetScope = ResetScope.TRANSACTIONS
    #: Muss woertlich "LOESCHEN" sein. Ein Klick allein ist zu wenig fuer etwas,
    #: das sich nicht rueckgaengig machen laesst.
    confirm: str

    @field_validator("confirm")
    @classmethod
    def _check(cls, value: str) -> str:
        if value.strip().upper().replace("Ö", "OE") != "LOESCHEN":
            raise ValueError("Zur Bestaetigung muss 'LOESCHEN' eingegeben werden.")
        return value


class ResetResult(BaseModel):
    removed: dict[str, int]
    household_deleted: bool


# --------------------------------------------------------------- Budgetvorschlaege


class BudgetProposalRow(BaseModel):
    category_id: int
    name: str
    group: CategoryGroup
    current_minor: int | None
    proposed_minor: int
    #: Anzahl Monate, aus denen der Vorschlag stammt (nur bei AVERAGE aussagekraeftig).
    based_on_months: int


class BudgetProposal(BaseModel):
    source: str
    rows: list[BudgetProposalRow]


class BudgetBulkEntry(BaseModel):
    category_id: int
    amount_minor: int = Field(ge=0)


class BudgetBulkUpsert(BaseModel):
    entries: list[BudgetBulkEntry] = Field(min_length=1)
    year: int | None = Field(default=None, ge=1900, le=2200)
    month: int | None = Field(default=None, ge=1, le=12)

    @model_validator(mode="after")
    def _check_shape(self) -> BudgetBulkUpsert:
        if (self.year is None) != (self.month is None):
            raise ValueError("Jahr und Monat muessen gemeinsam gesetzt oder gemeinsam leer sein.")
        return self
