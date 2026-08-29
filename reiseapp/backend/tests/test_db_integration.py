"""Tests against a real PostGIS. Run with:

    docker compose up -d db
    REISEAPP_DATABASE_URL=postgresql+asyncpg://reiseapp:...@localhost:5432/reiseapp \
        pytest -m integration
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.models import Trip, User, Waypoint
from tests.geo import as_geometry, point_wkt

pytestmark = pytest.mark.integration

ZURICH = (47.3769, 8.5417)
BERN = (46.9480, 7.4474)
T0 = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)
T1 = datetime(2026, 6, 1, 10, 0, tzinfo=UTC)


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    """A per-test engine with NullPool.

    The application's cached engine must not be reused here: pytest-asyncio runs
    every test on a fresh event loop, and a pooled asyncpg connection created on
    the previous loop fails with "attached to a different loop" on the next test.
    """
    engine = create_async_engine(
        get_settings().database_url,
        poolclass=NullPool,
        connect_args={"server_settings": {"search_path": "public"}},
    )
    yield engine
    await engine.dispose()


@pytest.fixture
async def session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """Everything happens inside one transaction that is rolled back afterwards."""
    async with AsyncSession(engine, expire_on_commit=False) as db:
        yield db
        await db.rollback()


async def test_postgis_extension_is_installed(session: AsyncSession) -> None:
    version = (await session.execute(text("SELECT PostGIS_Lib_Version()"))).scalar_one()
    assert version.startswith("3.")


async def test_geography_distance_is_in_metres(session: AsyncSession) -> None:
    # geography (not geometry) is why this is metres and not degrees.
    distance = (
        await session.execute(
            text("SELECT ST_Distance(ST_GeogFromText(:a), ST_GeogFromText(:b))"),
            {"a": f"POINT({ZURICH[1]} {ZURICH[0]})", "b": f"POINT({BERN[1]} {BERN[0]})"},
        )
    ).scalar_one()
    assert 90_000 < distance < 100_000  # Zürich–Bern ≈ 95 km


async def test_waypoint_roundtrip_and_route_length(session: AsyncSession) -> None:
    user = User(
        email=f"{uuid.uuid4()}@example.com",
        display_name="Integration",
        password_hash="not-a-real-hash",
    )
    session.add(user)
    await session.flush()

    trip = Trip(owner_id=user.id, title="Testreise")
    session.add(trip)
    await session.flush()

    session.add_all(
        [
            Waypoint(
                trip_id=trip.id, geom=point_wkt(*ZURICH), recorded_at=T0, altitude_m=408.0
            ),
            Waypoint(trip_id=trip.id, geom=point_wkt(*BERN), recorded_at=T1, altitude_m=540.0),
        ]
    )
    await session.flush()

    geom = as_geometry(Waypoint.geom)
    lat, lon = (
        await session.execute(
            select(func.ST_Y(geom), func.ST_X(geom))
            .where(Waypoint.trip_id == trip.id)
            .order_by(Waypoint.recorded_at)
            .limit(1)
        )
    ).one()
    assert lat == pytest.approx(ZURICH[0], abs=1e-6)
    assert lon == pytest.approx(ZURICH[1], abs=1e-6)

    # The route length the stats endpoints will use – derived, never stored.
    length_m = (
        await session.execute(
            text(
                "SELECT ST_Length(ST_MakeLine(geom::geometry ORDER BY recorded_at)::geography)"
                " FROM waypoints WHERE trip_id = :trip_id"
            ),
            {"trip_id": trip.id},
        )
    ).scalar_one()
    assert 90_000 < length_m < 100_000


async def test_soft_deleted_rows_stay_queryable(session: AsyncSession) -> None:
    user = User(
        email=f"{uuid.uuid4()}@example.com",
        display_name="Soft delete",
        password_hash="not-a-real-hash",
    )
    session.add(user)
    await session.flush()

    trip = Trip(owner_id=user.id, title="Gelöscht", deleted_at=T1)
    session.add(trip)
    await session.flush()

    found = (
        await session.execute(select(Trip).where(Trip.id == trip.id, Trip.deleted_at.is_not(None)))
    ).scalar_one()
    assert found.id == trip.id
