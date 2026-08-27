"""Konten und Umbuchungen.

Der Kern: eine Umbuchung ist weder Einnahme noch Ausgabe. Sie veraendert
Kontostaende, aber nicht das, was der Haushalt insgesamt hat.
"""

import pytest


def savings_account(client) -> dict:
    return next(a for a in client.get("/api/accounts").json() if a["kind"] == "SAVINGS")


def main_account(client) -> dict:
    return next(a for a in client.get("/api/accounts").json() if a["kind"] == "CHECKING")


def book(client, categories, member_id, category, amount, day=5, month=3, **extra):
    payload = {
        "date": f"2026-{month:02d}-{day:02d}",
        "category_id": categories[category].id,
        "description": category,
        "amount_minor": amount,
        "split": {"template": "SINGLE", "member_id": member_id},
    }
    payload.update(extra)
    return client.post("/api/transactions", json=payload)


def balances(client) -> dict[str, dict]:
    return {row["name"]: row for row in client.get("/api/accounts/balances").json()}


# ---------------------------------------------------------------- Kontostaende


def test_balance_starts_at_the_opening_amount(client):
    assert balances(client)["Hauptkonto"]["balance_minor"] == 100_000
    assert balances(client)["Sparkonto"]["balance_minor"] == 0


def test_income_and_expense_move_the_account(client, categories, members):
    anna, _ = members
    book(client, categories, anna.id, "Lohn", 500_000, day=25)
    book(client, categories, anna.id, "Lebensmittel", 20_000)

    assert balances(client)["Hauptkonto"]["balance_minor"] == 580_000


def test_a_transfer_moves_money_without_changing_the_total(client, categories, members):
    anna, _ = members
    before = client.get("/api/analytics/summary?year=2026&month=3").json()

    book(
        client,
        categories,
        anna.id,
        "Sparkonto",
        60_000,
        day=26,
        counter_account_id=savings_account(client)["id"],
    )

    after = client.get("/api/analytics/summary?year=2026&month=3").json()
    rows = balances(client)
    assert rows["Hauptkonto"]["balance_minor"] == 40_000
    assert rows["Sparkonto"]["balance_minor"] == 60_000
    # Weder Einnahme noch Ausgabe -- das Geld hat nur den Topf gewechselt.
    assert after["income_minor"] == before["income_minor"]
    assert after["expense_minor"] == before["expense_minor"]
    assert after["balance_minor"] == before["balance_minor"]
    assert after["net_worth_minor"] == before["net_worth_minor"]


def test_a_transfer_lowers_available_but_not_net_worth(client, categories, members):
    """Das Sparkonto zaehlt zum Vermoegen, aber nicht zum frei Verfuegbaren."""
    anna, _ = members
    before = client.get("/api/analytics/summary?year=2026&month=3").json()
    book(
        client,
        categories,
        anna.id,
        "Sparkonto",
        60_000,
        day=26,
        counter_account_id=savings_account(client)["id"],
    )
    after = client.get("/api/analytics/summary?year=2026&month=3").json()

    assert after["available_minor"] == before["available_minor"] - 60_000
    assert after["net_worth_minor"] == before["net_worth_minor"]


def test_savings_rate_counts_transfers_to_savings_accounts(client, categories, members):
    anna, _ = members
    book(client, categories, anna.id, "Lohn", 500_000, day=25)
    book(
        client,
        categories,
        anna.id,
        "Sparkonto",
        50_000,
        day=26,
        counter_account_id=savings_account(client)["id"],
    )

    summary = client.get("/api/analytics/summary?year=2026&month=3").json()
    assert summary["savings_minor"] == 50_000
    assert summary["savings_ratio"] == pytest.approx(0.1)
    # Sparen mindert den Saldo nicht mehr.
    assert summary["balance_minor"] == 500_000


def test_an_expense_on_a_savings_category_is_not_a_transfer(client, categories, members):
    """Ohne Gegenkonto bleibt es eine Ausgabe -- die Kategorie allein entscheidet nicht."""
    anna, _ = members
    book(client, categories, anna.id, "Sparkonto", 50_000, day=26)
    summary = client.get("/api/analytics/summary?year=2026&month=3").json()
    assert summary["savings_minor"] == 0
    assert summary["expense_minor"] == 50_000


# ---------------------------------------------------------------- Regeln


def test_transfer_needs_two_different_accounts(client, categories, members):
    anna, _ = members
    response = book(
        client,
        categories,
        anna.id,
        "Sparkonto",
        1000,
        counter_account_id=main_account(client)["id"],
    )
    assert response.status_code == 422
    assert "zwei verschiedene Konten" in response.json()["detail"]


def test_unknown_account_is_rejected(client, categories, members):
    anna, _ = members
    assert (
        book(client, categories, anna.id, "Lebensmittel", 1000, account_id=9999).status_code == 422
    )


def test_booking_without_account_uses_the_first_active_one(client, categories, members):
    anna, _ = members
    created = book(client, categories, anna.id, "Lebensmittel", 1000).json()
    assert created["account_id"] == main_account(client)["id"]
    assert created["is_transfer"] is False


def test_deactivated_account_cannot_be_booked_on(client, categories, members, accounts):
    anna, _ = members
    savings = savings_account(client)
    client.patch(f"/api/accounts/{savings['id']}", json={"is_active": False})
    response = book(
        client, categories, anna.id, "Sparkonto", 1000, counter_account_id=savings["id"]
    )
    assert response.status_code == 422
    assert "deaktiviert" in response.json()["detail"]


# ---------------------------------------------------------------- Kontenpflege


def test_account_names_are_unique(client):
    assert client.post("/api/accounts", json={"name": "Hauptkonto"}).status_code == 409


def test_unused_account_can_be_removed_but_a_used_one_is_deactivated(client, categories, members):
    anna, _ = members
    created = client.post("/api/accounts", json={"name": "Bargeld", "kind": "CASH"}).json()
    assert client.delete(f"/api/accounts/{created['id']}").status_code == 200
    assert all(a["name"] != "Bargeld" for a in client.get("/api/accounts").json())

    used = client.post("/api/accounts", json={"name": "Kreditkarte", "kind": "CREDIT_CARD"}).json()
    book(client, categories, anna.id, "Lebensmittel", 1000, account_id=used["id"])
    assert client.delete(f"/api/accounts/{used['id']}").status_code == 200
    remaining = {a["name"]: a for a in client.get("/api/accounts").json()}
    assert remaining["Kreditkarte"]["is_active"] is False


def test_the_last_active_account_is_protected(client):
    savings = savings_account(client)
    client.delete(f"/api/accounts/{savings['id']}")
    response = client.delete(f"/api/accounts/{main_account(client)['id']}")
    assert response.status_code == 422


def test_opening_balance_lives_on_the_account_not_the_household(client):
    assert "opening_balance_minor" not in client.get("/api/household").json()
    client.patch(
        f"/api/accounts/{main_account(client)['id']}", json={"opening_balance_minor": 7_000}
    )
    assert balances(client)["Hauptkonto"]["balance_minor"] == 7_000


# ---------------------------------------------------------------- Filter und Export


def test_transactions_can_be_filtered_by_account_and_transfer(client, categories, members):
    anna, _ = members
    book(client, categories, anna.id, "Lebensmittel", 1000)
    book(
        client,
        categories,
        anna.id,
        "Sparkonto",
        2000,
        day=26,
        counter_account_id=savings_account(client)["id"],
    )

    assert client.get("/api/transactions").json()["total"] == 2
    assert client.get("/api/transactions?transfers=true").json()["total"] == 1
    assert client.get("/api/transactions?transfers=false").json()["total"] == 1
    # Ein Konto findet auch die Umbuchungen, die darauf zeigen.
    savings_id = savings_account(client)["id"]
    assert client.get(f"/api/transactions?account_id={savings_id}").json()["total"] == 1


def test_csv_export_names_both_accounts(client, categories, members):
    anna, _ = members
    book(
        client,
        categories,
        anna.id,
        "Sparkonto",
        2000,
        day=26,
        counter_account_id=savings_account(client)["id"],
    )
    text = client.get("/api/io/export/transactions.csv").text
    assert "konto;gegenkonto" in text
    assert "Hauptkonto;Sparkonto" in text


def test_backup_round_trip_keeps_accounts_and_transfers(client, categories, members):
    anna, _ = members
    book(
        client,
        categories,
        anna.id,
        "Sparkonto",
        2000,
        day=26,
        counter_account_id=savings_account(client)["id"],
    )
    before = balances(client)
    backup = client.get("/api/io/export/household.json").json()
    assert backup["version"] == 3

    client.post("/api/io/restore", json={"backup": backup, "confirm_replace": True})
    assert balances(client) == before
    assert client.get("/api/transactions?transfers=true").json()["total"] == 1


def test_a_savings_transfer_counts_towards_its_category_budget(
    client, categories, members, accounts
):
    """Wer 1'400 aufs Sparkonto budgetiert, will sehen, ob er 1'400 umgebucht hat.

    Die Umbuchung ist keine Ausgabe -- aber sie ist das, was auf der Kategorie
    passiert ist. Ohne das bliebe jedes Sparbudget fuer immer bei 0 % Nutzung.
    """
    anna, _ = members
    client.put(
        "/api/budgets",
        json={"category_id": categories["Sparkonto"].id, "amount_minor": 140_000},
    )
    client.post(
        "/api/transactions",
        json={
            "date": "2026-03-10",
            "category_id": categories["Sparkonto"].id,
            "counter_account_id": accounts["Sparkonto"].id,
            "description": "Sparen",
            "amount_minor": 140_000,
            "split": {"template": "SINGLE", "member_id": anna.id},
        },
    )

    summary = client.get("/api/analytics/summary?year=2026&month=3").json()
    figure = next(
        f for f in summary["categories"] if f["category_id"] == categories["Sparkonto"].id
    )
    assert figure["actual_minor"] == 140_000
    assert figure["budget_minor"] == 140_000
    assert figure["usage"] == 1.0

    sparen = next(g for g in summary["groups"] if g["group"] == "SPAREN")
    assert sparen["actual_minor"] == 140_000

    # Einnahmen, Ausgaben und Saldo bleiben davon unberuehrt.
    assert summary["expense_minor"] == 0
    assert summary["balance_minor"] == 0
    assert summary["savings_minor"] == 140_000
