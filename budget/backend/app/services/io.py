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
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session

from app.enums import AccountKind
from app.models import (
    Account,
    Budget,
    CalendarEntry,
    Category,
    Household,
    Member,
    RecurringRule,
    RecurringRuleSplit,
    RecurringSkip,
    SavingsGoal,
    SettlementPayment,
    Transaction,
    TransactionSplit,
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

#: Version 2 fuehrt settlement_payments, Version 3 die Konten. Aeltere Backups
#: bleiben lesbar: fehlen Konten, entsteht beim Einspielen ein Hauptkonto aus dem
#: damaligen Startsaldo, und Buchungen in SPAREN-Kategorien werden zu Umbuchungen
#: auf ein Sparkonto -- genau wie in Migration 0003.
BACKUP_VERSION = 3
SUPPORTED_BACKUP_VERSIONS = (1, 2, 3)

TRANSACTION_CSV_HEADER = [
    "datum",
    "konto",
    "gegenkonto",
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
                txn.account.name,
                txn.counter_account.name if txn.counter_account else "",
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
    wiederherzustellen -- inklusive der Splits, aber ohne abgeleitete Werte.

    Version 2 fuehrt ``settlement_payments``. Aeltere Backups (Version 1) lassen sich
    weiterhin einspielen; sie haben schlicht keine Ausgleichszahlungen.
    """

    def rows(model, order):
        return db.scalars(
            select(model).where(model.household_id == household.id).order_by(order)
        ).unique()

    return {
        "format": "haushaltsbudget-backup",
        "version": BACKUP_VERSION,
        "exported_at": dt.datetime.now().isoformat(timespec="seconds"),
        "household": {
            "name": household.name,
            "currency": household.currency,
            "locale": household.locale,
            "timezone": household.timezone,
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
        "accounts": [
            {
                "id": a.id,
                "name": a.name,
                "kind": a.kind.value if hasattr(a.kind, "value") else str(a.kind),
                "opening_balance_minor": a.opening_balance_minor,
                "color": a.color,
                "include_in_available": a.include_in_available,
                "is_active": a.is_active,
                "sort_order": a.sort_order,
            }
            for a in rows(Account, Account.sort_order)
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
                "account_id": t.account_id,
                "counter_account_id": t.counter_account_id,
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
        "settlement_payments": [
            {
                "id": p.id,
                "from_member_id": p.from_member_id,
                "to_member_id": p.to_member_id,
                "amount_minor": p.amount_minor,
                "date": p.date.isoformat(),
                "period_year": p.period_year,
                "period_month": p.period_month,
                "note": p.note,
            }
            for p in rows(SettlementPayment, SettlementPayment.date)
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


# --------------------------------------------------------- Wiederherstellen / Leeren

#: Reihenfolge, in der geloescht werden muss. Kategorien und Personen haengen an
#: Buchungen mit ON DELETE RESTRICT -- die muessen zuerst weg.
_DELETE_ORDER = (
    "txn_split",
    "txn",
    "settlement_payment",
    "recurring_skip",
    "recurring_rule_split",
    "recurring_rule",
    "budget",
    "savings_goal",
    "calendar_entry",
    "category",
    "member",
    "account",
)


class RestoreError(ValueError):
    """Das Backup ist unbrauchbar. Es wird nichts angefasst."""


def wipe(db: Session, household_id: int, keep_master_data: bool = False) -> dict[str, int]:
    """Leert den Haushalt. Gibt zurueck, wie viele Zeilen je Tabelle entfernt wurden.

    ``keep_master_data=True`` behaelt Personen, Kategorien, Budgets, Regeln, Sparziele
    und Termine -- geloescht werden dann die Buchungen samt der Ausgleichszahlungen.
    Letztere gleichen konkrete Ausgaben aus; ohne diese Ausgaben stuenden sie als
    unbegruendete Guthaben da.
    """
    tables = ("txn_split", "txn", "settlement_payment") if keep_master_data else _DELETE_ORDER
    removed: dict[str, int] = {}

    # Alles, was am Haushalt haengt, ueber die jeweilige Verbindung einsammeln.
    scoped = {
        "txn_split": "DELETE FROM txn_split WHERE txn_id IN"
        " (SELECT id FROM txn WHERE household_id = :hid)",
        "txn": "DELETE FROM txn WHERE household_id = :hid",
        "settlement_payment": "DELETE FROM settlement_payment WHERE household_id = :hid",
        "recurring_skip": "DELETE FROM recurring_skip WHERE rule_id IN"
        " (SELECT id FROM recurring_rule WHERE household_id = :hid)",
        "recurring_rule_split": "DELETE FROM recurring_rule_split WHERE rule_id IN"
        " (SELECT id FROM recurring_rule WHERE household_id = :hid)",
        "recurring_rule": "DELETE FROM recurring_rule WHERE household_id = :hid",
        "budget": "DELETE FROM budget WHERE household_id = :hid",
        "savings_goal": "DELETE FROM savings_goal WHERE household_id = :hid",
        "calendar_entry": "DELETE FROM calendar_entry WHERE household_id = :hid",
        "category": "DELETE FROM category WHERE household_id = :hid",
        "member": "DELETE FROM member WHERE household_id = :hid",
        "account": "DELETE FROM account WHERE household_id = :hid",
    }
    for table in tables:
        result = db.execute(sql_text(scoped[table]), {"hid": household_id})
        removed[table] = result.rowcount or 0
    db.flush()
    return removed


def _require(payload: dict, key: str) -> list:
    value = payload.get(key, [])
    if not isinstance(value, list):
        raise RestoreError(f"'{key}' muss eine Liste sein.")
    return value


def restore_household(db: Session, household: Household, payload: dict) -> dict[str, int]:
    """Spielt ein JSON-Backup zurueck und ersetzt dabei den gesamten Haushalt.

    Die urspruenglichen IDs werden beibehalten, weil der Haushalt vorher vollstaendig
    geleert wird. Damit bleiben alle Querverweise des Backups gueltig, ohne sie
    umschreiben zu muessen.
    """
    if not isinstance(payload, dict):
        raise RestoreError("Das Backup ist kein JSON-Objekt.")
    if payload.get("format") != "haushaltsbudget-backup":
        raise RestoreError(
            "Das ist kein Backup dieser Anwendung (Feld 'format' fehlt oder passt nicht)."
        )
    version = payload.get("version")
    if version not in SUPPORTED_BACKUP_VERSIONS:
        raise RestoreError(
            f"Unbekannte Backup-Version: {version!r}. "
            f"Lesbar sind {', '.join(str(v) for v in SUPPORTED_BACKUP_VERSIONS)}."
        )

    head = payload.get("household")
    if not isinstance(head, dict):
        raise RestoreError("Im Backup fehlt der Abschnitt 'household'.")

    wipe(db, household.id)

    household.name = head.get("name", household.name)
    household.currency = head.get("currency", household.currency)
    household.locale = head.get("locale", household.locale)
    household.timezone = head.get("timezone", household.timezone)
    household.settlement_basis = head.get("settlement_basis", household.settlement_basis)
    db.flush()

    counts: dict[str, int] = {}

    # --- Konten. Aeltere Backups kennen sie nicht: dann entsteht ein Hauptkonto aus
    # dem damaligen Startsaldo des Haushalts, genau wie in Migration 0003.
    account_rows = payload.get("accounts")
    legacy_savings_account_id: int | None = None
    legacy_main_account_id: int | None = None
    legacy_savings_categories: set[int] = set()

    if account_rows:
        for row in account_rows:
            db.add(
                Account(
                    id=row["id"],
                    household_id=household.id,
                    name=row["name"],
                    kind=row.get("kind", AccountKind.CHECKING),
                    opening_balance_minor=int(row.get("opening_balance_minor", 0)),
                    color=row.get("color", "#1e3a5f"),
                    include_in_available=bool(row.get("include_in_available", True)),
                    is_active=bool(row.get("is_active", True)),
                    sort_order=int(row.get("sort_order", 0)),
                )
            )
        counts["accounts"] = len(account_rows)
    else:
        main = Account(
            household_id=household.id,
            name="Hauptkonto",
            kind=AccountKind.CHECKING,
            opening_balance_minor=int(head.get("opening_balance_minor", 0)),
            color="#1e3a5f",
            include_in_available=True,
            sort_order=0,
        )
        db.add(main)
        db.flush()
        legacy_main_account_id = main.id
        counts["accounts"] = 1

        savings_categories = {
            row["id"] for row in _require(payload, "categories") if row.get("group") == "SPAREN"
        }
        if any(
            row.get("category_id") in savings_categories
            for row in _require(payload, "transactions")
        ):
            savings = Account(
                household_id=household.id,
                name="Sparkonto",
                kind=AccountKind.SAVINGS,
                opening_balance_minor=0,
                color="#166534",
                include_in_available=False,
                sort_order=1,
            )
            db.add(savings)
            db.flush()
            legacy_savings_account_id = savings.id
            counts["accounts"] = 2
        legacy_savings_categories = savings_categories
    db.flush()

    for row in _require(payload, "members"):
        db.add(
            Member(
                id=row["id"],
                household_id=household.id,
                name=row["name"],
                color=row.get("color", "#64748b"),
                is_active=bool(row.get("is_active", True)),
                sort_order=int(row.get("sort_order", 0)),
                share_weight=int(row.get("share_weight", 1)),
            )
        )
    counts["members"] = len(_require(payload, "members"))

    for row in _require(payload, "categories"):
        db.add(
            Category(
                id=row["id"],
                household_id=household.id,
                name=row["name"],
                flow=row["flow"],
                group=row["group"],
                icon=row.get("icon"),
                color=row.get("color", "#64748b"),
                is_active=bool(row.get("is_active", True)),
                sort_order=int(row.get("sort_order", 0)),
            )
        )
    counts["categories"] = len(_require(payload, "categories"))
    db.flush()

    for row in _require(payload, "budgets"):
        db.add(
            Budget(
                id=row["id"],
                household_id=household.id,
                category_id=row["category_id"],
                year=row.get("year"),
                month=row.get("month"),
                amount_minor=int(row["amount_minor"]),
                is_default=bool(row.get("is_default", False)),
            )
        )
    counts["budgets"] = len(_require(payload, "budgets"))

    for row in _require(payload, "recurring_rules"):
        db.add(
            RecurringRule(
                id=row["id"],
                household_id=household.id,
                category_id=row["category_id"],
                description=row["description"],
                amount_minor=int(row["amount_minor"]),
                interval=row["interval"],
                day_of_period=int(row.get("day_of_period", 1)),
                anchor_month=row.get("anchor_month"),
                start_date=dt.date.fromisoformat(row["start_date"]),
                end_date=dt.date.fromisoformat(row["end_date"]) if row.get("end_date") else None,
                is_active=bool(row.get("is_active", True)),
                note=row.get("note"),
                split_template=row.get("split_template", "EQUAL"),
                split_member_id=row.get("split_member_id"),
            )
        )
    counts["recurring_rules"] = len(_require(payload, "recurring_rules"))
    db.flush()

    for row in _require(payload, "recurring_rules"):
        for line in row.get("manual_splits", []):
            db.add(
                RecurringRuleSplit(
                    rule_id=row["id"],
                    member_id=line["member_id"],
                    amount_minor=int(line["amount_minor"]),
                )
            )

    for row in _require(payload, "recurring_skips"):
        db.add(
            RecurringSkip(
                rule_id=row["rule_id"],
                occurrence_date=dt.date.fromisoformat(row["occurrence_date"]),
            )
        )

    for row in _require(payload, "savings_goals"):
        db.add(
            SavingsGoal(
                id=row["id"],
                household_id=household.id,
                name=row["name"],
                target_amount_minor=int(row["target_amount_minor"]),
                target_date=dt.date.fromisoformat(row["target_date"])
                if row.get("target_date")
                else None,
                category_id=row["category_id"],
                start_date=dt.date.fromisoformat(row["start_date"])
                if row.get("start_date")
                else None,
                is_active=bool(row.get("is_active", True)),
            )
        )
    counts["savings_goals"] = len(_require(payload, "savings_goals"))

    for row in _require(payload, "settlement_payments"):
        db.add(
            SettlementPayment(
                id=row["id"],
                household_id=household.id,
                from_member_id=row["from_member_id"],
                to_member_id=row["to_member_id"],
                amount_minor=int(row["amount_minor"]),
                date=dt.date.fromisoformat(row["date"]),
                period_year=row.get("period_year"),
                period_month=row.get("period_month"),
                note=row.get("note"),
            )
        )
    counts["settlement_payments"] = len(_require(payload, "settlement_payments"))

    for row in _require(payload, "calendar_entries"):
        db.add(
            CalendarEntry(
                id=row["id"],
                household_id=household.id,
                title=row["title"],
                date=dt.date.fromisoformat(row["date"]),
                member_id=row.get("member_id"),
                note=row.get("note"),
            )
        )
    counts["calendar_entries"] = len(_require(payload, "calendar_entries"))
    db.flush()

    transactions = _require(payload, "transactions")
    for row in transactions:
        if account_rows:
            account_id = row["account_id"]
            counter_account_id = row.get("counter_account_id")
        else:
            account_id = legacy_main_account_id
            counter_account_id = (
                legacy_savings_account_id
                if row.get("category_id") in legacy_savings_categories
                else None
            )
        # amount_minor wird bewusst nicht gesetzt -- die Trigger berechnen es aus den
        # Splits, und ein direkter Schreibzugriff waere ohnehin abgelehnt worden.
        db.add(
            Transaction(
                id=row["id"],
                household_id=household.id,
                date=dt.date.fromisoformat(row["date"]),
                category_id=row["category_id"],
                account_id=account_id,
                counter_account_id=counter_account_id,
                description=row.get("description", ""),
                note=row.get("note"),
                recurring_rule_id=row.get("recurring_rule_id"),
                recurring_occurrence_date=(
                    dt.date.fromisoformat(row["recurring_occurrence_date"])
                    if row.get("recurring_occurrence_date")
                    else None
                ),
            )
        )
    db.flush()

    splits = 0
    for row in transactions:
        lines = row.get("splits") or []
        if not lines:
            raise RestoreError(
                f"Buchung {row['id']} hat keine Aufteilung -- das Backup ist unvollstaendig."
            )
        for line in lines:
            db.add(
                TransactionSplit(
                    txn_id=row["id"],
                    member_id=line["member_id"],
                    amount_minor=int(line["amount_minor"]),
                )
            )
            splits += 1
    db.flush()

    counts["transactions"] = len(transactions)
    counts["splits"] = splits
    return counts
