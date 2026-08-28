"""Zeitbezug des Haushalts.

Bisher war ``Household.timezone`` ein totes Feld: gespeichert, exportiert, nie benutzt.
Wer den Server in einer anderen Zeitzone betreibt als den Haushalt -- ein NAS in der
Cloud, ein Hoster in den USA -- bekam sonst am Monatsanfang und -ende ein "heute",
das um einen Tag daneben lag.
"""

from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.models import Household


def household_now(household: Household) -> dt.datetime:
    try:
        zone = ZoneInfo(household.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        # Eine unbekannte Zeitzone darf die App nicht lahmlegen.
        return dt.datetime.now()
    return dt.datetime.now(zone)


def household_today(household: Household) -> dt.date:
    """Das heutige Datum aus Sicht des Haushalts, nicht des Servers."""
    return household_now(household).date()
