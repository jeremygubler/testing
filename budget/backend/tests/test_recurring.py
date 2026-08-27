"""Wiederkehrende Buchungen: Faelligkeiten, Vorschlaege, Bestaetigen, Ueberspringen."""

import datetime as dt

import pytest

from app.enums import Interval
from app.models import RecurringRule
from app.services.recurring import monthly_estimate, occurrences, yearly_estimate


def _rule(**kwargs) -> RecurringRule:
    rule = RecurringRule()
    rule.start_date = kwargs.pop("start", dt.date(2026, 1, 1))
    rule.end_date = kwargs.pop("end", None)
    rule.interval = kwargs.pop("interval")
    rule.day_of_period = kwargs.pop("day", 1)
    rule.anchor_month = kwargs.pop("anchor", None)
    rule.amount_minor = kwargs.pop("amount", 10_000)
    return rule


def test_monthly_clamps_to_the_last_day_of_short_months():
    dates = occurrences(
        _rule(interval=Interval.MONTHLY, day=31), dt.date(2026, 1, 1), dt.date(2026, 4, 30)
    )
    assert dates == [
        dt.date(2026, 1, 31),
        dt.date(2026, 2, 28),
        dt.date(2026, 3, 31),
        dt.date(2026, 4, 30),
    ]


def test_quarterly_follows_the_anchor_month():
    dates = occurrences(
        _rule(interval=Interval.QUARTERLY, day=15, anchor=2),
        dt.date(2026, 1, 1),
        dt.date(2026, 12, 31),
    )
    assert [d.month for d in dates] == [2, 5, 8, 11]


def test_yearly_repeats_once_per_year():
    dates = occurrences(
        _rule(interval=Interval.YEARLY, day=1, anchor=7), dt.date(2026, 1, 1), dt.date(2028, 12, 31)
    )
    assert dates == [dt.date(2026, 7, 1), dt.date(2027, 7, 1), dt.date(2028, 7, 1)]


def test_weekly_uses_the_weekday():
    dates = occurrences(
        _rule(interval=Interval.WEEKLY, day=3), dt.date(2026, 1, 1), dt.date(2026, 2, 1)
    )
    assert all(date.weekday() == 2 for date in dates)
    assert dates[0] == dt.date(2026, 1, 7)


def test_no_occurrence_before_start_or_after_end():
    rule = _rule(
        interval=Interval.MONTHLY, day=10, start=dt.date(2026, 3, 1), end=dt.date(2026, 5, 31)
    )
    dates = occurrences(rule, dt.date(2026, 1, 1), dt.date(2026, 12, 31))
    assert dates == [dt.date(2026, 3, 10), dt.date(2026, 4, 10), dt.date(2026, 5, 10)]


@pytest.mark.parametrize(
    ("interval", "amount", "yearly", "monthly"),
    [
        (Interval.MONTHLY, 10_000, 120_000, 10_000),
        (Interval.QUARTERLY, 30_000, 120_000, 10_000),
        (Interval.YEARLY, 120_000, 120_000, 10_000),
        (Interval.WEEKLY, 1000, 52_000, 4333),
    ],
)
def test_projection(interval, amount, yearly, monthly):
    rule = _rule(interval=interval, amount=amount)
    assert yearly_estimate(rule) == yearly
    assert monthly_estimate(rule) == monthly


# ------------------------------------------------------------------------------ API


@pytest.fixture
def rule_payload(categories, members):
    _anna, _ = members
    return {
        "category_id": categories["Miete"].id,
        "description": "Miete Wohnung",
        "amount_minor": 200_000,
        "interval": "MONTHLY",
        "day_of_period": 1,
        "start_date": "2026-01-01",
        "split": {"template": "KEY"},
    }


def test_rules_never_book_on_their_own(client, rule_payload):
    client.post("/api/recurring", json=rule_payload)
    assert client.get("/api/transactions").json()["total"] == 0

    occurrences_march = client.get("/api/recurring/occurrences?year=2026&month=3").json()
    assert [entry["status"] for entry in occurrences_march] == ["OPEN"]


def test_confirming_creates_a_real_transaction(client, rule_payload, members):
    anna, ben = members
    rule = client.post("/api/recurring", json=rule_payload).json()
    response = client.post(
        "/api/recurring/occurrences/confirm",
        json={"occurrences": [{"rule_id": rule["id"], "due_date": "2026-03-01"}]},
    )
    assert response.status_code == 200
    txn = response.json()[0]
    assert txn["amount_minor"] == 200_000
    assert txn["recurring_rule_id"] == rule["id"]
    assert {s["member_id"]: s["amount_minor"] for s in txn["splits"]} == {
        anna.id: 120_000,
        ben.id: 80_000,
    }
    assert (
        client.get("/api/recurring/occurrences?year=2026&month=3").json()[0]["status"]
        == "CONFIRMED"
    )


def test_amount_and_date_are_adjustable_on_confirmation(client, rule_payload):
    rule = client.post("/api/recurring", json=rule_payload).json()
    txn = client.post(
        "/api/recurring/occurrences/confirm",
        json={
            "occurrences": [
                {
                    "rule_id": rule["id"],
                    "due_date": "2026-03-01",
                    "date": "2026-03-04",
                    "amount_minor": 213_500,
                    "description": "Miete inkl. Nebenkosten",
                }
            ]
        },
    ).json()[0]
    assert txn["amount_minor"] == 213_500
    assert txn["date"] == "2026-03-04"
    assert txn["description"] == "Miete inkl. Nebenkosten"
    # Der Termin gilt trotz abweichendem Buchungsdatum als erledigt.
    entry = client.get("/api/recurring/occurrences?year=2026&month=3").json()[0]
    assert entry["status"] == "CONFIRMED"
    assert entry["booked_date"] == "2026-03-04"


def test_confirming_twice_is_rejected(client, rule_payload):
    rule = client.post("/api/recurring", json=rule_payload).json()
    body = {"occurrences": [{"rule_id": rule["id"], "due_date": "2026-03-01"}]}
    assert client.post("/api/recurring/occurrences/confirm", json=body).status_code == 200
    assert client.post("/api/recurring/occurrences/confirm", json=body).status_code == 409


def test_confirming_several_at_once(client, rule_payload):
    rule = client.post("/api/recurring", json=rule_payload).json()
    response = client.post(
        "/api/recurring/occurrences/confirm",
        json={
            "occurrences": [
                {"rule_id": rule["id"], "due_date": "2026-01-01"},
                {"rule_id": rule["id"], "due_date": "2026-02-01"},
                {"rule_id": rule["id"], "due_date": "2026-03-01"},
            ]
        },
    )
    assert response.status_code == 200
    assert len(response.json()) == 3
    assert client.get("/api/transactions").json()["total"] == 3


def test_skipping_removes_the_suggestion_without_booking(client, rule_payload):
    rule = client.post("/api/recurring", json=rule_payload).json()
    assert (
        client.post(
            "/api/recurring/occurrences/skip",
            json={"rule_id": rule["id"], "due_date": "2026-03-01"},
        ).status_code
        == 204
    )
    entry = client.get("/api/recurring/occurrences?year=2026&month=3").json()[0]
    assert entry["status"] == "SKIPPED"
    assert client.get("/api/transactions").json()["total"] == 0

    assert not client.get("/api/recurring/occurrences?year=2026&month=3&only_open=true").json()


def test_a_skipped_occurrence_can_still_be_confirmed_later(client, rule_payload):
    rule = client.post("/api/recurring", json=rule_payload).json()
    client.post(
        "/api/recurring/occurrences/skip", json={"rule_id": rule["id"], "due_date": "2026-03-01"}
    )
    client.post(
        "/api/recurring/occurrences/confirm",
        json={"occurrences": [{"rule_id": rule["id"], "due_date": "2026-03-01"}]},
    )
    assert (
        client.get("/api/recurring/occurrences?year=2026&month=3").json()[0]["status"]
        == "CONFIRMED"
    )


def test_open_streak_flags_a_forgotten_subscription(client, rule_payload):
    rule = client.post("/api/recurring", json=rule_payload).json()
    listed = client.get("/api/recurring?today=2026-06-15").json()[0]
    # Januar bis Juni faellig, nichts bestaetigt.
    assert listed["open_streak"] == 6

    client.post(
        "/api/recurring/occurrences/confirm",
        json={"occurrences": [{"rule_id": rule["id"], "due_date": "2026-06-01"}]},
    )
    assert client.get("/api/recurring?today=2026-06-15").json()[0]["open_streak"] == 0


def test_manual_default_split_must_match_the_rule_amount(client, rule_payload, members):
    anna, ben = members
    rule_payload["split"] = {
        "template": "MANUAL",
        "lines": [
            {"member_id": anna.id, "amount_minor": 150_000},
            {"member_id": ben.id, "amount_minor": 60_000},
        ],
    }
    response = client.post("/api/recurring", json=rule_payload)
    assert response.status_code == 422
    assert "ergibt" in response.json()["detail"]


def test_deactivated_rule_stops_producing_suggestions(client, rule_payload):
    rule = client.post("/api/recurring", json=rule_payload).json()
    assert client.delete(f"/api/recurring/{rule['id']}").status_code == 200
    assert client.get("/api/recurring/occurrences?year=2026&month=3").json() == []


def test_subscriptions_are_just_rules_in_the_fixkosten_group(client, categories, rule_payload):
    """Kein eigenes Abo-Konstrukt -- die Abo-Ansicht ist ein Filter, keine zweite Logik."""
    rule = client.post("/api/recurring", json=rule_payload).json()
    assert rule["category_group"] == "FIXKOSTEN"
    rule_payload["category_id"] = categories["Lebensmittel"].id
    rule_payload["description"] = "Wocheneinkauf"
    other = client.post("/api/recurring", json=rule_payload).json()
    assert other["category_group"] == "VARIABEL"

    rules = client.get("/api/recurring").json()
    assert sum(1 for entry in rules if entry["category_group"] == "FIXKOSTEN") == 1


# ------------------------------------------- Terminaenderung darf die Vergangenheit nicht brechen


def test_schedule_change_does_not_reopen_confirmed_occurrences(client, rule_payload):
    """Der Kern des Fehlers: eine Verschiebung des Buchungstags liess bereits gebuchte
    Termine wieder als offen erscheinen -- und ein Klick haette sie doppelt gebucht."""
    rule = client.post("/api/recurring", json=rule_payload).json()
    for month in ("01", "02"):
        client.post(
            "/api/recurring/occurrences/confirm",
            json={"occurrences": [{"rule_id": rule["id"], "due_date": f"2026-{month}-01"}]},
        )
    assert client.get("/api/transactions").json()["total"] == 2

    response = client.patch(
        f"/api/recurring/{rule['id']}",
        json={"day_of_period": 5, "effective_from": "2026-03-01"},
    )
    assert response.status_code == 200
    successor = response.json()
    assert successor["id"] != rule["id"]
    assert successor["supersedes_rule_id"] == rule["id"]
    assert successor["day_of_period"] == 5

    # Vergangenheit bleibt bestaetigt und unveraendert.
    for month in (1, 2):
        entries = client.get(f"/api/recurring/occurrences?year=2026&month={month}").json()
        assert [(e["due_date"], e["status"]) for e in entries] == [
            (f"2026-0{month}-01", "CONFIRMED")
        ]

    # Zukunft folgt dem neuen Raster, genau einmal.
    march = client.get("/api/recurring/occurrences?year=2026&month=3").json()
    assert [(e["due_date"], e["status"]) for e in march] == [("2026-03-05", "OPEN")]


def test_schedule_change_without_bookings_edits_in_place(client, rule_payload):
    rule = client.post("/api/recurring", json=rule_payload).json()
    response = client.patch(f"/api/recurring/{rule['id']}", json={"day_of_period": 5})
    assert response.json()["id"] == rule["id"]
    assert response.json()["supersedes_rule_id"] is None
    assert len(client.get("/api/recurring").json()) == 1


def test_amount_change_never_splits_the_rule(client, rule_payload):
    """Der Betrag beeinflusst das Raster nicht -- Mietanpassungen sollen keine
    Regelkopien erzeugen."""
    rule = client.post("/api/recurring", json=rule_payload).json()
    client.post(
        "/api/recurring/occurrences/confirm",
        json={"occurrences": [{"rule_id": rule["id"], "due_date": "2026-01-01"}]},
    )
    response = client.patch(f"/api/recurring/{rule['id']}", json={"amount_minor": 215_000})
    assert response.json()["id"] == rule["id"]
    assert response.json()["amount_minor"] == 215_000
    assert len(client.get("/api/recurring").json()) == 1


def test_superseded_rule_keeps_its_history_and_stops_producing(client, rule_payload):
    rule = client.post("/api/recurring", json=rule_payload).json()
    client.post(
        "/api/recurring/occurrences/confirm",
        json={"occurrences": [{"rule_id": rule["id"], "due_date": "2026-01-01"}]},
    )
    client.patch(
        f"/api/recurring/{rule['id']}",
        json={"interval": "QUARTERLY", "anchor_month": 3, "effective_from": "2026-03-01"},
    )
    rules = {entry["id"]: entry for entry in client.get("/api/recurring").json()}
    assert len(rules) == 2
    assert rules[rule["id"]]["end_date"] == "2026-02-28"

    # Die alte Regel erzeugt ab Maerz nichts mehr, die neue uebernimmt.
    march = client.get("/api/recurring/occurrences?year=2026&month=3").json()
    assert {entry["rule_id"] for entry in march} == {successor_id(rules, rule["id"])}


def successor_id(rules: dict, old_id: int) -> int:
    return next(entry_id for entry_id in rules if entry_id != old_id)
