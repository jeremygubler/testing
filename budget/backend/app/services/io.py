"""Import und Export.

Der CSV-Import ist bewusst zweistufig: erst eine Vorschau, in der jede Zeile ihren
Zustand zeigt (in Ordnung / Dublette / Fehler), dann das Uebernehmen. Nichts wird
geschrieben, bevor der Nutzer die Vorschau gesehen hat.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Budget,
    CalendarEntry,
    Category,
    Household,
    Member,
    RecurringRule,
    RecurringRuleSplit,
    RecurringSkip,
    SavingsGoal,
    Transaction,
)
from app.services.money import format_amount, parse_amount

_DATE_FORMATS = (
    "%Y-%m-%d",
    "%d.%m.%Y",
    "%d.%m.%y",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%Y/%m/%d",
)


def parse_date(value: str) -> dt.date | None:
    text = value.strip()
    if not text:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return dt.datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def normalize(text: str | None) -> str:
    return (text or "").strip().casefold()


# ----------------------------------------------------------------------- Export

TRANSACTION_CSV_HEADER = [
    "datum",
    "kategorie",
    "gruppe",
    "richtung",
    "beschreibung",
    "notiz",
    "betrag",
    "aufteilung",
    "wiederkehrend",
]


def transactions_csv(db: Session, household: Household) -> str:
    """Alle Buchungen als CSV. Betraege als Dezimalzahl mit Punkt, damit sie jede
    Tabellenkalkulation liest; die Aufteilung als 'Person=Betrag' je Person."""
    members = {
        member.id: member.name
        for member in db.scalars(select(Member).where(Member.household_id == household.id))
    }
    rows = db.scalars(
        select(Transaction)
        .where(Transaction.household_id == household.id)
        .order_by(Transaction.date, Transaction.id)
    ).unique()

    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\n")
    writer.writerow(TRANSACTION_CSV_HEADER)
    for txn in rows:
        split_text = "; ".join(
            f"{members.get(split.member_id, '?')}={format_amount(split.amount_minor)}"
            for split in sorted(txn.splits, key=lambda s: s.id)
        )
        writer.writerow(
            [
                txn.date.isoformat(),
                txn.category.name,
                txn.category.group.value,
                txn.category.flow.value,
                txn.description,
                txn.note or "",
                format_amount(txn.amount_minor),
                split_text,
                txn.recurring_rule_id or "",
            ]
        )
    return buffer.getvalue()


def household_json(db: Session, household: Household) -> dict[str, Any]:
    """Vollstaendiges Backup. Enthaelt alles, was noetig ist, um den Haushalt
    wiederherzustellen -- inklusive der Splits, aber ohne abgeleitete Werte."""

    def rows(model, order):
        return db.scalars(
            select(model).where(model.household_id == household.id).order_by(order)
        ).unique()

    return {
        "format": "haushaltsbudget-backup",
        "version": 1,
        "exported_at": dt.datetime.now().isoformat(timespec="seconds"),
        "household": {
            "name": household.name,
            "currency": household.currency,
            "locale": household.locale,
            "timezone": household.timezone,
            "opening_balance_minor": household.opening_balance_minor,
            "settlement_basis": household.settlement_basis.value,
        },
        "members": [
            {
                "id": m.id,
                "name": m.name,
                "color": m.color,
                "is_active": m.is_active,
                "sort_order": m.sort_order,
                "share_weight": m.share_weight,
            }
            for m in rows(Member, Member.sort_order)
        ],
        "categories": [
            {
                "id": c.id,
                "name": c.name,
                "flow": c.flow.value,
                "group": c.group.value,
                "icon": c.icon,
                "color": c.color,
                "is_active": c.is_active,
                "sort_order": c.sort_order,
            }
            for c in rows(Category, Category.sort_order)
        ],
        "budgets": [
            {
                "id": b.id,
                "category_id": b.category_id,
                "year": b.year,
                "month": b.month,
                "amount_minor": b.amount_minor,
                "is_default": b.is_default,
            }
            for b in rows(Budget, Budget.id)
        ],
        "transactions": [
            {
                "id": t.id,
                "date": t.date.isoformat(),
                "category_id": t.category_id,
                "description": t.description,
                "note": t.note,
                "recurring_rule_id": t.recurring_rule_id,
                "recurring_occurrence_date": (
                    t.recurring_occurrence_date.isoformat() if t.recurring_occurrence_date else None
                ),
                "splits": [
                    {"member_id": s.member_id, "amount_minor": s.amount_minor}
                    for s in sorted(t.splits, key=lambda s: s.id)
                ],
            }
            for t in rows(Transaction, Transaction.date)
        ],
        "recurring_rules": [
            {
                "id": r.id,
                "category_id": r.category_id,
                "description": r.description,
                "amount_minor": r.amount_minor,
                "interval": r.interval.value,
                "day_of_period": r.day_of_period,
                "anchor_month": r.anchor_month,
                "start_date": r.start_date.isoformat(),
                "end_date": r.end_date.isoformat() if r.end_date else None,
                "is_active": r.is_active,
                "note": r.note,
                "split_template": r.split_template.value,
                "split_member_id": r.split_member_id,
                "manual_splits": [
                    {"member_id": s.member_id, "amount_minor": s.amount_minor}
                    for s in r.manual_splits
                ],
            }
            for r in rows(RecurringRule, RecurringRule.id)
        ],
        "recurring_skips": [
            {"rule_id": s.rule_id, "occurrence_date": s.occurrence_date.isoformat()}
            for s in db.scalars(
                select(RecurringSkip)
                .join(RecurringRule, RecurringRule.id == RecurringSkip.rule_id)
                .where(RecurringRule.household_id == household.id)
                .order_by(RecurringSkip.id)
            )
        ],
        "savings_goals": [
            {
                "id": g.id,
                "name": g.name,
                "target_amount_minor": g.target_amount_minor,
                "target_date": g.target_date.isoformat() if g.target_date else None,
                "category_id": g.category_id,
                "start_date": g.start_date.isoformat() if g.start_date else None,
                "is_active": g.is_active,
            }
            for g in rows(SavingsGoal, SavingsGoal.id)
        ],
        "calendar_entries": [
            {
                "id": e.id,
                "title": e.title,
                "date": e.date.isoformat(),
                "member_id": e.member_id,
                "note": e.note,
            }
            for e in rows(CalendarEntry, CalendarEntry.date)
        ],
    }


# ----------------------------------------------------------------------- Import


def find_duplicate(
    db: Session, household_id: int, date: dt.date, amount_minor: int, description: str
) -> int | None:
    """Dublettenerkennung ueber Datum, Betrag und Beschreibung (ohne Gross-/Kleinschreibung)."""
    candidates = db.execute(
        select(Transaction.id, Transaction.description).where(
            Transaction.household_id == household_id,
            Transaction.date == date,
            Transaction.amount_minor == amount_minor,
        )
    ).all()
    needle = normalize(description)
    for txn_id, existing in candidates:
        if normalize(existing) == needle:
            return txn_id
    return None


def parse_amount_cell(text: str, keep_sign: bool) -> tuple[int | None, str | None]:
    """Liest eine Betragszelle. Rueckgabe: (Betrag in Minoreinheiten, Fehlertext).

    Der Betrag wird als **Groesse** gespeichert; die Richtung steckt in der Kategorie
    (siehe ARCHITECTURE.md). Bankauszuege schreiben Ausgaben aber meist negativ.
    Deshalb ist das Vorzeichen im Import eine bewusste Entscheidung:

    * ``keep_sign=False`` (Standard) -- Vorzeichen ignorieren, es steckt schon in der
      Kategorie. Aus ``-89.00`` auf "Fitness" wird eine Ausgabe von 89.00.
    * ``keep_sign=True`` -- Vorzeichen behalten. Ein negativer Wert auf einer
      Ausgabenkategorie ist dann eine Rueckerstattung.
    """
    raw = text.strip()
    if not raw:
        return None, "Kein Betrag"
    try:
        value = parse_amount(raw)
    except ValueError:
        return None, f"Betrag nicht lesbar: {raw!r}"
    if value == 0:
        return None, "Betrag ist 0"
    return (value if keep_sign else abs(value)), None
