"""Kategorie aus der Beschreibung raten -- nur aus der eigenen Historie."""

import pytest

from app.services.inference import normalize, suggest_category, suggest_many


@pytest.fixture
def history(client, categories, members):
    """Legt eine Buchungshistorie an, aus der geraten werden kann."""
    anna, _ = members

    def book(description: str, category: str, day: int):
        return client.post(
            "/api/transactions",
            json={
                "date": f"2026-03-{day:02d}",
                "category_id": categories[category].id,
                "description": description,
                "amount_minor": 4500,
                "split": {"template": "SINGLE", "member_id": anna.id},
            },
        )

    for day, (description, category) in enumerate(
        [
            ("Coop Filiale Bern", "Lebensmittel"),
            ("Coop", "Lebensmittel"),
            ("Coop", "Lebensmittel"),
            ("Miete Wohnung", "Miete"),
            ("Sparen", "Sparkonto"),
        ],
        start=1,
    ):
        book(description, category, day)
    return book


def test_normalize_drops_noise():
    assert normalize("Coop Filiale 1234") == "coop"
    assert normalize("KARTENZAHLUNG Migros") == "migros"
    assert normalize("  ") == ""


def test_exact_description_wins(db, household, categories, history):
    suggestion = suggest_category(db, household.id, "Coop")
    assert suggestion is not None
    assert suggestion.category_id == categories["Lebensmittel"].id
    assert suggestion.basis == "EXACT"


def test_shared_keyword_is_a_weaker_but_useful_signal(db, household, categories, history):
    suggestion = suggest_category(db, household.id, "Coop Pronto Autobahn")
    assert suggestion is not None
    assert suggestion.category_id == categories["Lebensmittel"].id
    assert suggestion.basis == "TOKEN"


def test_unknown_description_yields_nothing(db, household, history):
    # Lieber kein Vorschlag als ein falscher.
    assert suggest_category(db, household.id, "Zahnarzt Dr. Meier") is None
    assert suggest_category(db, household.id, "") is None


def test_no_history_no_suggestion(db, household):
    assert suggest_category(db, household.id, "Coop") is None


def test_suggest_many_matches_single_lookups(db, household, history):
    descriptions = ["Coop", "Miete Wohnung", "Unbekannt"]
    bulk = suggest_many(db, household.id, descriptions)
    for description in descriptions:
        single = suggest_category(db, household.id, description)
        key = normalize(description)
        if single is None:
            assert key not in bulk
        else:
            assert bulk[key].category_id == single.category_id


def test_endpoint_returns_null_instead_of_guessing(client, history):
    assert client.get("/api/transactions/suggest-category?description=Coop").json()["basis"] == "EXACT"
    assert client.get("/api/transactions/suggest-category?description=Nie%20gesehen").json() is None


def test_import_fills_missing_categories_from_history(client, history):
    rows = [
        {"row_number": 2, "date": "2026-04-01", "amount": "-45.20", "description": "Coop"},
        {"row_number": 3, "date": "2026-04-02", "amount": "-99.00", "description": "Neuartig"},
    ]
    preview = client.post("/api/io/import/preview", json={"rows": rows}).json()
    assert preview["rows"][0]["category_name"] == "Lebensmittel"
    assert preview["rows"][0]["category_source"] == "HISTORY"
    assert preview["rows"][1]["category_id"] is None
    assert preview["importable"] == 1


def test_guessing_can_be_switched_off(client, history):
    rows = [{"row_number": 2, "date": "2026-04-01", "amount": "-45.20", "description": "Coop"}]
    preview = client.post(
        "/api/io/import/preview", json={"rows": rows, "guess_categories": False}
    ).json()
    assert preview["importable"] == 0


def test_csv_column_beats_the_guess(client, history, categories):
    rows = [
        {
            "row_number": 2,
            "date": "2026-04-01",
            "amount": "-45.20",
            "description": "Coop",
            "category": "Restaurant" if "Restaurant" in categories else "Miete",
        }
    ]
    preview = client.post("/api/io/import/preview", json={"rows": rows}).json()
    assert preview["rows"][0]["category_source"] == "CSV"
    assert preview["rows"][0]["category_name"] == "Miete"
