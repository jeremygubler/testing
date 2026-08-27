"""Der Ausgleich als Vorgang: geleistete Zahlungen festhalten."""

import pytest


@pytest.fixture
def owing(client, categories, members):
    """Anna traegt alles, Ben schuldet ihr seinen Anteil (Schluessel 60/40)."""
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
    return anna, ben


def settlement(client, year=2026, month=3, months=1):
    return client.get(f"/api/analytics/settlement?year={year}&month={month}&months={months}").json()


def test_recording_a_payment_closes_the_open_amount(client, owing):
    anna, ben = owing
    before = settlement(client)
    assert before["payments"] == [
        {"from_member_id": ben.id, "to_member_id": anna.id, "amount_minor": 40_000}
    ]

    created = client.post(
        "/api/settlements",
        json={
            "from_member_id": ben.id,
            "to_member_id": anna.id,
            "amount_minor": 40_000,
            "date": "2026-04-02",
            "period_year": 2026,
            "period_month": 3,
        },
    )
    assert created.status_code == 201

    after = settlement(client)
    assert after["payments"] == []
    by_id = {b["member_id"]: b for b in after["balances"]}
    # Der Bruttosaldo bleibt, was er war -- offen ist nichts mehr.
    assert by_id[anna.id]["gross_balance_minor"] == 40_000
    assert by_id[anna.id]["settled_minor"] == 40_000
    assert by_id[anna.id]["balance_minor"] == 0
    assert by_id[ben.id]["settled_minor"] == -40_000
    assert by_id[ben.id]["balance_minor"] == 0
    assert len(after["recorded"]) == 1


def test_a_partial_payment_leaves_the_rest_open(client, owing):
    anna, ben = owing
    client.post(
        "/api/settlements",
        json={
            "from_member_id": ben.id,
            "to_member_id": anna.id,
            "amount_minor": 15_000,
            "date": "2026-04-02",
            "period_year": 2026,
            "period_month": 3,
        },
    )
    after = settlement(client)
    assert after["payments"] == [
        {"from_member_id": ben.id, "to_member_id": anna.id, "amount_minor": 25_000}
    ]


def test_overpaying_turns_the_debt_around(client, owing):
    anna, ben = owing
    client.post(
        "/api/settlements",
        json={
            "from_member_id": ben.id,
            "to_member_id": anna.id,
            "amount_minor": 50_000,
            "date": "2026-04-02",
            "period_year": 2026,
            "period_month": 3,
        },
    )
    after = settlement(client)
    # Ben hat 10'000 zu viel ueberwiesen -- jetzt schuldet Anna ihm.
    assert after["payments"] == [
        {"from_member_id": anna.id, "to_member_id": ben.id, "amount_minor": 10_000}
    ]


def test_a_payment_counts_only_for_its_period(client, owing):
    anna, ben = owing
    client.post(
        "/api/settlements",
        json={
            "from_member_id": ben.id,
            "to_member_id": anna.id,
            "amount_minor": 40_000,
            "date": "2026-04-02",
            "period_year": 2026,
            "period_month": 2,  # falsche Periode
        },
    )
    assert settlement(client, month=3)["payments"] != []
    # Ueber ein Fenster, das beide Monate umfasst, wirkt sie.
    assert settlement(client, month=3, months=2)["payments"] == []


def test_payment_date_may_differ_from_the_period(client, owing):
    """Die Januar-Schuld begleicht man im Februar -- beides muss getrennt festhaltbar sein."""
    anna, ben = owing
    created = client.post(
        "/api/settlements",
        json={
            "from_member_id": ben.id,
            "to_member_id": anna.id,
            "amount_minor": 40_000,
            "date": "2026-05-20",
            "period_year": 2026,
            "period_month": 3,
        },
    ).json()
    assert created["date"] == "2026-05-20"
    assert (created["period_year"], created["period_month"]) == (2026, 3)
    assert settlement(client, month=3)["payments"] == []


def test_deleting_a_payment_reopens_the_amount(client, owing):
    anna, ben = owing
    created = client.post(
        "/api/settlements",
        json={
            "from_member_id": ben.id,
            "to_member_id": anna.id,
            "amount_minor": 40_000,
            "date": "2026-04-02",
            "period_year": 2026,
            "period_month": 3,
        },
    ).json()
    assert settlement(client)["payments"] == []

    assert client.delete(f"/api/settlements/{created['id']}").status_code == 204
    assert settlement(client)["payments"] != []


def test_a_payment_is_not_a_transaction(client, owing):
    """Ausgleich verschiebt Geld zwischen Personen, veraendert aber weder Einnahmen
    noch Ausgaben des Haushalts."""
    anna, ben = owing
    before = client.get("/api/analytics/summary?year=2026&month=3").json()
    client.post(
        "/api/settlements",
        json={
            "from_member_id": ben.id,
            "to_member_id": anna.id,
            "amount_minor": 40_000,
            "date": "2026-03-20",
            "period_year": 2026,
            "period_month": 3,
        },
    )
    after = client.get("/api/analytics/summary?year=2026&month=3").json()
    assert after["income_minor"] == before["income_minor"]
    assert after["expense_minor"] == before["expense_minor"]
    assert after["available_minor"] == before["available_minor"]
    assert client.get("/api/transactions?limit=1000").json()["total"] == 1


def test_payment_to_oneself_is_rejected(client, members):
    anna, _ = members
    response = client.post(
        "/api/settlements",
        json={
            "from_member_id": anna.id,
            "to_member_id": anna.id,
            "amount_minor": 1000,
            "date": "2026-03-20",
            "period_year": 2026,
            "period_month": 3,
        },
    )
    assert response.status_code == 422


def test_payment_needs_known_members(client, members):
    anna, _ = members
    response = client.post(
        "/api/settlements",
        json={
            "from_member_id": anna.id,
            "to_member_id": 9999,
            "amount_minor": 1000,
            "date": "2026-03-20",
            "period_year": 2026,
            "period_month": 3,
        },
    )
    assert response.status_code == 404


@pytest.mark.parametrize("amount", [0, -100])
def test_payment_amount_must_be_positive(client, members, amount):
    anna, ben = members
    response = client.post(
        "/api/settlements",
        json={
            "from_member_id": ben.id,
            "to_member_id": anna.id,
            "amount_minor": amount,
            "date": "2026-03-20",
            "period_year": 2026,
            "period_month": 3,
        },
    )
    assert response.status_code == 422


def test_listing_can_be_narrowed_to_a_period(client, owing):
    anna, ben = owing
    for month in (2, 3):
        client.post(
            "/api/settlements",
            json={
                "from_member_id": ben.id,
                "to_member_id": anna.id,
                "amount_minor": 1000,
                "date": "2026-04-02",
                "period_year": 2026,
                "period_month": month,
            },
        )
    assert len(client.get("/api/settlements").json()) == 2
    assert len(client.get("/api/settlements?year=2026&month=3").json()) == 1
    assert len(client.get("/api/settlements?year=2026&month=3&months=2").json()) == 2
