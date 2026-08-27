"""Faelligkeiten wiederkehrender Regeln.

Wichtig: Regeln erzeugen **Vorschlaege**, niemals automatisch Buchungen. Die
Materialisierung passiert erst, wenn der Nutzer bestaetigt (siehe routers/recurring.py).
"""

from __future__ import annotations

import calendar
import datetime as dt
from dataclasses import dataclass

from app.enums import Interval
from app.models import RecurringRule

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


@dataclass(frozen=True, slots=True)
class Occurrence:
    rule_id: int
    due_date: dt.date
    status: str  # OPEN | CONFIRMED | SKIPPED
    transaction_id: int | None = None
