"""Test-Fixtures.

Jeder Test bekommt eine frische SQLite-Datenbank im Speicher -- inklusive der Trigger
aus ``app/ddl.py``, damit die DB-seitigen Invarianten wirklich mitgetestet werden.
"""

from __future__ import annotations

import datetime as dt

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.ddl  # noqa: F401  haengt die Trigger-DDL an die Metadata
from app.db import Base, get_db
from app.enums import CategoryGroup, Flow
from app.main import app as fastapi_app
from app.models import Category, Household, Member


@pytest.fixture
def engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    try:
        yield engine
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def db(engine) -> Session:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
    session = factory()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def household(db: Session) -> Household:
    household = Household(
        id=1,
        name="Testhaushalt",
        currency="CHF",
        locale="de-CH",
        timezone="Europe/Zurich",
        opening_balance_minor=100_000,
    )
    db.add(household)
    db.flush()
    return household


@pytest.fixture
def members(db: Session, household: Household) -> list[Member]:
    rows = [
        Member(household_id=household.id, name="Anna", color="#2563eb", sort_order=0,
               share_weight=60),
        Member(household_id=household.id, name="Ben", color="#c2410c", sort_order=1,
               share_weight=40),
    ]
    db.add_all(rows)
    db.flush()
    return rows


@pytest.fixture
def categories(db: Session, household: Household) -> dict[str, Category]:
    spec = [
        ("Lohn", CategoryGroup.EINKOMMEN),
        ("Miete", CategoryGroup.FIXKOSTEN),
        ("Lebensmittel", CategoryGroup.VARIABEL),
        ("Sparkonto", CategoryGroup.SPAREN),
        ("Kredit", CategoryGroup.SCHULDEN),
    ]
    result: dict[str, Category] = {}
    for order, (name, group) in enumerate(spec):
        flow = Flow.INCOME if group is CategoryGroup.EINKOMMEN else Flow.EXPENSE
        category = Category(
            household_id=household.id, name=name, flow=flow, group=group, sort_order=order
        )
        db.add(category)
        result[name] = category
    db.flush()
    return result


@pytest.fixture
def client(engine, household, members, categories, db) -> TestClient:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
    db.commit()

    def override_get_db():
        session = factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    fastapi_app.dependency_overrides[get_db] = override_get_db
    with TestClient(fastapi_app) as test_client:
        yield test_client
    fastapi_app.dependency_overrides.clear()


@pytest.fixture
def today() -> dt.date:
    return dt.date(2026, 3, 15)
