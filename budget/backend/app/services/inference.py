"""Kategorie aus der Beschreibung erraten.

Der Haushalt bucht dieselben Dinge immer wieder: "Coop", "Migros", "SBB". Wer das
zwoelfmal derselben Kategorie zugeordnet hat, soll es nicht ein dreizehntes Mal tun
muessen. Geraten wird nur aus der eigenen Historie -- es gibt keine mitgelieferte
Haendlerliste, die bei einem Schweizer Quartierladen ohnehin danebenlaege.

Der Vorschlag wird nie stillschweigend angewendet: die Oberflaeche zeigt ihn an, der
Import weist ihn als "aus Historie" aus.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category, Transaction

#: Woerter, die nichts ueber die Kategorie aussagen.
_NOISE = re.compile(r"\b(?:\d+|nr|no|ref|kartenzahlung|einkauf|zahlung|filiale)\b", re.I)


def normalize(text: str) -> str:
    cleaned = _NOISE.sub(" ", text or "").casefold()
    return re.sub(r"[^\w\s]+", " ", cleaned, flags=re.UNICODE).strip()


def _tokens(text: str) -> list[str]:
    return [token for token in normalize(text).split() if len(token) >= 3]


@dataclass(frozen=True, slots=True)
class Suggestion:
    category_id: int
    category_name: str
    #: Wie oft diese Kategorie fuer aehnliche Beschreibungen verwendet wurde.
    matches: int
    #: EXACT = identische Beschreibung, TOKEN = gemeinsames Stichwort.
    basis: str


def suggest_category(
    db: Session, household_id: int, description: str, limit: int = 400
) -> Suggestion | None:
    """Beste Kategorie fuer eine Beschreibung, oder ``None``.

    Zuerst wird nach identischer Beschreibung gesucht; erst wenn das nichts ergibt,
    nach gemeinsamen Stichwoertern. Eine exakte Uebereinstimmung ist ein starkes
    Signal, ein geteiltes Wort nur ein schwaches.
    """
    needle = normalize(description)
    if not needle:
        return None

    rows = db.execute(
        select(Transaction.description, Transaction.category_id, Category.name)
        .join(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.household_id == household_id,
            Transaction.description != "",
            Category.is_active.is_(True),
        )
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(limit)
    ).all()
    if not rows:
        return None

    exact: dict[int, tuple[int, str]] = {}
    token_hits: dict[int, tuple[int, str]] = {}
    needle_tokens = set(_tokens(description))

    for existing, category_id, category_name in rows:
        other = normalize(existing)
        if other == needle:
            count, _ = exact.get(category_id, (0, category_name))
            exact[category_id] = (count + 1, category_name)
        elif needle_tokens and needle_tokens & set(_tokens(existing)):
            count, _ = token_hits.get(category_id, (0, category_name))
            token_hits[category_id] = (count + 1, category_name)

    for candidates, basis in ((exact, "EXACT"), (token_hits, "TOKEN")):
        if not candidates:
            continue
        category_id, (count, name) = max(candidates.items(), key=lambda item: (item[1][0], -item[0]))
        return Suggestion(category_id=category_id, category_name=name, matches=count, basis=basis)
    return None


def suggest_many(
    db: Session, household_id: int, descriptions: list[str]
) -> dict[str, Suggestion]:
    """Vorschlaege fuer viele Beschreibungen -- fuer den Import, ohne N Abfragen."""
    unique = {normalize(text): text for text in descriptions if normalize(text)}
    if not unique:
        return {}

    rows = db.execute(
        select(Transaction.description, Transaction.category_id, Category.name)
        .join(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.household_id == household_id,
            Transaction.description != "",
            Category.is_active.is_(True),
        )
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(2000)
    ).all()
    if not rows:
        return {}

    history = [(normalize(desc), set(_tokens(desc)), cat_id, cat_name) for desc, cat_id, cat_name in rows]
    result: dict[str, Suggestion] = {}

    for key, original in unique.items():
        needle_tokens = set(_tokens(original))
        exact: dict[int, tuple[int, str]] = {}
        token_hits: dict[int, tuple[int, str]] = {}
        for other, other_tokens, category_id, category_name in history:
            if other == key:
                count, _ = exact.get(category_id, (0, category_name))
                exact[category_id] = (count + 1, category_name)
            elif needle_tokens and needle_tokens & other_tokens:
                count, _ = token_hits.get(category_id, (0, category_name))
                token_hits[category_id] = (count + 1, category_name)
        for candidates, basis in ((exact, "EXACT"), (token_hits, "TOKEN")):
            if candidates:
                category_id, (count, name) = max(
                    candidates.items(), key=lambda item: (item[1][0], -item[0])
                )
                result[key] = Suggestion(category_id, name, count, basis)
                break
    return result
