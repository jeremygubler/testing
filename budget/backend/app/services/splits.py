"""Aufteilungsvorlagen.

Vorlagen sind ausschliesslich ein Eingabe-Helfer: aufgeloest wird immer sofort in
konkrete Betraege. Gespeichert werden nur die Splits, damit eine spaetere Aenderung
am Verteilschluessel alte Buchungen nicht rueckwirkend verfaelscht.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.enums import SplitTemplate
from app.models import Member
from app.services.money import allocate


class SplitError(ValueError):
    """Fachlicher Fehler bei der Aufteilung (fuehrt im API-Layer zu HTTP 422)."""


@dataclass(frozen=True, slots=True)
class SplitLine:
    member_id: int
    amount_minor: int


def _ordered(members: list[Member]) -> list[Member]:
    return sorted(members, key=lambda m: (m.sort_order, m.id))


def build_splits(
    template: SplitTemplate,
    total_minor: int,
    members: list[Member],
    *,
    single_member_id: int | None = None,
    manual: list[SplitLine] | None = None,
) -> list[SplitLine]:
    """Loest eine Vorlage in konkrete Splits auf.

    ``members`` sind die **aktiven** Personen des Haushalts; deaktivierte Personen
    bekommen keine neuen Splits mehr, behalten ihre alten aber.
    """
    if total_minor == 0:
        raise SplitError("Der Betrag darf nicht 0 sein.")

    if template is SplitTemplate.SINGLE:
        if single_member_id is None:
            raise SplitError("Fuer die Vorlage 'Eine Person' fehlt die Person.")
        if single_member_id not in {m.id for m in members}:
            raise SplitError("Die gewaehlte Person gehoert nicht zu den aktiven Personen.")
        return [SplitLine(single_member_id, total_minor)]

    if template is SplitTemplate.EQUAL:
        active = _ordered(members)
        if not active:
            raise SplitError("Der Haushalt hat keine aktiven Personen.")
        amounts = allocate(total_minor, [1] * len(active))
        return [SplitLine(m.id, a) for m, a in zip(active, amounts, strict=True)]

    if template is SplitTemplate.KEY:
        active = _ordered(members)
        if not active:
            raise SplitError("Der Haushalt hat keine aktiven Personen.")
        weights = [m.share_weight for m in active]
        if sum(weights) <= 0:
            raise SplitError("Der Verteilschluessel des Haushalts ist leer.")
        amounts = allocate(total_minor, weights)
        return [SplitLine(m.id, a) for m, a in zip(active, amounts, strict=True) if a != 0]

    if template is SplitTemplate.MANUAL:
        if not manual:
            raise SplitError("Fuer die manuelle Aufteilung fehlen die Betraege.")
        lines = [line for line in manual if line.amount_minor != 0]
        if not lines:
            raise SplitError("Mindestens ein Split muss einen Betrag ungleich 0 haben.")
        validate(total_minor, lines)
        return lines

    raise SplitError(f"Unbekannte Aufteilungsvorlage: {template}")


def validate(total_minor: int, lines: list[SplitLine]) -> None:
    """Prueft die Invarianten, die auch die DB-Trigger erzwingen -- nur mit besserer Meldung."""
    if not lines:
        raise SplitError("Eine Buchung braucht mindestens einen Split.")
    if any(line.amount_minor == 0 for line in lines):
        raise SplitError("Ein Split mit Betrag 0 ist nicht zulaessig.")
    signs = {line.amount_minor > 0 for line in lines}
    if len(signs) > 1:
        raise SplitError("Alle Splits einer Buchung muessen dasselbe Vorzeichen haben.")
    seen: set[int] = set()
    for line in lines:
        if line.member_id in seen:
            raise SplitError("Pro Person ist hoechstens ein Split je Buchung erlaubt.")
        seen.add(line.member_id)
    actual = sum(line.amount_minor for line in lines)
    if actual != total_minor:
        raise SplitError(
            f"Die Summe der Splits ({actual}) entspricht nicht dem Betrag ({total_minor})."
        )


def total_of(lines: list[SplitLine]) -> int:
    return sum(line.amount_minor for line in lines)
