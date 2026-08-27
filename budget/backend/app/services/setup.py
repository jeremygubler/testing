"""Erstinbetriebnahme: einen leeren Haushalt anlegen.

Ohne Kategorien laesst sich nichts erfassen, deshalb bringt ein neuer Haushalt einen
kleinen, sofort brauchbaren Satz mit. Er ist bewusst kurz -- ergaenzen ist leichter als
aufraeumen.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.enums import GROUP_FLOW, CategoryGroup, SettlementBasis
from app.models import Category, Household, Member

STARTER_CATEGORIES: list[tuple[str, CategoryGroup, str, str]] = [
    ("Lohn", CategoryGroup.EINKOMMEN, "briefcase", "#0f766e"),
    ("Weitere Einnahmen", CategoryGroup.EINKOMMEN, "coins", "#155e75"),
    ("Miete", CategoryGroup.FIXKOSTEN, "home", "#1e3a5f"),
    ("Krankenkasse", CategoryGroup.FIXKOSTEN, "heart-pulse", "#334155"),
    ("Strom & Wasser", CategoryGroup.FIXKOSTEN, "zap", "#3f3f46"),
    ("Internet & Handy", CategoryGroup.FIXKOSTEN, "wifi", "#44403c"),
    ("Versicherungen", CategoryGroup.FIXKOSTEN, "shield", "#4b5563"),
    ("Abos", CategoryGroup.FIXKOSTEN, "tv", "#57534e"),
    ("Lebensmittel", CategoryGroup.VARIABEL, "shopping-cart", "#b45309"),
    ("Restaurant", CategoryGroup.VARIABEL, "utensils", "#c2410c"),
    ("Haushalt", CategoryGroup.VARIABEL, "sofa", "#a16207"),
    ("Freizeit", CategoryGroup.VARIABEL, "ticket", "#7c2d12"),
    ("Mobilitaet", CategoryGroup.VARIABEL, "car", "#78350f"),
    ("Gesundheit", CategoryGroup.VARIABEL, "pill", "#854d0e"),
    ("Sparkonto", CategoryGroup.SPAREN, "piggy-bank", "#166534"),
    ("Vorsorge", CategoryGroup.SPAREN, "landmark", "#15803d"),
    ("Kredite", CategoryGroup.SCHULDEN, "banknote", "#7f1d1d"),
]

MEMBER_COLORS = ["#2563eb", "#c2410c", "#0f766e", "#7c3aed", "#b45309", "#be123c"]


def create_household(
    db: Session,
    *,
    name: str,
    currency: str,
    locale: str,
    timezone: str,
    opening_balance_minor: int,
    member_names: list[str],
    with_starter_categories: bool = True,
) -> Household:
    household = Household(
        id=get_settings().single_household_id,
        name=name,
        currency=currency,
        locale=locale,
        timezone=timezone,
        opening_balance_minor=opening_balance_minor,
        settlement_basis=SettlementBasis.WEIGHT,
    )
    db.add(household)
    db.flush()

    for index, member_name in enumerate(member_names):
        db.add(
            Member(
                household_id=household.id,
                name=member_name,
                color=MEMBER_COLORS[index % len(MEMBER_COLORS)],
                sort_order=index,
                share_weight=1,
            )
        )

    if with_starter_categories:
        for order, (category_name, group, icon, color) in enumerate(STARTER_CATEGORIES):
            db.add(
                Category(
                    household_id=household.id,
                    name=category_name,
                    flow=GROUP_FLOW[group],
                    group=group,
                    icon=icon,
                    color=color,
                    sort_order=order,
                )
            )

    db.flush()
    return household


def household_exists(db: Session) -> bool:
    return db.scalar(select(Household.id).limit(1)) is not None
