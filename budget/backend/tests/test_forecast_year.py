"""Prognose, Vergleich mit dem Schnitt, Jahresuebersicht und Vermoegensverlauf."""

import pytest


def _book(client, categories, member_id, category, day, month, amount, year=2026):
    return client.post(
        "/api/transactions",
        json={
            "date": f"{year}-{month:02d}-{day:02d}",
            "category_id": categories[category].id,
            "description": category,
            "amount_minor": amount,
            "split": {"template": "SINGLE", "member_id": member_id},
        },
    )


def _rule(client, categories, category, amount, day=1):
    return client.post(
        "/api/recurring",
        json={
            "category_id": categories[category].id,
            "description": f"{category} monatlich",
            "amount_minor": amount,
            "interval": "MONTHLY",
            "day_of_period": day,
            "start_date": "2026-01-01",
            "split": {"template": "EQUAL"},
        },
    ).json()


# ------------------------------------------------------------------------ Prognose


def test_forecast_counts_only_open_suggestions(client, categories, members):
    anna, _ = members
    rule = _rule(client, categories, "Miete", 200_000)
    _rule(client, categories, "Lohn", 500_000, day=25)

    before = client.get("/api/analytics/forecast?year=2026&month=3").json()
    assert before["open_count"] == 2
    assert before["expected_expense_minor"] == 200_000
    assert before["expected_income_minor"] == 500_000
    assert before["projected_balance_minor"] == 300_000

    # Bestaetigte Vorschlaege sind im Ist enthalten und duerfen nicht doppelt zaehlen.
    client.post(
        "/api/recurring/occurrences/confirm",
        json={"occurrences": [{"rule_id": rule["id"], "due_date": "2026-03-01"}]},
    )
    after = client.get("/api/analytics/forecast?year=2026&month=3").json()
    assert after["open_count"] == 1
    assert after["expected_expense_minor"] == 0
    assert after["projected_balance_minor"] == 300_000
    del anna


def test_skipped_suggestions_drop_out_of_the_forecast(client, categories):
    rule = _rule(client, categories, "Miete", 200_000)
    client.post(
        "/api/recurring/occurrences/skip",
        json={"rule_id": rule["id"], "due_date": "2026-03-01"},
    )
    forecast = client.get("/api/analytics/forecast?year=2026&month=3").json()
    assert forecast["open_count"] == 0
    assert forecast["expected_expense_minor"] == 0


def test_forecast_without_rules_equals_the_current_state(client, categories, members):
    anna, _ = members
    _book(client, categories, anna.id, "Lebensmittel", 5, 3, 10_000)
    summary = client.get("/api/analytics/summary?year=2026&month=3").json()
    forecast = client.get("/api/analytics/forecast?year=2026&month=3").json()
    assert forecast["open_count"] == 0
    assert forecast["projected_balance_minor"] == summary["balance_minor"]
    assert forecast["projected_available_minor"] == summary["available_minor"]


# ----------------------------------------------------------------------- Vergleich


def test_comparison_uses_recorded_months_as_divisor(client, categories, members):
    anna, _ = members
    _book(client, categories, anna.id, "Lebensmittel", 5, 1, 60_000)
    _book(client, categories, anna.id, "Lebensmittel", 5, 2, 40_000)
    _book(client, categories, anna.id, "Lebensmittel", 5, 3, 80_000)

    rows = client.get("/api/analytics/comparison?year=2026&month=3&months=6").json()
    row = next(r for r in rows if r["category_id"] == categories["Lebensmittel"].id)
    assert row["actual_minor"] == 80_000
    assert row["average_minor"] == 50_000  # (600 + 400) / 2 erfasste Monate
    assert row["delta_minor"] == 30_000
    assert row["delta_ratio"] == pytest.approx(0.6)


def test_comparison_reports_no_ratio_without_history(client, categories, members):
    anna, _ = members
    _book(client, categories, anna.id, "Kredit", 5, 3, 10_000)
    rows = client.get("/api/analytics/comparison?year=2026&month=3").json()
    row = next(r for r in rows if r["category_id"] == categories["Kredit"].id)
    assert row["average_minor"] == 0
    # Ohne Vergangenheit gibt es keine Abweichung in Prozent, nur einen Betrag.
    assert row["delta_ratio"] is None
    assert row["delta_minor"] == 10_000


def test_comparison_skips_categories_without_any_numbers(client, categories, members):
    anna, _ = members
    _book(client, categories, anna.id, "Lebensmittel", 5, 3, 10_000)
    rows = client.get("/api/analytics/comparison?year=2026&month=3").json()
    names = {row["name"] for row in rows}
    assert "Lebensmittel" in names
    assert "Sparkonto" not in names


# ---------------------------------------------------------- Jahr und Vermoegen


def test_year_summary_covers_twelve_months(client, categories, members):
    anna, _ = members
    _book(client, categories, anna.id, "Lohn", 25, 1, 500_000)
    _book(client, categories, anna.id, "Lohn", 25, 7, 500_000)
    _book(client, categories, anna.id, "Lebensmittel", 5, 7, 20_000)

    year = client.get("/api/analytics/year?year=2026").json()
    assert len(year["months"]) == 12
    assert [m["month"] for m in year["months"]] == list(range(1, 13))
    assert [m["month"] for m in year["months"] if m["has_data"]] == [1, 7]
    assert year["income_minor"] == 1_000_000
    assert year["expense_minor"] == 20_000
    assert year["balance_minor"] == 980_000


def test_year_totals_match_the_sum_of_its_months(client, categories, members):
    anna, _ = members
    for month in (2, 5, 11):
        _book(client, categories, anna.id, "Lohn", 25, month, 300_000)
        _book(client, categories, anna.id, "Lebensmittel", 5, month, 50_000)

    year = client.get("/api/analytics/year?year=2026").json()
    assert sum(m["income_minor"] for m in year["months"]) == year["income_minor"]
    assert sum(m["expense_minor"] for m in year["months"]) == year["expense_minor"]
    assert sum(m["balance_minor"] for m in year["months"]) == year["balance_minor"]


def test_available_runs_on_across_the_trend(client, categories, members, household, db):
    """Der Vermoegensverlauf muss am Startsaldo anknuepfen und stetig fortlaufen."""
    anna, _ = members
    _book(client, categories, anna.id, "Lohn", 25, 1, 300_000)
    _book(client, categories, anna.id, "Lebensmittel", 5, 2, 50_000)

    points = client.get("/api/analytics/trend?year=2026&month=3&months=3").json()
    by_month = {p["month"]: p for p in points}
    # Startsaldo 100'000 aus der Fixture
    assert by_month[1]["available_minor"] == 400_000
    assert by_month[2]["available_minor"] == 350_000
    assert by_month[3]["available_minor"] == 350_000

    summary = client.get("/api/analytics/summary?year=2026&month=2").json()
    assert by_month[2]["available_minor"] == summary["available_minor"]


def test_trend_starts_from_the_balance_before_the_window(client, categories, members):
    """Ein Fenster, das spaeter beginnt, darf die Vorgeschichte nicht verlieren."""
    anna, _ = members
    _book(client, categories, anna.id, "Lohn", 25, 1, 300_000)
    _book(client, categories, anna.id, "Lohn", 25, 5, 100_000)

    points = client.get("/api/analytics/trend?year=2026&month=5&months=2").json()
    assert points[0]["month"] == 4
    # April selbst hat nichts, der Kontostand traegt Januar aber weiter.
    assert points[0]["available_minor"] == 400_000
    assert points[1]["available_minor"] == 500_000


def test_months_without_data_are_marked_as_such(client, categories, members):
    anna, _ = members
    _book(client, categories, anna.id, "Lohn", 25, 3, 100_000)
    points = client.get("/api/analytics/trend?year=2026&month=3&months=3").json()
    assert [p["has_data"] for p in points] == [False, False, True]
