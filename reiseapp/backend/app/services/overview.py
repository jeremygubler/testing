from __future__ import annotations

import json
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MemberRole, Trip
from app.schemas.overview import TripOverview, WorldOverview

# A world map is roughly 40'000 km across a few hundred pixels of phone. Metre
# precision there is thousands of coordinates nobody can see. 0.01° is about a
# kilometre — still far finer than one screen pixel at that zoom, and it turns a
# three-week trip from tens of thousands of points into dozens.
WORLD_TOLERANCE_DEG = 0.01

# One statement for every trip at once. The obvious implementation — call the
# per-trip route endpoint in a loop — is a round trip per trip, and a world map
# is exactly the screen where all of them are wanted at once.
_ROUTES_SQL = text(
    """
    WITH points AS (
        SELECT trip_id, geom::geometry AS g, recorded_at, id
        FROM waypoints
        WHERE trip_id = ANY(:trip_ids) AND deleted_at IS NULL
    ), lines AS (
        SELECT trip_id, ST_MakeLine(g ORDER BY recorded_at, id) AS g
        FROM points
        GROUP BY trip_id
    )
    SELECT
        trip_id,
        ST_NPoints(g) AS point_count,
        ST_Length(g::geography) AS distance_m,
        ST_XMin(g) AS west, ST_YMin(g) AS south,
        ST_XMax(g) AS east, ST_YMax(g) AS north,
        ST_AsGeoJSON(ST_Simplify(g, CAST(:tolerance AS double precision))) AS geojson
    FROM lines
    -- A single waypoint makes a one-point "line" that ST_Length reports as 0 and
    -- that no map can draw. Two is the minimum that is a route.
    WHERE g IS NOT NULL AND ST_NPoints(g) > 1
    """
)

_COUNTRIES_SQL = text(
    """
    SELECT trip_id, ARRAY_AGG(DISTINCT country ORDER BY country) AS countries
    FROM stops
    WHERE trip_id = ANY(:trip_ids) AND deleted_at IS NULL AND country IS NOT NULL
    GROUP BY trip_id
    """
)


async def world_overview(
    session: AsyncSession, trips: list[tuple[Trip, MemberRole]]
) -> WorldOverview:
    """Every visible trip reduced to what a world map needs, in three queries."""
    if not trips:
        return WorldOverview(trips=[], countries=[], total_distance_m=0.0)

    trip_ids = [trip.id for trip, _ in trips]
    params = {"trip_ids": trip_ids}

    routes = {
        row.trip_id: row
        for row in (
            await session.execute(_ROUTES_SQL, {**params, "tolerance": WORLD_TOLERANCE_DEG})
        ).all()
    }
    countries: dict[UUID, list[str]] = {
        row.trip_id: list(row.countries)
        for row in (await session.execute(_COUNTRIES_SQL, params)).all()
    }

    entries: list[TripOverview] = []
    for trip, role in trips:
        route = routes.get(trip.id)
        entries.append(
            TripOverview(
                id=trip.id,
                title=trip.title,
                start_date=trip.start_date,
                end_date=trip.end_date,
                role=role,
                countries=countries.get(trip.id, []),
                point_count=route.point_count if route else 0,
                distance_m=float(route.distance_m) if route else 0.0,
                coordinates=json.loads(route.geojson)["coordinates"] if route else [],
                bounds=(
                    [route.west, route.south, route.east, route.north] if route else None
                ),
            )
        )

    return WorldOverview(
        trips=entries,
        # Union across trips: a country you crossed twice is one country.
        countries=sorted({code for entry in entries for code in entry.countries}),
        total_distance_m=sum(entry.distance_m for entry in entries),
    )
