"""Beispielhaushalt: zwei Personen, drei Monate Buchungen.

Deterministisch (fester Zufalls-Seed), damit Demo und Tests reproduzierbar sind.
"""

from __future__ import annotations

import datetime as dt
import random

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import AccountKind, CategoryGroup, Flow, Interval, SettlementBasis, SplitTemplate
from app.models import (
    Account,
    Budget,
    CalendarEntry,
    Category,
    Household,
    Member,
    RecurringRule,
    SavingsGoal,
    Transaction,
    TransactionSplit,
)
from app.services.recurring import occurrences
from app.services.splits import SplitLine, build_splits

CHF = 100  # Rappen pro Franken

# (Name, Gruppe, Icon, Farbe, Standardbudget in CHF)
CATEGORIES: list[tuple[str, CategoryGroup, str, str, int | None]] = [
    ("Lohn Anna", CategoryGroup.EINKOMMEN, "briefcase", "#0f766e", 6200),
    ("Lohn Ben", CategoryGroup.EINKOMMEN, "briefcase", "#0e7490", 4800),
    ("Nebeneinkuenfte", CategoryGroup.EINKOMMEN, "coins", "#155e75", 300),
    ("Miete", CategoryGroup.FIXKOSTEN, "home", "#1e3a5f", 2150),
    ("Krankenkasse", CategoryGroup.FIXKOSTEN, "heart-pulse", "#334155", 760),
    ("Strom & Wasser", CategoryGroup.FIXKOSTEN, "zap", "#3f3f46", 130),
    ("Internet & Handy", CategoryGroup.FIXKOSTEN, "wifi", "#44403c", 119),
    ("Versicherungen", CategoryGroup.FIXKOSTEN, "shield", "#4b5563", 95),
    ("Streaming", CategoryGroup.FIXKOSTEN, "tv", "#57534e", 42),
    ("Fitness", CategoryGroup.FIXKOSTEN, "dumbbell", "#525252", 89),
    ("OeV-Abo", CategoryGroup.FIXKOSTEN, "train", "#475569", 165),
    ("Lebensmittel", CategoryGroup.VARIABEL, "shopping-cart", "#b45309", 950),
    ("Restaurant", CategoryGroup.VARIABEL, "utensils", "#c2410c", 320),
    ("Haushalt", CategoryGroup.VARIABEL, "sofa", "#a16207", 180),
    ("Kleidung", CategoryGroup.VARIABEL, "shirt", "#9a3412", 200),
    ("Freizeit", CategoryGroup.VARIABEL, "ticket", "#7c2d12", 250),
    ("Gesundheit", CategoryGroup.VARIABEL, "pill", "#854d0e", 120),
    ("Auto & Verkehr", CategoryGroup.VARIABEL, "car", "#78350f", 220),
    ("Geschenke", CategoryGroup.VARIABEL, "gift", "#92400e", 100),
    ("Sparkonto", CategoryGroup.SPAREN, "piggy-bank", "#166534", 800),
    ("Saeule 3a", CategoryGroup.SPAREN, "landmark", "#15803d", 590),
    ("Ferienkasse", CategoryGroup.SPAREN, "palmtree", "#4d7c0f", 250),
    ("Kreditrueckzahlung", CategoryGroup.SCHULDEN, "banknote", "#7f1d1d", 400),
]

VARIABLE_PATTERN: list[tuple[str, list[str], int, int, int]] = [
    # (Kategorie, Beschreibungen, min CHF, max CHF, Anzahl pro Monat)
    ("Lebensmittel", ["Grossverteiler", "Quartierladen", "Markt", "Drogerie"], 35, 165, 9),
    ("Restaurant", ["Mittagessen", "Abendessen", "Kaffee", "Take-away"], 12, 95, 5),
    ("Haushalt", ["Reinigungsmittel", "Ersatzteile", "Deko"], 15, 90, 2),
    ("Freizeit", ["Kino", "Konzert", "Buecher", "Ausflug"], 20, 120, 3),
    ("Kleidung", ["Schuhe", "Jacke", "Basics"], 40, 180, 1),
    ("Auto & Verkehr", ["Tanken", "Parkgebuehr", "Service"], 25, 140, 2),
    ("Gesundheit", ["Apotheke", "Physiotherapie"], 20, 110, 1),
    ("Geschenke", ["Geburtstagsgeschenk", "Gastgeschenk"], 25, 80, 1),
]


def _month_start(reference: dt.date, offset: int) -> dt.date:
    index = reference.year * 12 + (reference.month - 1) + offset
    return dt.date(index // 12, index % 12 + 1, 1)


def seed_demo(db: Session, reference_date: dt.date | None = None) -> Household:
    """Legt den Beispielhaushalt an. Tut nichts, wenn bereits ein Haushalt existiert."""
    existing = db.scalar(select(Household).limit(1))
    if existing is not None:
        return existing

    today = reference_date or dt.date.today()
    first_month = _month_start(today, -2)
    rng = random.Random(20260101)

    household = Household(
        id=1,
        name="Haushalt Muster",
        currency="CHF",
        locale="de-CH",
        timezone="Europe/Zurich",
        settlement_basis=SettlementBasis.WEIGHT,
    )
    db.add(household)
    db.flush()

    main_account = Account(
        household_id=household.id,
        name="Hauptkonto",
        kind=AccountKind.CHECKING,
        opening_balance_minor=12_450 * CHF,
        color="#1e3a5f",
        include_in_available=True,
        sort_order=0,
    )
    savings_account = Account(
        household_id=household.id,
        name="Sparkonto",
        kind=AccountKind.SAVINGS,
        opening_balance_minor=8_000 * CHF,
        color="#166534",
        include_in_available=False,
        sort_order=1,
    )
    db.add_all([main_account, savings_account])
    db.flush()

    anna = Member(
        household_id=household.id,
        name="Anna",
        color="#2563eb",
        sort_order=0,
        share_weight=60,
    )
    ben = Member(
        household_id=household.id,
        name="Ben",
        color="#c2410c",
        sort_order=1,
        share_weight=40,
    )
    db.add_all([anna, ben])
    db.flush()
    members = [anna, ben]

    categories: dict[str, Category] = {}
    for order, (name, group, icon, color, default_budget) in enumerate(CATEGORIES):
        flow = Flow.INCOME if group is CategoryGroup.EINKOMMEN else Flow.EXPENSE
        category = Category(
            household_id=household.id,
            name=name,
            flow=flow,
            group=group,
            icon=icon,
            color=color,
            sort_order=order,
        )
        db.add(category)
        db.flush()
        categories[name] = category
        if default_budget is not None:
            db.add(
                Budget(
                    household_id=household.id,
                    category_id=category.id,
                    amount_minor=default_budget * CHF,
                    is_default=True,
                )
            )

    # Ein uebersteuerter Monat: im mittleren Monat war mehr fuer Freizeit eingeplant.
    middle = _month_start(today, -1)
    db.add(
        Budget(
            household_id=household.id,
            category_id=categories["Freizeit"].id,
            year=middle.year,
            month=middle.month,
            amount_minor=450 * CHF,
            is_default=False,
        )
    )

    rules_spec: list[dict] = [
        {
            "cat": "Lohn Anna",
            "desc": "Lohn Anna",
            "chf": 6200,
            "iv": Interval.MONTHLY,
            "day": 25,
            "tpl": SplitTemplate.SINGLE,
            "single": anna,
        },
        {
            "cat": "Lohn Ben",
            "desc": "Lohn Ben",
            "chf": 4800,
            "iv": Interval.MONTHLY,
            "day": 25,
            "tpl": SplitTemplate.SINGLE,
            "single": ben,
        },
        {
            "cat": "Miete",
            "desc": "Miete Wohnung",
            "chf": 2150,
            "iv": Interval.MONTHLY,
            "day": 1,
            "tpl": SplitTemplate.KEY,
        },
        {
            "cat": "Krankenkasse",
            "desc": "Krankenkasse Anna",
            "chf": 410,
            "iv": Interval.MONTHLY,
            "day": 5,
            "tpl": SplitTemplate.SINGLE,
            "single": anna,
        },
        {
            "cat": "Krankenkasse",
            "desc": "Krankenkasse Ben",
            "chf": 350,
            "iv": Interval.MONTHLY,
            "day": 5,
            "tpl": SplitTemplate.SINGLE,
            "single": ben,
        },
        {
            "cat": "Internet & Handy",
            "desc": "Internet & Handy",
            "chf": 119,
            "iv": Interval.MONTHLY,
            "day": 8,
            "tpl": SplitTemplate.EQUAL,
        },
        {
            "cat": "Streaming",
            "desc": "Streaming-Abo",
            "chf": 42,
            "iv": Interval.MONTHLY,
            "day": 12,
            "tpl": SplitTemplate.EQUAL,
        },
        {
            "cat": "Fitness",
            "desc": "Fitness-Abo Ben",
            "chf": 89,
            "iv": Interval.MONTHLY,
            "day": 3,
            "tpl": SplitTemplate.SINGLE,
            "single": ben,
        },
        {
            "cat": "Strom & Wasser",
            "desc": "Strom & Wasser",
            "chf": 130,
            "iv": Interval.MONTHLY,
            "day": 18,
            "tpl": SplitTemplate.KEY,
        },
        {
            "cat": "Sparkonto",
            "desc": "Dauerauftrag Sparkonto",
            "chf": 800,
            "iv": Interval.MONTHLY,
            "day": 26,
            "tpl": SplitTemplate.KEY,
        },
        {
            "cat": "Saeule 3a",
            "desc": "Saeule 3a",
            "chf": 590,
            "iv": Interval.MONTHLY,
            "day": 26,
            "tpl": SplitTemplate.EQUAL,
        },
        {
            "cat": "Kreditrueckzahlung",
            "desc": "Kredit Auto",
            "chf": 400,
            "iv": Interval.MONTHLY,
            "day": 28,
            "tpl": SplitTemplate.KEY,
        },
        {
            "cat": "Versicherungen",
            "desc": "Hausrat & Haftpflicht",
            "chf": 285,
            "iv": Interval.QUARTERLY,
            "day": 15,
            "anchor": first_month.month,
            "tpl": SplitTemplate.KEY,
        },
        {
            "cat": "OeV-Abo",
            "desc": "OeV-Jahresabo Anna",
            "chf": 1980,
            "iv": Interval.YEARLY,
            "day": 20,
            "anchor": first_month.month,
            "tpl": SplitTemplate.SINGLE,
            "single": anna,
        },
    ]

    rules: list[tuple[RecurringRule, Category]] = []
    for spec in rules_spec:
        rule = RecurringRule(
            household_id=household.id,
            category_id=categories[spec["cat"]].id,
            description=spec["desc"],
            amount_minor=spec["chf"] * CHF,
            interval=spec["iv"],
            day_of_period=spec["day"],
            anchor_month=spec.get("anchor"),
            start_date=first_month,
            split_template=spec["tpl"],
            split_member_id=spec["single"].id if spec.get("single") else None,
        )
        db.add(rule)
        rules.append((rule, categories[spec["cat"]]))
    db.flush()

    def add_transaction(
        date: dt.date,
        category: Category,
        description: str,
        lines: list[SplitLine],
        rule_id: int | None = None,
        occurrence: dt.date | None = None,
        note: str | None = None,
    ) -> None:
        # Sparen ist eine Umbuchung aufs Sparkonto, keine Ausgabe.
        is_saving = category.group is CategoryGroup.SPAREN
        txn = Transaction(
            household_id=household.id,
            date=date,
            category_id=category.id,
            account_id=main_account.id,
            counter_account_id=savings_account.id if is_saving else None,
            description=description,
            note=note,
            recurring_rule_id=rule_id,
            recurring_occurrence_date=occurrence,
        )
        db.add(txn)
        db.flush()
        for line in lines:
            db.add(
                TransactionSplit(
                    txn_id=txn.id, member_id=line.member_id, amount_minor=line.amount_minor
                )
            )
        db.flush()

    # Die letzten beiden abgeschlossenen Monate sind vollstaendig gebucht, der
    # laufende Monat absichtlich nur bis heute -- damit gibt es offene Vorschlaege.
    horizon = today
    for rule, category in rules:
        for due in occurrences(rule, first_month, horizon):
            amount = rule.amount_minor
            if rule.description in {"Strom & Wasser", "Lebensmittel"}:
                amount = int(amount * rng.uniform(0.82, 1.24))
            lines = build_splits(
                rule.split_template,
                amount,
                members,
                single_member_id=rule.split_member_id,
            )
            add_transaction(
                due,
                category,
                rule.description,
                lines,
                rule_id=rule.id,
                occurrence=due,
            )

    for offset in (-2, -1, 0):
        month_start = _month_start(today, offset)
        last_day = _month_start(today, offset + 1) - dt.timedelta(days=1)
        upper = min(last_day, today)
        for cat_name, descriptions, low, high, count in VARIABLE_PATTERN:
            for _ in range(count):
                day = rng.randint(1, upper.day)
                date = month_start.replace(day=day)
                if date > today:
                    continue
                amount = rng.randint(low * CHF, high * CHF)
                payer = rng.choice(members)
                template = rng.choices(
                    [SplitTemplate.KEY, SplitTemplate.SINGLE, SplitTemplate.EQUAL],
                    weights=[5, 3, 2],
                )[0]
                lines = build_splits(template, amount, members, single_member_id=payer.id)
                add_transaction(date, categories[cat_name], rng.choice(descriptions), lines)

    db.add_all(
        [
            SavingsGoal(
                household_id=household.id,
                name="Notgroschen",
                target_amount_minor=20_000 * CHF,
                target_date=dt.date(today.year + 1, 12, 31),
                category_id=categories["Sparkonto"].id,
                start_date=first_month,
            ),
            SavingsGoal(
                household_id=household.id,
                name="Ferien Norwegen",
                target_amount_minor=4_500 * CHF,
                target_date=dt.date(today.year + 1, 6, 30),
                category_id=categories["Ferienkasse"].id,
                start_date=first_month,
            ),
        ]
    )

    db.add_all(
        [
            CalendarEntry(
                household_id=household.id,
                title="Geburtstag Anna",
                date=_month_start(today, 0).replace(day=14),
                member_id=anna.id,
            ),
            CalendarEntry(
                household_id=household.id,
                title="Zahnarzt Ben",
                date=_month_start(today, 0).replace(day=min(22, 28)),
                member_id=ben.id,
            ),
            CalendarEntry(
                household_id=household.id,
                title="Wochenende Tessin",
                date=_month_start(today, 1).replace(day=8),
                note="Hotel bereits reserviert",
            ),
        ]
    )
    db.commit()
    return household
