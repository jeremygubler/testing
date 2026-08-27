"""SQLAlchemy-Modelle.

Konventionen
------------
* Alle Geldbetraege sind ganzzahlige Minoreinheiten (Rappen/Cent) und heissen ``*_minor``.
  Es gibt keine Float-Betraege, weder in der DB noch in der API.
* Betraege werden so gespeichert, wie sie erfasst wurden (normalerweise positiv).
  Die Richtung ergibt sich aus ``Category.flow``; negative Betraege sind fuer
  Korrekturen/Rueckerstattungen zulaessig.
* Die Tabellen heissen ``txn``/``txn_split`` statt ``transaction``, weil ``transaction``
  in mehreren SQL-Dialekten ein reserviertes Wort ist.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.enums import CategoryGroup, Flow, Interval, SettlementBasis, SplitTemplate
from app.types import EnumStr


class Household(Base):
    __tablename__ = "household"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CHF")
    locale: Mapped[str] = mapped_column(String(10), nullable=False, default="de-CH")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Europe/Zurich")
    opening_balance_minor: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    settlement_basis: Mapped[SettlementBasis] = mapped_column(
        EnumStr(SettlementBasis, 16), nullable=False, default=SettlementBasis.WEIGHT
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.current_timestamp()
    )

    members: Mapped[list[Member]] = relationship(
        back_populates="household", cascade="all, delete-orphan", order_by="Member.sort_order"
    )
    categories: Mapped[list[Category]] = relationship(
        back_populates="household", cascade="all, delete-orphan", order_by="Category.sort_order"
    )


class Member(Base):
    """Person im Haushalt. Wird nie hart geloescht, sondern deaktiviert."""

    __tablename__ = "member"
    __table_args__ = (
        UniqueConstraint("household_id", "name", name="uq_member_household_name"),
        CheckConstraint("share_weight > 0", name="ck_member_share_weight_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    color: Mapped[str] = mapped_column(String(9), nullable=False, default="#64748b")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: Gewicht fuer den Verteilschluessel (60/40 => 60 und 40) und Referenz
    #: fuer den fairen Anteil im Ausgleich.
    share_weight: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    household: Mapped[Household] = relationship(back_populates="members")


class Category(Base):
    __tablename__ = "category"
    __table_args__ = (
        UniqueConstraint("household_id", "name", name="uq_category_household_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    flow: Mapped[Flow] = mapped_column(EnumStr(Flow, 10), nullable=False)
    group: Mapped[CategoryGroup] = mapped_column("grp", EnumStr(CategoryGroup, 16), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(40), nullable=True)
    color: Mapped[str] = mapped_column(String(9), nullable=False, default="#64748b")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    household: Mapped[Household] = relationship(back_populates="categories")


class Budget(Base):
    """Budget je Kategorie.

    ``is_default=True`` => ``year``/``month`` sind NULL; gilt fuer jeden Monat ohne
    spezifischen Eintrag. ``is_default=False`` => beide gesetzt, uebersteuert den Default.
    """

    __tablename__ = "budget"
    __table_args__ = (
        CheckConstraint(
            "(is_default = 1 AND year IS NULL AND month IS NULL)"
            " OR (is_default = 0 AND year IS NOT NULL AND month IS NOT NULL)",
            name="ck_budget_default_shape",
        ),
        CheckConstraint("month IS NULL OR (month BETWEEN 1 AND 12)", name="ck_budget_month_range"),
        # Die beiden Eindeutigkeiten sind partielle Indizes und stehen in app/ddl.py:
        # ein Default je Kategorie, ein Monatsbudget je (Kategorie, Jahr, Monat).
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("category.id", ondelete="CASCADE"), nullable=False, index=True
    )
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    category: Mapped[Category] = relationship()


class Transaction(Base):
    """Eine Buchung. Der Betrag steht nicht hier, sondern in den Splits.

    ``amount_minor`` ist eine **ausschliesslich abgeleitete** Spalte: sie wird von
    DB-Triggern aus ``txn_split`` gepflegt und ist ueber die API nicht schreibbar.
    Sie existiert, damit die Konsistenz der Split-Summe DB-seitig garantiert ist und
    damit Filtern/Sortieren nach Betrag ohne Aggregat-Join funktioniert.
    """

    __tablename__ = "txn"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("category.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    recurring_rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("recurring_rule.id", ondelete="SET NULL"), nullable=True, index=True
    )
    #: Das Faelligkeitsdatum der Regel-Instanz, aus der diese Buchung entstanden ist.
    #: Kann vom tatsaechlichen ``date`` abweichen (Nutzer korrigiert beim Bestaetigen).
    recurring_occurrence_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.current_timestamp()
    )

    category: Mapped[Category] = relationship(lazy="joined")
    splits: Mapped[list[TransactionSplit]] = relationship(
        back_populates="transaction",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="TransactionSplit.id",
    )


class TransactionSplit(Base):
    """Aufteilung einer Buchung auf eine Person."""

    __tablename__ = "txn_split"
    __table_args__ = (
        UniqueConstraint("txn_id", "member_id", name="uq_split_txn_member"),
        CheckConstraint("amount_minor <> 0", name="ck_split_amount_nonzero"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    txn_id: Mapped[int] = mapped_column(
        ForeignKey("txn.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        ForeignKey("member.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)

    transaction: Mapped[Transaction] = relationship(back_populates="splits")
    member: Mapped[Member] = relationship(lazy="joined")


class RecurringRule(Base):
    """Wiederkehrende Buchung. Abos sind Regeln mit Kategorie der Gruppe FIXKOSTEN."""

    __tablename__ = "recurring_rule"
    __table_args__ = (
        CheckConstraint("day_of_period BETWEEN 1 AND 31", name="ck_rule_day_range"),
        CheckConstraint("amount_minor <> 0", name="ck_rule_amount_nonzero"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("category.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    interval: Mapped[Interval] = mapped_column(EnumStr(Interval, 16), nullable=False)
    #: MONTHLY/QUARTERLY/YEARLY: Tag im Monat (1-31, wird auf Monatsende geklemmt).
    #: WEEKLY: Wochentag als 1=Montag ... 7=Sonntag.
    day_of_period: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    #: Nur fuer YEARLY/QUARTERLY relevant: Ankermonat (1-12) der ersten Faelligkeit.
    anchor_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    end_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    split_template: Mapped[SplitTemplate] = mapped_column(
        EnumStr(SplitTemplate, 10), nullable=False, default=SplitTemplate.EQUAL
    )
    #: Nur bei split_template=SINGLE gesetzt.
    split_member_id: Mapped[int | None] = mapped_column(
        ForeignKey("member.id", ondelete="RESTRICT"), nullable=True
    )

    category: Mapped[Category] = relationship(lazy="joined")
    manual_splits: Mapped[list[RecurringRuleSplit]] = relationship(
        back_populates="rule", cascade="all, delete-orphan", lazy="selectin"
    )


class RecurringRuleSplit(Base):
    """Standard-Aufteilung einer Regel, nur bei split_template=MANUAL genutzt."""

    __tablename__ = "recurring_rule_split"
    __table_args__ = (
        UniqueConstraint("rule_id", "member_id", name="uq_rule_split_member"),
        CheckConstraint("amount_minor <> 0", name="ck_rule_split_amount_nonzero"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[int] = mapped_column(
        ForeignKey("recurring_rule.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        ForeignKey("member.id", ondelete="RESTRICT"), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)

    rule: Mapped[RecurringRule] = relationship(back_populates="manual_splits")


class RecurringSkip(Base):
    """Ein bewusst uebersprungener Faelligkeitstermin einer Regel."""

    __tablename__ = "recurring_skip"
    __table_args__ = (
        UniqueConstraint("rule_id", "occurrence_date", name="uq_skip_rule_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[int] = mapped_column(
        ForeignKey("recurring_rule.id", ondelete="CASCADE"), nullable=False, index=True
    )
    occurrence_date: Mapped[dt.date] = mapped_column(Date, nullable=False)


class SavingsGoal(Base):
    """Sparziel. Fortschritt wird aus den Buchungen der Kategorie berechnet."""

    __tablename__ = "savings_goal"
    __table_args__ = (
        CheckConstraint("target_amount_minor > 0", name="ck_goal_target_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    target_amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    target_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("category.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    #: Buchungen vor diesem Datum zaehlen nicht zum Fortschritt.
    start_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    category: Mapped[Category] = relationship(lazy="joined")


class CalendarEntry(Base):
    """Termin ohne Geldbezug."""

    __tablename__ = "calendar_entry"

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    member_id: Mapped[int | None] = mapped_column(
        ForeignKey("member.id", ondelete="SET NULL"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class SettlementPayment(Base):
    """Eine tatsaechlich getaetigte Ausgleichszahlung zwischen zwei Personen.

    Ohne diese Tabelle war der Ausgleich nur eine Anzeige: die App rechnete jeden
    Monat neu aus, wer wem was schuldet, aber eine geleistete Ueberweisung liess sich
    nirgends festhalten. Der Folgemonat begann wieder bei null, und offene Betraege
    verschwanden lautlos.
    """

    __tablename__ = "settlement_payment"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_settlement_amount_positive"),
        CheckConstraint("from_member_id <> to_member_id", name="ck_settlement_distinct_members"),
        CheckConstraint(
            "(period_year IS NULL AND period_month IS NULL)"
            " OR (period_year IS NOT NULL AND period_month IS NOT NULL)",
            name="ck_settlement_period_shape",
        ),
        CheckConstraint(
            "period_month IS NULL OR (period_month BETWEEN 1 AND 12)",
            name="ck_settlement_period_month_range",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    household_id: Mapped[int] = mapped_column(
        ForeignKey("household.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_member_id: Mapped[int] = mapped_column(
        ForeignKey("member.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    to_member_id: Mapped[int] = mapped_column(
        ForeignKey("member.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    #: Wann die Zahlung geflossen ist.
    date: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    #: Welche Periode sie ausgleicht. Getrennt vom Zahlungsdatum, weil man die
    #: Januar-Schuld typischerweise im Februar begleicht.
    period_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    period_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.current_timestamp()
    )
