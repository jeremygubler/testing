"""API fuer Buchungen inklusive der DB-seitig erzwungenen Invarianten."""

import datetime as dt

import pytest
from sqlalchemy.exc import IntegrityError, OperationalError

from app.models import Transaction, TransactionSplit


def _create(client, categories, **overrides):
    payload = {
        "date": "2026-03-15",
        "category_id": categories["Lebensmittel"].id,
        "description": "Grosseinkauf",
        "amount_minor": 12_345,
        "split": {"template": "KEY"},
    }
    payload.update(overrides)
    return client.post("/api/transactions", json=payload)


def test_create_resolves_the_key_template(client, categories, members):
    anna, ben = members
    response = _create(client, categories, amount_minor=10_000)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["amount_minor"] == 10_000
    assert {s["member_id"]: s["amount_minor"] for s in body["splits"]} == {
        anna.id: 6000,
        ben.id: 4000,
    }


def test_create_with_odd_amount_keeps_the_sum_exact(client, categories):
    body = _create(client, categories, amount_minor=1001).json()
    assert sum(s["amount_minor"] for s in body["splits"]) == 1001


def test_manual_split_must_add_up(client, categories, members):
    anna, ben = members
    response = _create(
        client,
        categories,
        amount_minor=10_000,
        split={
            "template": "MANUAL",
            "lines": [
                {"member_id": anna.id, "amount_minor": 6000},
                {"member_id": ben.id, "amount_minor": 3999},
            ],
        },
    )
    assert response.status_code == 422
    assert "Summe der Splits" in response.json()["detail"]


def test_single_split_on_unknown_member_is_rejected(client, categories):
    response = _create(client, categories, split={"template": "SINGLE", "member_id": 4242})
    assert response.status_code == 422


def test_amount_zero_is_rejected(client, categories):
    response = _create(client, categories, amount_minor=0)
    assert response.status_code == 422


def test_inactive_category_is_rejected(client, categories, db):
    categories["Lebensmittel"].is_active = False
    db.commit()
    response = _create(client, categories)
    assert response.status_code == 422
    assert "deaktiviert" in response.json()["detail"]


def test_update_amount_keeps_the_existing_proportion(client, categories, members):
    anna, ben = members
    created = _create(client, categories, amount_minor=10_000).json()
    response = client.patch(f"/api/transactions/{created['id']}", json={"amount_minor": 20_000})
    assert response.status_code == 200
    body = response.json()
    assert body["amount_minor"] == 20_000
    assert {s["member_id"]: s["amount_minor"] for s in body["splits"]} == {
        anna.id: 12_000,
        ben.id: 8000,
    }


def test_update_can_switch_template(client, categories, members):
    anna, _ben = members
    created = _create(client, categories, amount_minor=10_000).json()
    response = client.patch(
        f"/api/transactions/{created['id']}",
        json={"split": {"template": "SINGLE", "member_id": anna.id}},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["splits"] == [{"member_id": anna.id, "amount_minor": 10_000}]
    assert body["amount_minor"] == 10_000


def test_delete_removes_transaction_and_splits(client, categories, db):
    created = _create(client, categories).json()
    assert client.delete(f"/api/transactions/{created['id']}").status_code == 204
    assert client.get(f"/api/transactions/{created['id']}").status_code == 404
    assert db.query(TransactionSplit).count() == 0


def test_preview_split_does_not_persist(client, categories, members, db):
    anna, ben = members
    response = client.post(
        "/api/transactions/preview-split",
        json={"amount_minor": 1000, "split": {"template": "EQUAL"}},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total_minor"] == 1000
    assert {line["member_id"]: line["amount_minor"] for line in body["lines"]} == {
        anna.id: 500,
        ben.id: 500,
    }
    assert db.query(Transaction).count() == 0


def test_filters_narrow_the_list(client, categories, members):
    anna, ben = members
    _create(
        client,
        categories,
        amount_minor=5000,
        description="Migros",
        split={"template": "SINGLE", "member_id": anna.id},
    )
    _create(
        client,
        categories,
        amount_minor=7000,
        description="Coop",
        date="2026-04-02",
        split={"template": "SINGLE", "member_id": ben.id},
    )
    _create(
        client,
        categories,
        amount_minor=900_000,
        description="Lohn Maerz",
        category_id=categories["Lohn"].id,
        split={"template": "SINGLE", "member_id": anna.id},
    )

    assert client.get("/api/transactions").json()["total"] == 3
    assert client.get("/api/transactions?q=coop").json()["total"] == 1
    assert client.get(f"/api/transactions?member_id={ben.id}").json()["total"] == 1
    assert client.get("/api/transactions?date_to=2026-03-31").json()["total"] == 2
    assert client.get("/api/transactions?group=EINKOMMEN").json()["total"] == 1

    page = client.get("/api/transactions?date_to=2026-03-31").json()
    assert page["sum_income_minor"] == 900_000
    assert page["sum_expense_minor"] == 5000


def test_list_sums_are_signed_by_flow_not_by_storage(client, categories, members):
    anna, _ = members
    _create(
        client, categories, amount_minor=2000, split={"template": "SINGLE", "member_id": anna.id}
    )
    _create(
        client,
        categories,
        amount_minor=500_000,
        category_id=categories["Lohn"].id,
        split={"template": "SINGLE", "member_id": anna.id},
    )
    page = client.get("/api/transactions").json()
    assert page["sum_income_minor"] == 500_000
    assert page["sum_expense_minor"] == 2000


# --------------------------------------------------------------- DB-Invarianten


def test_db_keeps_amount_in_sync_with_splits(db, household, accounts, categories, members):
    anna, ben = members
    txn = Transaction(
        household_id=household.id,
        date=dt.date(2026, 3, 1),
        category_id=categories["Miete"].id,
        account_id=accounts["Hauptkonto"].id,
        description="Miete",
    )
    db.add(txn)
    db.flush()
    db.add(TransactionSplit(txn_id=txn.id, member_id=anna.id, amount_minor=6000))
    db.add(TransactionSplit(txn_id=txn.id, member_id=ben.id, amount_minor=4000))
    db.flush()
    db.refresh(txn)
    assert txn.amount_minor == 10_000

    db.query(TransactionSplit).filter_by(txn_id=txn.id, member_id=ben.id).delete()
    db.flush()
    db.refresh(txn)
    assert txn.amount_minor == 6000


def test_db_rejects_mixed_signs(db, household, accounts, categories, members):
    anna, ben = members
    txn = Transaction(
        household_id=household.id,
        date=dt.date(2026, 3, 1),
        category_id=categories["Miete"].id,
        account_id=accounts["Hauptkonto"].id,
        description="Miete",
    )
    db.add(txn)
    db.flush()
    db.add(TransactionSplit(txn_id=txn.id, member_id=anna.id, amount_minor=6000))
    db.flush()
    db.add(TransactionSplit(txn_id=txn.id, member_id=ben.id, amount_minor=-100))
    with pytest.raises((IntegrityError, OperationalError)):
        db.flush()


def test_db_rejects_writing_the_derived_amount(db, household, accounts, categories, members):
    anna, _ = members
    txn = Transaction(
        household_id=household.id,
        date=dt.date(2026, 3, 1),
        category_id=categories["Miete"].id,
        account_id=accounts["Hauptkonto"].id,
        description="Miete",
    )
    db.add(txn)
    db.flush()
    db.add(TransactionSplit(txn_id=txn.id, member_id=anna.id, amount_minor=6000))
    db.flush()

    txn.amount_minor = 999
    with pytest.raises((IntegrityError, OperationalError)):
        db.flush()


def test_db_rejects_zero_split(db, household, accounts, categories, members):
    anna, _ = members
    txn = Transaction(
        household_id=household.id,
        date=dt.date(2026, 3, 1),
        category_id=categories["Miete"].id,
        account_id=accounts["Hauptkonto"].id,
        description="Miete",
    )
    db.add(txn)
    db.flush()
    db.add(TransactionSplit(txn_id=txn.id, member_id=anna.id, amount_minor=0))
    with pytest.raises(IntegrityError):
        db.flush()
