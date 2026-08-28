"""Backup zurueckspielen und Haushalt leeren.

Beides ist nicht rueckgaengig zu machen -- entsprechend dicht getestet.
"""

import pytest


@pytest.fixture
def filled(client, categories, members):
    """Ein Haushalt mit Buchungen, Budget, Regel, Sparziel und Termin."""
    anna, ben = members
    client.post(
        "/api/transactions",
        json={
            "date": "2026-03-01",
            "category_id": categories["Miete"].id,
            "description": "Miete Maerz",
            "amount_minor": 200_000,
            "split": {"template": "KEY"},
        },
    )
    client.post(
        "/api/transactions",
        json={
            "date": "2026-03-05",
            "category_id": categories["Lebensmittel"].id,
            "description": "Einkauf",
            "amount_minor": 6543,
            "split": {"template": "SINGLE", "member_id": ben.id},
        },
    )
    client.put(
        "/api/budgets", json={"category_id": categories["Lebensmittel"].id, "amount_minor": 90_000}
    )
    client.post(
        "/api/recurring",
        json={
            "category_id": categories["Miete"].id,
            "description": "Miete",
            "amount_minor": 200_000,
            "interval": "MONTHLY",
            "day_of_period": 1,
            "start_date": "2026-01-01",
            "split": {"template": "KEY"},
        },
    )
    client.post(
        "/api/savings-goals",
        json={
            "name": "Ferien",
            "target_amount_minor": 500_000,
            "category_id": categories["Sparkonto"].id,
        },
    )
    client.post(
        "/api/calendar", json={"title": "Geburtstag", "date": "2026-03-14", "member_id": anna.id}
    )
    return client


def snapshot(client) -> dict:
    return {
        "household": client.get("/api/household").json(),
        "members": client.get("/api/members").json(),
        "categories": client.get("/api/categories").json(),
        "budgets": client.get("/api/budgets").json(),
        "rules": [
            {k: v for k, v in rule.items() if k != "open_streak"}
            for rule in client.get("/api/recurring").json()
        ],
        "goals": [
            {k: v for k, v in goal.items() if k not in {"months_left", "monthly_needed_minor"}}
            for goal in client.get("/api/savings-goals").json()
        ],
        "calendar": client.get("/api/calendar").json(),
        "transactions": client.get("/api/transactions?limit=1000").json(),
    }


# ------------------------------------------------------------------------ Restore


def test_backup_survives_a_full_round_trip(filled):
    client = filled
    before = snapshot(client)
    backup = client.get("/api/io/export/household.json").json()

    response = client.post("/api/io/restore", json={"backup": backup, "confirm_replace": True})
    assert response.status_code == 200, response.text
    assert response.json()["restored"]["transactions"] == 2

    assert snapshot(client) == before


def test_restore_replaces_instead_of_merging(filled, categories):
    client = filled
    backup = client.get("/api/io/export/household.json").json()

    client.post(
        "/api/transactions",
        json={
            "date": "2026-04-01",
            "category_id": categories["Lebensmittel"].id,
            "description": "Nach dem Backup",
            "amount_minor": 1000,
            "split": {"template": "EQUAL"},
        },
    )
    assert client.get("/api/transactions?limit=1000").json()["total"] == 3

    client.post("/api/io/restore", json={"backup": backup, "confirm_replace": True})
    page = client.get("/api/transactions?limit=1000").json()
    assert page["total"] == 2
    assert all(item["description"] != "Nach dem Backup" for item in page["items"])


def test_restore_keeps_split_amounts_exactly(filled, members):
    client = filled
    anna, ben = members
    backup = client.get("/api/io/export/household.json").json()
    client.post("/api/io/restore", json={"backup": backup, "confirm_replace": True})

    rows = {t["description"]: t for t in client.get("/api/transactions?limit=1000").json()["items"]}
    assert {s["member_id"]: s["amount_minor"] for s in rows["Miete Maerz"]["splits"]} == {
        anna.id: 120_000,
        ben.id: 80_000,
    }
    # Der abgeleitete Betrag wird von den Triggern neu berechnet, nicht aus dem Backup.
    assert rows["Einkauf"]["amount_minor"] == 6543


def test_restore_needs_explicit_confirmation(filled):
    client = filled
    backup = client.get("/api/io/export/household.json").json()
    response = client.post("/api/io/restore", json={"backup": backup})
    assert response.status_code == 422
    assert "bestaetigen" in response.json()["detail"].lower()
    assert client.get("/api/transactions?limit=1000").json()["total"] == 2


@pytest.mark.parametrize(
    ("backup", "expected"),
    [
        ({}, "format"),
        ({"format": "etwas-anderes", "version": 1}, "format"),
        ({"format": "haushaltsbudget-backup", "version": 99}, "Version"),
        ({"format": "haushaltsbudget-backup", "version": 1}, "household"),
    ],
)
def test_bad_backups_are_rejected(filled, backup, expected):
    client = filled
    response = client.post("/api/io/restore", json={"backup": backup, "confirm_replace": True})
    assert response.status_code == 422
    assert expected.lower() in response.json()["detail"].lower()


def test_a_broken_backup_leaves_the_household_untouched(filled):
    """Wichtigster Fall: ein Restore, der mittendrin scheitert, darf nichts kaputt machen."""
    client = filled
    before = snapshot(client)
    backup = client.get("/api/io/export/household.json").json()
    # Eine Buchung ohne Aufteilung -- faellt erst spaet auf, nach dem Leeren.
    backup["transactions"][0]["splits"] = []

    response = client.post("/api/io/restore", json={"backup": backup, "confirm_replace": True})
    assert response.status_code == 422
    assert snapshot(client) == before


def test_restore_reports_what_it_wrote(filled):
    client = filled
    backup = client.get("/api/io/export/household.json").json()
    restored = client.post(
        "/api/io/restore", json={"backup": backup, "confirm_replace": True}
    ).json()["restored"]
    assert restored["members"] == 2
    assert restored["categories"] == 5
    assert restored["transactions"] == 2
    assert restored["splits"] == 3
    assert restored["recurring_rules"] == 1
    assert restored["savings_goals"] == 1
    assert restored["calendar_entries"] == 1
    assert restored["settlement_payments"] == 0


# -------------------------------------------------------------------------- Reset


def test_reset_transactions_also_clears_settlements(filled, members):
    """Ausgleichszahlungen gleichen konkrete Ausgaben aus. Ohne diese Ausgaben
    stuenden sie als unbegruendete Guthaben da."""
    client = filled
    anna, ben = members
    client.post(
        "/api/settlements",
        json={
            "from_member_id": ben.id,
            "to_member_id": anna.id,
            "amount_minor": 1000,
            "date": "2026-03-20",
            "period_year": 2026,
            "period_month": 3,
        },
    )
    assert len(client.get("/api/settlements").json()) == 1

    client.post("/api/io/reset", json={"scope": "TRANSACTIONS", "confirm": "LOESCHEN"})
    assert client.get("/api/settlements").json() == []
    assert len(client.get("/api/members").json()) == 2


def test_reset_transactions_keeps_the_master_data(filled):
    client = filled
    result = client.post("/api/io/reset", json={"scope": "TRANSACTIONS", "confirm": "LOESCHEN"})
    assert result.status_code == 200
    assert result.json()["household_deleted"] is False

    assert client.get("/api/transactions?limit=1000").json()["total"] == 0
    assert len(client.get("/api/members").json()) == 2
    assert len(client.get("/api/categories").json()) == 5
    assert len(client.get("/api/budgets").json()) == 1
    assert len(client.get("/api/recurring").json()) == 1


def test_reset_all_removes_the_household_so_setup_reappears(filled):
    client = filled
    result = client.post("/api/io/reset", json={"scope": "ALL", "confirm": "LOESCHEN"})
    assert result.status_code == 200
    assert result.json()["household_deleted"] is True
    # Ohne Haushalt zeigt die App wieder ihre Einrichtung.
    assert client.get("/api/household").status_code == 404


@pytest.mark.parametrize("confirm", ["", "ja", "loeschen bitte", "DELETE"])
def test_reset_refuses_without_the_exact_confirmation(filled, confirm):
    client = filled
    response = client.post("/api/io/reset", json={"scope": "ALL", "confirm": confirm})
    assert response.status_code == 422
    assert client.get("/api/transactions?limit=1000").json()["total"] == 2


@pytest.mark.parametrize("confirm", ["LOESCHEN", "loeschen", "Löschen", " LÖSCHEN "])
def test_reset_accepts_the_word_in_any_writing(filled, confirm):
    client = filled
    assert (
        client.post("/api/io/reset", json={"scope": "TRANSACTIONS", "confirm": confirm}).status_code
        == 200
    )


def test_version_1_backups_still_restore(filled):
    """Ein Backup von vor Ausgleichstabelle und Konten muss weiter einspielbar sein.

    Fehlen die Konten, entsteht beim Einspielen ein Hauptkonto aus dem damaligen
    Startsaldo -- und Buchungen in SPAREN-Kategorien werden zu Umbuchungen auf ein
    Sparkonto, genau wie in Migration 0003.
    """
    client = filled
    backup = client.get("/api/io/export/household.json").json()
    assert backup["version"] == 3

    old = {
        key: value
        for key, value in backup.items()
        if key not in {"settlement_payments", "accounts"}
    }
    old["version"] = 1
    old["household"] = {**backup["household"], "opening_balance_minor": 55_000}
    for row in old["transactions"]:
        row.pop("account_id", None)
        row.pop("counter_account_id", None)

    response = client.post("/api/io/restore", json={"backup": old, "confirm_replace": True})
    assert response.status_code == 200
    restored = response.json()["restored"]
    assert restored["settlement_payments"] == 0
    assert restored["accounts"] == 1  # kein Sparen in diesem Haushalt -> nur ein Konto
    assert client.get("/api/transactions?limit=1000").json()["total"] == 2

    accounts = client.get("/api/accounts").json()
    assert [a["name"] for a in accounts] == ["Hauptkonto"]
    assert accounts[0]["opening_balance_minor"] == 55_000


def test_version_1_backup_with_savings_gets_a_savings_account(filled, categories, members):
    """Alte Sparbuchungen werden beim Einspielen zu Umbuchungen."""
    client = filled
    anna, _ = members
    client.post(
        "/api/transactions",
        json={
            "date": "2026-03-26",
            "category_id": categories["Sparkonto"].id,
            "description": "Sparen",
            "amount_minor": 50_000,
            "split": {"template": "SINGLE", "member_id": anna.id},
        },
    )
    backup = client.get("/api/io/export/household.json").json()
    old = {
        key: value
        for key, value in backup.items()
        if key not in {"settlement_payments", "accounts"}
    }
    old["version"] = 1
    old["household"] = {**backup["household"], "opening_balance_minor": 0}
    for row in old["transactions"]:
        row.pop("account_id", None)
        row.pop("counter_account_id", None)

    client.post("/api/io/restore", json={"backup": old, "confirm_replace": True})
    assert {a["name"] for a in client.get("/api/accounts").json()} == {"Hauptkonto", "Sparkonto"}

    summary = client.get("/api/analytics/summary?year=2026&month=3").json()
    assert summary["savings_minor"] == 50_000
