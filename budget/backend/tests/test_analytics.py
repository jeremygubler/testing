"""Kennzahlen, Budgetaufloesung und der Ausgleich ueber die API."""

import datetime as dt

import pytest

from app.enums import CategoryGroup
from app.models import Transaction, TransactionSplit
from app.services.analytics import month_summary, resolve_budgets


@pytest.fixture
def book(db, household, accounts, categories, members):
    """Hilfsfunktion: Buchung mit Splits anlegen.

    Buchungen der Gruppe SPAREN werden zu Umbuchungen aufs Sparkonto -- so, wie es
    die Anwendung seit den Konten tut.
    """

    def _book(category: str, day: int, amounts: dict[int, int], month: int = 3, year: int = 2026):
        is_saving = categories[category].group is CategoryGroup.SPAREN
        txn = Transaction(
            household_id=household.id,
            date=dt.date(year, month, day),
            category_id=categories[category].id,
            account_id=accounts["Hauptkonto"].id,
            counter_account_id=accounts["Sparkonto"].id if is_saving else None,
            description=category,
        )
        db.add(txn)
        db.flush()
        for member_id, amount in amounts.items():
            db.add(TransactionSplit(txn_id=txn.id, member_id=member_id, amount_minor=amount))
        db.flush()
        return txn

    return _book


def test_month_summary_computes_the_headline_figures(db, household, categories, members, book):
    anna, ben = members
    book("Lohn", 25, {anna.id: 600_000})
    book("Lohn", 25, {ben.id: 400_000})
    book("Miete", 1, {anna.id: 120_000, ben.id: 80_000})
    book("Lebensmittel", 5, {anna.id: 30_000, ben.id: 20_000})
    book("Sparkonto", 26, {anna.id: 60_000, ben.id: 40_000})

    summary = month_summary(db, household, 2026, 3)
    assert summary.income_minor == 1_000_000
    # Sparen ist seit den Konten keine Ausgabe mehr, sondern eine Umbuchung.
    assert summary.expense_minor == 250_000
    assert summary.balance_minor == 750_000
    assert summary.savings_minor == 100_000
    assert summary.savings_ratio == pytest.approx(0.1)
    assert summary.fixed_cost_ratio == pytest.approx(0.2)


def test_available_includes_opening_balance_and_all_previous_months(db, household, book, members):
    anna, _ = members
    book("Lohn", 10, {anna.id: 100_000}, month=1)
    book("Miete", 10, {anna.id: 40_000}, month=2)
    book("Lebensmittel", 10, {anna.id: 10_000}, month=3)

    summary = month_summary(db, household, 2026, 3)
    # Startsaldo des Hauptkontos 100'000 + 100'000 - 40'000 - 10'000
    assert summary.available_minor == 150_000
    assert month_summary(db, household, 2026, 2).available_minor == 160_000


def test_ratios_are_none_without_income(db, household, book, members):
    anna, _ = members
    book("Lebensmittel", 5, {anna.id: 10_000})
    summary = month_summary(db, household, 2026, 3)
    # Ohne Einnahmen ist die Sparquote unbestimmt -- nicht 0 %.
    assert summary.savings_ratio is None
    assert summary.fixed_cost_ratio is None


def test_per_member_figures_come_from_the_splits(db, household, book, members):
    anna, ben = members
    book("Lohn", 25, {anna.id: 600_000})
    book("Miete", 1, {anna.id: 120_000, ben.id: 80_000})

    summary = month_summary(db, household, 2026, 3)
    by_member = {figure.member_id: figure for figure in summary.members}
    assert by_member[anna.id].income_minor == 600_000
    assert by_member[anna.id].expense_minor == 120_000
    assert by_member[anna.id].balance_minor == 480_000
    assert by_member[ben.id].income_minor == 0
    assert by_member[ben.id].balance_minor == -80_000


def test_month_budget_overrides_the_default(client, categories):
    category_id = categories["Lebensmittel"].id
    assert (
        client.put(
            "/api/budgets", json={"category_id": category_id, "amount_minor": 90_000}
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/budgets",
            json={"category_id": category_id, "amount_minor": 120_000, "year": 2026, "month": 3},
        ).status_code
        == 200
    )

    march = client.get("/api/analytics/summary?year=2026&month=3").json()
    april = client.get("/api/analytics/summary?year=2026&month=4").json()
    by_id = {row["category_id"]: row for row in march["categories"]}
    assert by_id[category_id]["budget_minor"] == 120_000
    assert by_id[category_id]["budget_source"] == "MONTH"
    assert {row["category_id"]: row for row in april["categories"]}[category_id][
        "budget_source"
    ] == "DEFAULT"


def test_upsert_replaces_instead_of_duplicating(client, categories, db, household):
    category_id = categories["Lebensmittel"].id
    client.put("/api/budgets", json={"category_id": category_id, "amount_minor": 90_000})
    client.put("/api/budgets", json={"category_id": category_id, "amount_minor": 95_000})
    resolved = resolve_budgets(db, household.id, 2026, 3)
    assert resolved[category_id] == (95_000, "DEFAULT")
    assert len(client.get("/api/budgets").json()) == 1


def test_deleting_a_month_budget_falls_back_to_the_default(client, categories):
    category_id = categories["Lebensmittel"].id
    client.put("/api/budgets", json={"category_id": category_id, "amount_minor": 90_000})
    override = client.put(
        "/api/budgets",
        json={"category_id": category_id, "amount_minor": 120_000, "year": 2026, "month": 3},
    ).json()

    assert client.delete(f"/api/budgets/{override['id']}").status_code == 204
    march = client.get("/api/analytics/summary?year=2026&month=3").json()
    row = {entry["category_id"]: entry for entry in march["categories"]}[category_id]
    assert row["budget_minor"] == 90_000
    assert row["budget_source"] == "DEFAULT"


def test_category_without_budget_reports_none_not_zero(client, categories):
    march = client.get("/api/analytics/summary?year=2026&month=3").json()
    row = {entry["category_id"]: entry for entry in march["categories"]}[categories["Miete"].id]
    assert row["budget_minor"] is None
    assert row["usage"] is None
    assert row["difference_minor"] is None


def test_settlement_endpoint_recommends_concrete_payments(client, categories, members):
    anna, ben = members
    client.post(
        "/api/transactions",
        json={
            "date": "2026-03-05",
            "category_id": categories["Lebensmittel"].id,
            "description": "Grosseinkauf",
            "amount_minor": 100_000,
            "split": {"template": "SINGLE", "member_id": anna.id},
        },
    )
    result = client.get("/api/analytics/settlement?year=2026&month=3").json()
    assert result["basis"] == "WEIGHT"
    assert result["total_expense_minor"] == 100_000
    # Anna hat alles getragen, ihr Anteil waere 60 % -> Ben schuldet ihr 40 %.
    assert result["payments"] == [
        {"from_member_id": ben.id, "to_member_id": anna.id, "amount_minor": 40_000}
    ]


def test_settlement_by_income_uses_the_actual_income_share(client, categories, members):
    anna, ben = members
    client.patch("/api/household", json={"settlement_basis": "INCOME"})
    for member, amount in ((anna, 300_000), (ben, 100_000)):
        client.post(
            "/api/transactions",
            json={
                "date": "2026-03-25",
                "category_id": categories["Lohn"].id,
                "description": "Lohn",
                "amount_minor": amount,
                "split": {"template": "SINGLE", "member_id": member.id},
            },
        )
    client.post(
        "/api/transactions",
        json={
            "date": "2026-03-01",
            "category_id": categories["Miete"].id,
            "description": "Miete",
            "amount_minor": 200_000,
            "split": {"template": "EQUAL"},
        },
    )
    result = client.get("/api/analytics/settlement?year=2026&month=3").json()
    shares = {row["member_id"]: row["share_minor"] for row in result["balances"]}
    # Einkommensverhaeltnis 75/25 statt Schluessel 60/40.
    assert shares == {anna.id: 150_000, ben.id: 50_000}
    # Beide haben je 100'000 getragen; Annas Anteil waere 150'000 -> sie zahlt Ben 50'000.
    assert result["payments"] == [
        {"from_member_id": anna.id, "to_member_id": ben.id, "amount_minor": 50_000}
    ]


def test_trend_returns_a_point_per_month_even_without_bookings(client):
    points = client.get("/api/analytics/trend?year=2026&month=3&months=6").json()
    assert len(points) == 6
    assert [(p["year"], p["month"]) for p in points] == [
        (2025, 10),
        (2025, 11),
        (2025, 12),
        (2026, 1),
        (2026, 2),
        (2026, 3),
    ]
    assert all(point["balance_minor"] == 0 for point in points)


def test_trend_sums_match_the_month_summary(client, categories, members):
    anna, _ = members
    client.post(
        "/api/transactions",
        json={
            "date": "2026-03-25",
            "category_id": categories["Lohn"].id,
            "description": "Lohn",
            "amount_minor": 500_000,
            "split": {"template": "SINGLE", "member_id": anna.id},
        },
    )
    # Sparen ist eine Umbuchung aufs Sparkonto, keine Ausgabe.
    savings_account = next(a for a in client.get("/api/accounts").json() if a["kind"] == "SAVINGS")
    client.post(
        "/api/transactions",
        json={
            "date": "2026-03-26",
            "category_id": categories["Sparkonto"].id,
            "counter_account_id": savings_account["id"],
            "description": "Sparen",
            "amount_minor": 80_000,
            "split": {"template": "SINGLE", "member_id": anna.id},
        },
    )
    summary = client.get("/api/analytics/summary?year=2026&month=3").json()
    point = client.get("/api/analytics/trend?year=2026&month=3&months=1").json()[0]
    assert point["income_minor"] == summary["income_minor"]
    assert point["expense_minor"] == summary["expense_minor"]
    assert point["balance_minor"] == summary["balance_minor"]
    assert point["savings_minor"] == 80_000
    # Die Umbuchung verlaesst das verfuegbare Geld. Aufaddierte Salden wuerden das
    # uebersehen und die Verlaufslinie von der Kennzahl der Uebersicht wegtreiben.
    assert point["available_minor"] == summary["available_minor"]
    assert point["available_minor"] == 100_000 + 500_000 - 80_000


# ------------------------------------------------------------- Budgetvorschlaege


def _book(client, categories, member_id, category: str, day: int, month: int, amount: int):
    return client.post(
        "/api/transactions",
        json={
            "date": f"2026-{month:02d}-{day:02d}",
            "category_id": categories[category].id,
            "description": category,
            "amount_minor": amount,
            "split": {"template": "SINGLE", "member_id": member_id},
        },
    )


def test_proposal_averages_completed_months_only(client, categories, members):
    anna, _ = members
    # Januar 100, Februar 200, Maerz (laufender Monat) nur 10 -- der Schnitt der
    # abgeschlossenen Monate ist 150, nicht 103.
    _book(client, categories, anna.id, "Lebensmittel", 10, 1, 10_000)
    _book(client, categories, anna.id, "Lebensmittel", 10, 2, 20_000)
    _book(client, categories, anna.id, "Lebensmittel", 10, 3, 1_000)

    proposal = client.get("/api/budgets/proposal?year=2026&month=3&source=AVERAGE&months=2").json()
    row = next(r for r in proposal["rows"] if r["category_id"] == categories["Lebensmittel"].id)
    assert row["proposed_minor"] == 15_000
    assert row["based_on_months"] == 2


def test_proposal_from_last_month(client, categories, members):
    anna, _ = members
    _book(client, categories, anna.id, "Lebensmittel", 10, 1, 10_000)
    _book(client, categories, anna.id, "Lebensmittel", 10, 2, 20_000)

    proposal = client.get("/api/budgets/proposal?year=2026&month=3&source=LAST_MONTH").json()
    row = next(r for r in proposal["rows"] if r["category_id"] == categories["Lebensmittel"].id)
    assert row["proposed_minor"] == 20_000
    assert row["based_on_months"] == 1


def test_proposal_rounds_to_whole_currency_units(client, categories, members):
    anna, _ = members
    _book(client, categories, anna.id, "Lebensmittel", 10, 2, 94_783)
    proposal = client.get("/api/budgets/proposal?year=2026&month=3&source=LAST_MONTH").json()
    row = next(r for r in proposal["rows"] if r["category_id"] == categories["Lebensmittel"].id)
    # 947.83 waere eine Genauigkeit, die es nicht gibt.
    assert row["proposed_minor"] == 94_800


def test_proposal_shows_the_current_budget_for_comparison(client, categories):
    client.put(
        "/api/budgets", json={"category_id": categories["Miete"].id, "amount_minor": 210_000}
    )
    proposal = client.get("/api/budgets/proposal?year=2026&month=3").json()
    row = next(r for r in proposal["rows"] if r["category_id"] == categories["Miete"].id)
    assert row["current_minor"] == 210_000
    assert row["proposed_minor"] == 0


def test_proposal_writes_nothing(client, categories, members):
    anna, _ = members
    _book(client, categories, anna.id, "Lebensmittel", 10, 2, 20_000)
    client.get("/api/budgets/proposal?year=2026&month=3")
    assert client.get("/api/budgets").json() == []


def test_bulk_upsert_applies_a_proposal(client, categories):
    entries = [
        {"category_id": categories["Lebensmittel"].id, "amount_minor": 95_000},
        {"category_id": categories["Miete"].id, "amount_minor": 210_000},
    ]
    response = client.put("/api/budgets/bulk", json={"entries": entries})
    assert response.status_code == 200
    assert len(response.json()) == 2

    summary = client.get("/api/analytics/summary?year=2026&month=3").json()
    by_id = {row["category_id"]: row for row in summary["categories"]}
    assert by_id[categories["Miete"].id]["budget_minor"] == 210_000
    assert by_id[categories["Miete"].id]["budget_source"] == "DEFAULT"


def test_bulk_upsert_can_target_a_single_month(client, categories):
    client.put(
        "/api/budgets", json={"category_id": categories["Miete"].id, "amount_minor": 200_000}
    )
    client.put(
        "/api/budgets/bulk",
        json={
            "entries": [{"category_id": categories["Miete"].id, "amount_minor": 250_000}],
            "year": 2026,
            "month": 3,
        },
    )
    march = client.get("/api/analytics/summary?year=2026&month=3").json()
    april = client.get("/api/analytics/summary?year=2026&month=4").json()
    assert {r["category_id"]: r for r in march["categories"]}[categories["Miete"].id][
        "budget_minor"
    ] == 250_000
    assert {r["category_id"]: r for r in april["categories"]}[categories["Miete"].id][
        "budget_minor"
    ] == 200_000


def test_proposal_divides_by_months_with_data_not_by_window_width(client, categories, members):
    """Wer die App seit zwei Monaten benutzt und ein Halbjahr waehlt, darf nicht die
    halbe Miete vorgeschlagen bekommen. Monate vor der ersten Buchung sind keine
    Monate ohne Ausgaben, sondern Monate ohne Daten."""
    anna, _ = members
    _book(client, categories, anna.id, "Miete", 1, 1, 200_000)
    _book(client, categories, anna.id, "Miete", 1, 2, 200_000)

    proposal = client.get("/api/budgets/proposal?year=2026&month=3&source=AVERAGE&months=6").json()
    row = next(r for r in proposal["rows"] if r["category_id"] == categories["Miete"].id)
    assert row["proposed_minor"] == 200_000
    assert row["based_on_months"] == 2


def test_a_category_without_spending_in_a_recorded_month_counts_as_zero(
    client, categories, members
):
    """Innerhalb der Monate, in denen gebucht wurde, ist eine leere Kategorie eine
    echte Null -- nicht fehlende Daten."""
    anna, _ = members
    _book(client, categories, anna.id, "Miete", 1, 1, 200_000)
    _book(client, categories, anna.id, "Miete", 1, 2, 200_000)
    _book(client, categories, anna.id, "Lebensmittel", 5, 2, 60_000)

    proposal = client.get("/api/budgets/proposal?year=2026&month=3&source=AVERAGE&months=6").json()
    row = next(r for r in proposal["rows"] if r["category_id"] == categories["Lebensmittel"].id)
    assert row["proposed_minor"] == 30_000  # 600 in zwei erfassten Monaten
