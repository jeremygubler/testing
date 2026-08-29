"""Tests against a real PostGIS. Run with:

    docker compose up -d db
    REISEAPP_DATABASE_URL=postgresql+asyncpg://reiseapp:...@localhost:5432/reiseapp \
        pytest -m integration
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_sessionmaker
from app.models import Trip, User, Waypoint

pytestmark = pytest.mark.integration

ZURICH = (47.3769, 8.5417)
BERN = (46.9480, 7.4474)


def _point_wkt(lat: float, lon: float) -> str:
    return f"SRID=4326;POINT({lon} {lat})"


@pytest.fixture
async def session() -> AsyncIterator[AsyncSession]:
    """Everything happens inside one transaction that is rolled back afterwards."""
    async with get_sessionmaker()() as db:
        yield db
        await db.rollback()


async def test_postgis_extension_is_installed(session: AsyncSession) -> None:
    version = (await session.execute(text("SELECT PostGIS_Lib_Version()"))).scalar_one()
    assert version.startswith("3.")


async def test_geography_distance_is_in_metres(session: AsyncSession) -> None:
    # geography (not geometry) is why this is metres and not degrees.
    distance = (
        await session.execute(
            text(
                "SELECT ST_Distance("
                "  ST_GeogFromText(:a), ST_GeogFromText(:b))"
            ),
            {"a": f"POINT({ZURICH[1]} {ZURICH[0]})", "b": f"POINT({BERN[1]} {BERN[0]})"},
        )
    ).scalar_one()
    assert 90_000 < distance < 100_000  # Zürich–Bern ≈ 95 km


async def test_waypoint_roundtrip_and_route_length(session: AsyncSession) -> None:
    user = User(
        email=f"{uuid.uuid4()}@example.test",
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
                trip_id=trip.id,
                geom=_point_wkt(*ZURICH),
                recorded_at=func.now(),
                altitude_m=408.0,
            ),
            Waypoint(
                trip_id=trip.id,
                geom=_point_wkt(*BERN),
                recorded_at=func.now(),
                altitude_m=540.0,
            ),
        ]
    )
    await session.flush()

    lat, lon = (
        await session.execute(
            select(func.ST_Y(Waypoint.geom.cast(text("geometry"))), func.ST_X(
                Waypoint.geom.cast(text("geometry"))
            ))
            .where(Waypoint.trip_id == trip.id)
            .order_by(func.ST_Y(Waypoint.geom.cast(text("geometry"))).desc())
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
        email=f"{uuid.uuid4()}@example.test",
        display_name="Soft delete",
        password_hash="not-a-real-hash",
    )
    session.add(user)
    await session.flush()

    trip = Trip(owner_id=user.id, title="Gelöscht", deleted_at=func.now())
    session.add(trip)
    await session.flush()

    found = (
        await session.execute(select(Trip).where(Trip.id == trip.id, Trip.deleted_at.is_not(None)))
    ).scalar_one()
    assert found.id == trip.id
