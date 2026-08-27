"""Personen und Kategorien: Deaktivieren statt Loeschen, Gruppe bestimmt den Flow."""


def test_members_are_deactivated_not_deleted(client, members):
    anna, ben = members
    response = client.delete(f"/api/members/{ben.id}")
    assert response.status_code == 200
    assert response.json()["is_active"] is False

    listed = client.get("/api/members").json()
    assert {m["id"] for m in listed} == {anna.id, ben.id}
    assert len(client.get("/api/members?include_inactive=false").json()) == 1


def test_last_active_member_cannot_be_deactivated(client, members):
    anna, ben = members
    assert client.delete(f"/api/members/{ben.id}").status_code == 200
    response = client.delete(f"/api/members/{anna.id}")
    assert response.status_code == 422
    assert "letzte aktive Person" in response.json()["detail"]


def test_member_names_are_unique(client):
    assert client.post("/api/members", json={"name": "Anna"}).status_code == 409


def test_household_is_capped_at_six_active_members(client):
    for index in range(4):
        assert client.post("/api/members", json={"name": f"P{index}"}).status_code == 201
    response = client.post("/api/members", json={"name": "P5"})
    assert response.status_code == 422
    assert "6 aktive Personen" in response.json()["detail"]


def test_invalid_color_is_rejected(client):
    assert client.post("/api/members", json={"name": "X", "color": "blau"}).status_code == 422


def test_category_flow_follows_the_group(client):
    created = client.post(
        "/api/categories", json={"name": "Bonus", "group": "EINKOMMEN"}
    ).json()
    assert created["flow"] == "INCOME"

    created = client.post(
        "/api/categories", json={"name": "Hobby", "group": "VARIABEL"}
    ).json()
    assert created["flow"] == "EXPENSE"


def test_category_cannot_flip_flow_once_it_has_transactions(client, categories, members):
    anna, _ = members
    client.post(
        "/api/transactions",
        json={
            "date": "2026-03-01",
            "category_id": categories["Lohn"].id,
            "description": "Lohn",
            "amount_minor": 500_000,
            "split": {"template": "SINGLE", "member_id": anna.id},
        },
    )
    response = client.patch(
        f"/api/categories/{categories['Lohn'].id}", json={"group": "VARIABEL"}
    )
    assert response.status_code == 422
    assert "Einnahme und Ausgabe" in response.json()["detail"]


def test_category_group_may_change_within_the_same_flow(client, categories):
    response = client.patch(
        f"/api/categories/{categories['Lebensmittel'].id}", json={"group": "FIXKOSTEN"}
    )
    assert response.status_code == 200
    assert response.json()["group"] == "FIXKOSTEN"
    assert response.json()["flow"] == "EXPENSE"


def test_categories_are_deactivated_not_deleted(client, categories):
    response = client.delete(f"/api/categories/{categories['Kredit'].id}")
    assert response.status_code == 200
    assert response.json()["is_active"] is False
    assert len(client.get("/api/categories?include_inactive=false").json()) == 4


def test_household_can_be_updated(client):
    response = client.patch(
        "/api/household",
        json={"opening_balance_minor": 250_000, "settlement_basis": "INCOME"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["opening_balance_minor"] == 250_000
    assert body["settlement_basis"] == "INCOME"
    assert body["currency"] == "CHF"


# --------------------------------------------------------------- Erstinbetriebnahme


def test_setup_creates_household_members_and_starter_categories(engine):
    """Ohne Haushalt liefert die API 404 -- und laesst sich genau einmal einrichten."""
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker

    from app.db import get_db
    from app.main import app as fastapi_app

    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)

    def override():
        session = factory()
        try:
            yield session
            session.commit()
        finally:
            session.close()

    fastapi_app.dependency_overrides[get_db] = override
    try:
        with TestClient(fastapi_app) as client:
            assert client.get("/api/household").status_code == 404

            response = client.post(
                "/api/household",
                json={"name": "Neuer Haushalt", "currency": "eur", "member_names": ["Ada", "Bo"]},
            )
            assert response.status_code == 201
            assert response.json()["currency"] == "EUR"

            assert [m["name"] for m in client.get("/api/members").json()] == ["Ada", "Bo"]
            assert len(client.get("/api/categories").json()) > 10

            # Ein zweites Einrichten waere Datenverlust.
            again = client.post("/api/household", json={"member_names": ["X"]})
            assert again.status_code == 409
    finally:
        fastapi_app.dependency_overrides.clear()


def test_setup_rejects_duplicate_member_names(engine):
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker

    from app.db import get_db
    from app.main import app as fastapi_app

    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
    fastapi_app.dependency_overrides[get_db] = lambda: iter([factory()])
    try:
        with TestClient(fastapi_app) as client:
            response = client.post("/api/household", json={"member_names": ["Ada", "Ada"]})
            assert response.status_code == 422
    finally:
        fastapi_app.dependency_overrides.clear()
