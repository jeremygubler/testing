"""Import, Export, Sparziele und Kalendertermine."""

import csv
import io

import pytest


def _import_body(rows, **overrides):
    body = {"rows": rows}
    body.update(overrides)
    return body


def _row(number, date, amount, description="", category=None, member=None):
    row = {"row_number": number, "date": date, "amount": amount, "description": description}
    if category:
        row["category"] = category
    if member:
        row["member"] = member
    return row


# ------------------------------------------------------------------------ Import


def test_preview_writes_nothing(client):
    body = _import_body([_row(1, "01.03.2026", "-89.00", "Fitness", "Lebensmittel")])
    preview = client.post("/api/io/import/preview", json=body).json()
    assert preview["total"] == 1
    assert preview["importable"] == 1
    assert client.get("/api/transactions").json()["total"] == 0


def test_sign_is_dropped_by_default_because_direction_lives_in_the_category(client, members):
    anna, _ = members
    body = _import_body(
        [_row(1, "2026-03-01", "-89.00", "Abo", "Lebensmittel", "Anna")],
    )
    result = client.post("/api/io/import", json=body).json()
    assert result == {"created": 1, "skipped": 0}
    txn = client.get("/api/transactions").json()["items"][0]
    assert txn["amount_minor"] == 8900
    assert txn["splits"] == [{"member_id": anna.id, "amount_minor": 8900}]


def test_sign_can_be_kept_for_refunds(client, members):
    _anna, _ = members
    body = _import_body(
        [_row(1, "2026-03-01", "-89.00", "Rueckerstattung", "Lebensmittel", "Anna")],
        keep_sign=True,
    )
    client.post("/api/io/import", json=body)
    assert client.get("/api/transactions").json()["items"][0]["amount_minor"] == -8900


@pytest.mark.parametrize(
    "value", ["2026-03-01", "01.03.2026", "01.03.26", "01/03/2026", "2026/03/01"]
)
def test_common_date_formats_are_understood(client, value):
    body = _import_body([_row(1, value, "10.00", "Test", "Lebensmittel")])
    preview = client.post("/api/io/import/preview", json=body).json()
    assert preview["rows"][0]["date"] == "2026-03-01"


def test_swiss_amount_notation_is_understood(client):
    body = _import_body([_row(1, "2026-03-01", "1'234.50", "Test", "Lebensmittel")])
    preview = client.post("/api/io/import/preview", json=body).json()
    assert preview["rows"][0]["amount_minor"] == 123_450


def test_unreadable_rows_are_reported_not_silently_dropped(client):
    body = _import_body(
        [
            _row(1, "kein datum", "10.00", "A", "Lebensmittel"),
            _row(2, "2026-03-01", "zwoelf", "B", "Lebensmittel"),
            _row(3, "2026-03-01", "10.00", "C", "Gibtsnicht"),
            _row(4, "2026-03-01", "10.00", "D"),
        ]
    )
    preview = client.post("/api/io/import/preview", json=body).json()
    assert preview["errors"] == 4
    assert preview["importable"] == 0
    messages = [row["error"] for row in preview["rows"]]
    assert "Datum nicht lesbar" in messages[0]
    assert "Betrag nicht lesbar" in messages[1]
    assert "Kategorie unbekannt" in messages[2]
    assert "Keine Kategorie" in messages[3]


def test_fallback_category_and_split_fill_the_gaps(client, categories, members):
    anna, ben = members
    body = _import_body(
        [_row(1, "2026-03-01", "100.00", "Ohne Kategorie")],
        fallback_category_id=categories["Lebensmittel"].id,
        fallback_split={"template": "KEY"},
    )
    assert client.post("/api/io/import", json=body).json()["created"] == 1
    txn = client.get("/api/transactions").json()["items"][0]
    assert {s["member_id"]: s["amount_minor"] for s in txn["splits"]} == {
        anna.id: 6000,
        ben.id: 4000,
    }


def test_duplicates_are_detected_against_existing_transactions(client, categories, members):
    anna, _ = members
    client.post(
        "/api/transactions",
        json={
            "date": "2026-03-01",
            "category_id": categories["Lebensmittel"].id,
            "description": "Grosseinkauf",
            "amount_minor": 4500,
            "split": {"template": "SINGLE", "member_id": anna.id},
        },
    )
    body = _import_body([_row(1, "2026-03-01", "45.00", "grosseinkauf", "Lebensmittel", "Anna")])
    preview = client.post("/api/io/import/preview", json=body).json()
    assert preview["duplicates"] == 1
    assert preview["rows"][0]["duplicate_transaction_id"] is not None

    result = client.post("/api/io/import", json=body).json()
    assert result == {"created": 0, "skipped": 1}
    assert client.get("/api/transactions").json()["total"] == 1


def test_duplicates_within_the_same_file_are_detected(client):
    body = _import_body(
        [
            _row(1, "2026-03-01", "45.00", "Einkauf", "Lebensmittel", "Anna"),
            _row(2, "2026-03-01", "45.00", "Einkauf", "Lebensmittel", "Anna"),
        ]
    )
    preview = client.post("/api/io/import/preview", json=body).json()
    assert [row["is_duplicate"] for row in preview["rows"]] == [False, True]


def test_duplicates_can_be_imported_on_purpose(client):
    body = _import_body(
        [
            _row(1, "2026-03-01", "45.00", "Kaffee", "Lebensmittel", "Anna"),
            _row(2, "2026-03-01", "45.00", "Kaffee", "Lebensmittel", "Anna"),
        ]
    )
    result = client.post("/api/io/import?skip_duplicates=false", json=body).json()
    assert result["created"] == 2


# ------------------------------------------------------------------------ Export


def test_csv_export_round_trips_into_the_import(client, categories, members):
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
    text = client.get("/api/io/export/transactions.csv").text.lstrip("﻿")
    rows = list(csv.DictReader(io.StringIO(text), delimiter=";"))
    assert len(rows) == 1
    assert rows[0]["betrag"] == "2000.00"
    assert rows[0]["kategorie"] == "Miete"
    assert rows[0]["aufteilung"] == f"{anna.name}=1200.00; {ben.name}=800.00"

    # Dieselbe Datei wieder eingelesen wird als Dublette erkannt.
    body = _import_body(
        [
            _row(
                1,
                rows[0]["datum"],
                rows[0]["betrag"],
                rows[0]["beschreibung"],
                rows[0]["kategorie"],
            )
        ]
    )
    preview = client.post("/api/io/import/preview", json=body).json()
    assert preview["duplicates"] == 1


def test_json_export_contains_everything_needed_for_a_restore(client, categories, members):
    anna, _ = members
    client.post(
        "/api/transactions",
        json={
            "date": "2026-03-01",
            "category_id": categories["Lebensmittel"].id,
            "description": "Einkauf",
            "amount_minor": 4500,
            "split": {"template": "SINGLE", "member_id": anna.id},
        },
    )
    backup = client.get("/api/io/export/household.json").json()
    assert backup["format"] == "haushaltsbudget-backup"
    assert backup["household"]["currency"] == "CHF"
    assert len(backup["members"]) == 2
    assert len(backup["categories"]) == 5
    assert backup["transactions"][0]["splits"] == [{"member_id": anna.id, "amount_minor": 4500}]
    # Abgeleitete Werte gehoeren nicht ins Backup.
    assert "amount_minor" not in backup["transactions"][0]


# ------------------------------------------------------------------- Sparziele


def test_savings_progress_comes_from_the_transactions(client, categories, members):
    anna, _ = members
    goal = client.post(
        "/api/savings-goals",
        json={
            "name": "Notgroschen",
            "target_amount_minor": 1_000_000,
            "target_date": "2026-12-31",
            "category_id": categories["Sparkonto"].id,
            "start_date": "2026-01-01",
        },
    ).json()
    assert goal["saved_minor"] == 0

    for month in (1, 2):
        client.post(
            "/api/transactions",
            json={
                "date": f"2026-0{month}-26",
                "category_id": categories["Sparkonto"].id,
                "description": "Sparen",
                "amount_minor": 100_000,
                "split": {"template": "SINGLE", "member_id": anna.id},
            },
        )

    listed = client.get("/api/savings-goals?today=2026-03-01").json()[0]
    assert listed["saved_minor"] == 200_000
    assert listed["remaining_minor"] == 800_000
    assert listed["progress"] == pytest.approx(0.2)
    assert listed["months_left"] == 9
    assert listed["monthly_needed_minor"] == 88_889  # aufgerundet, damit es reicht


def test_savings_before_the_start_date_do_not_count(client, categories, members):
    anna, _ = members
    client.post(
        "/api/transactions",
        json={
            "date": "2025-12-01",
            "category_id": categories["Sparkonto"].id,
            "description": "Altbestand",
            "amount_minor": 500_000,
            "split": {"template": "SINGLE", "member_id": anna.id},
        },
    )
    goal = client.post(
        "/api/savings-goals",
        json={
            "name": "Ferien",
            "target_amount_minor": 1_000_000,
            "category_id": categories["Sparkonto"].id,
            "start_date": "2026-01-01",
        },
    ).json()
    assert goal["saved_minor"] == 0


# ------------------------------------------------------------------- Kalender


def test_calendar_entries_are_plain_appointments(client, members):
    anna, _ = members
    created = client.post(
        "/api/calendar",
        json={"title": "Geburtstag Anna", "date": "2026-03-14", "member_id": anna.id},
    ).json()
    assert created["title"] == "Geburtstag Anna"

    listed = client.get("/api/calendar?date_from=2026-03-01&date_to=2026-03-31").json()
    assert len(listed) == 1
    assert client.get("/api/calendar?date_from=2026-04-01&date_to=2026-04-30").json() == []

    assert client.delete(f"/api/calendar/{created['id']}").status_code == 204
    assert client.get("/api/calendar").json() == []


def test_calendar_entry_rejects_unknown_member(client):
    response = client.post(
        "/api/calendar", json={"title": "X", "date": "2026-03-14", "member_id": 999}
    )
    assert response.status_code == 404
