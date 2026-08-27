"""Faelligkeiten wiederkehrender Regeln.

Wichtig: Regeln erzeugen **Vorschlaege**, niemals automatisch Buchungen. Die
Materialisierung passiert erst, wenn der Nutzer bestaetigt (siehe routers/recurring.py).
"""

from __future__ import annotations

import calendar
import datetime as dt
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import Interval
from app.models import RecurringRule, RecurringSkip, Transaction

_MONTH_STEP: dict[Interval, int] = {
    Interval.MONTHLY: 1,
    Interval.QUARTERLY: 3,
    Interval.YEARLY: 12,
}


def _clamp_day(year: int, month: int, day: int) -> dt.date:
    """Der 31. in einem 30-Tage-Monat wird auf den Monatsletzten gezogen."""
    last = calendar.monthrange(year, month)[1]
    return dt.date(year, month, min(day, last))


def _add_months(year: int, month: int, months: int) -> tuple[int, int]:
    index = (year * 12 + (month - 1)) + months
    return index // 12, index % 12 + 1


def occurrences(rule: RecurringRule, from_date: dt.date, to_date: dt.date) -> list[dt.date]:
    """Alle Faelligkeitstermine der Regel im Fenster ``[from_date, to_date]``."""
    if from_date > to_date:
        return []
    window_start = max(from_date, rule.start_date)
    window_end = min(to_date, rule.end_date) if rule.end_date else to_date
    if window_start > window_end:
        return []

    if rule.interval is Interval.WEEKLY:
        # day_of_period: 1 = Montag ... 7 = Sonntag
        target = (rule.day_of_period - 1) % 7
        first = rule.start_date + dt.timedelta(days=(target - rule.start_date.weekday()) % 7)
        if first < window_start:
            skip = (window_start - first).days
            first += dt.timedelta(days=((skip + 6) // 7) * 7)
        result = []
        current = first
        while current <= window_end:
            result.append(current)
            current += dt.timedelta(days=7)
        return result

    step = _MONTH_STEP[rule.interval]
    anchor_month = rule.anchor_month or rule.start_date.month
    anchor_year = rule.start_date.year
    # Index der ersten Periode, die nicht vor dem Regelstart liegt.
    base_index = anchor_year * 12 + (anchor_month - 1)
    start_index = rule.start_date.year * 12 + (rule.start_date.month - 1)
    periods_behind = max(0, -(-(start_index - base_index) // step))
    result = []
    period = periods_behind
    while True:
        year, month = _add_months(anchor_year, anchor_month, period * step)
        due = _clamp_day(year, month, rule.day_of_period)
        if due > window_end:
            break
        if due >= window_start and due >= rule.start_date:
            result.append(due)
        period += 1
        if period > periods_behind + 5000:  # Sicherheitsnetz
            break
    return result


# --------------------------------------------------------------- Vorschlaege je Monat

OPEN = "OPEN"
CONFIRMED = "CONFIRMED"
SKIPPED = "SKIPPED"

#: Faktoren fuer die Hochrechnung. Ein Jahr hat 52 Wochen -- fuer eine Schaetzung genau genug.
_PER_YEAR: dict[Interval, int] = {
    Interval.WEEKLY: 52,
    Interval.MONTHLY: 12,
    Interval.QUARTERLY: 4,
    Interval.YEARLY: 1,
}


def yearly_estimate(rule: RecurringRule) -> int:
    return rule.amount_minor * _PER_YEAR[rule.interval]


def monthly_estimate(rule: RecurringRule) -> int:
    """Auf den Monat heruntergerechnet. Kaufmaennisch gerundet, es ist eine Schaetzung."""
    total = yearly_estimate(rule)
    sign = -1 if total < 0 else 1
    return sign * ((abs(total) + 6) // 12)


@dataclass(frozen=True, slots=True)
class RuleOccurrence:
    rule_id: int
    due_date: dt.date
    status: str
    transaction_id: int | None = None
    booked_amount_minor: int | None = None
    booked_date: dt.date | None = None


def occurrences_for_period(
    db: Session,
    household_id: int,
    start: dt.date,
    end: dt.date,
    rule_ids: list[int] | None = None,
) -> list[RuleOccurrence]:
    """Alle Faelligkeiten im Zeitraum mit ihrem Ist-Zustand.

    Eine Regel bucht nie von selbst -- ``OPEN`` bedeutet: wartet auf Bestaetigung.
    """
    query = select(RecurringRule).where(
        RecurringRule.household_id == household_id, RecurringRule.is_active.is_(True)
    )
    if rule_ids is not None:
        query = query.where(RecurringRule.id.in_(rule_ids))
    rules = list(db.scalars(query.order_by(RecurringRule.id)))
    if not rules:
        return []

    ids = [rule.id for rule in rules]
    booked = {
        (rule_id, occurrence_date): (txn_id, amount, date)
        for rule_id, occurrence_date, txn_id, amount, date in db.execute(
            select(
                Transaction.recurring_rule_id,
                Transaction.recurring_occurrence_date,
                Transaction.id,
                Transaction.amount_minor,
                Transaction.date,
            ).where(
                Transaction.recurring_rule_id.in_(ids),
                Transaction.recurring_occurrence_date.is_not(None),
            )
        ).all()
    }
    skipped = {
        (rule_id, occurrence_date)
        for rule_id, occurrence_date in db.execute(
            select(RecurringSkip.rule_id, RecurringSkip.occurrence_date).where(
                RecurringSkip.rule_id.in_(ids)
            )
        ).all()
    }

    result: list[RuleOccurrence] = []
    for rule in rules:
        for due in occurrences(rule, start, end):
            key = (rule.id, due)
            if key in booked:
                txn_id, amount, date = booked[key]
                result.append(RuleOccurrence(rule.id, due, CONFIRMED, txn_id, amount, date))
            elif key in skipped:
                result.append(RuleOccurrence(rule.id, due, SKIPPED))
            else:
                result.append(RuleOccurrence(rule.id, due, OPEN))
    result.sort(key=lambda item: (item.due_date, item.rule_id))
    return result


def stale_since_months(db: Session, rule: RecurringRule, today: dt.date) -> int:
    """Wie viele faellige Termine in Folge zuletzt weder gebucht noch uebersprungen wurden.

    Hoher Wert bei einem Abo heisst meistens: vergessen zu kuendigen.
    """
    lookback_index = today.year * 12 + (today.month - 1) - 23
    start = dt.date(lookback_index // 12, lookback_index % 12 + 1, 1)
    history = occurrences_for_period(db, rule.household_id, start, today, [rule.id])
    streak = 0
    for entry in reversed(history):
        if entry.status == OPEN:
            streak += 1
        else:
            break
    return streak
