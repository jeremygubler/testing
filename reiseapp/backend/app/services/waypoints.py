from __future__ import annotations

import json
from datetime import datetime
from uuid import uuid4

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Trip, Waypoint
from app.schemas.geo import RouteRead, WaypointBatchResult, WaypointCreate, WaypointRead
from app.services.geo import METRES_PER_DEGREE, as_geometry, point_ewkt

MAX_PAGE = 5000


async def store_batch(
    session: AsyncSession, trip: Trip, items: list[WaypointCreate]
) -> WaypointBatchResult:
    """Insert a batch of tracked points, ignoring ones already stored.

    ON CONFLICT DO NOTHING on the primary key is what makes a retried upload
    safe: a flaky connection during phase 3's background sync would otherwise
    duplicate every point in the batch.
    """
    rows: list[dict[str, object]] = [
        {
            "id": item.id or uuid4(),
            "trip_id": trip.id,
            "geom": point_ewkt(item.lat, item.lon),
            "altitude_m": item.altitude_m,
            "accuracy_m": item.accuracy_m,
            "speed_mps": item.speed_mps,
            "heading_deg": item.heading_deg,
            "recorded_at": item.recorded_at,
            "source": item.source,
            "device_id": item.device_id,
        }
        for item in items
    ]
    # Deduplicate inside the batch too – ON CONFLICT cannot resolve a conflict
    # between two rows of the same statement.
    unique: dict[object, dict[str, object]] = {row["id"]: row for row in rows}

    statement = (
        pg_insert(Waypoint)
        .values(list(unique.values()))
        .on_conflict_do_nothing(index_elements=["id"])
        .returning(Waypoint.id)
    )
    result = await session.execute(statement)
    stored = len(result.scalars().all())
    return WaypointBatchResult(
        received=len(items), stored=stored, duplicates=len(items) - stored
    )


async def list_waypoints(
    session: AsyncSession,
    trip: Trip,
    *,
    since: datetime | None = None,
    limit: int = 1000,
) -> list[WaypointRead]:
    statement = (
        select(
            Waypoint.id,
            func.ST_Y(as_geometry(Waypoint.geom)).label("lat"),
            func.ST_X(as_geometry(Waypoint.geom)).label("lon"),
            Waypoint.altitude_m,
            Waypoint.accuracy_m,
            Waypoint.speed_mps,
            Waypoint.heading_deg,
            Waypoint.recorded_at,
            Waypoint.source,
            Waypoint.device_id,
        )
        .where(Waypoint.trip_id == trip.id, Waypoint.deleted_at.is_(None))
        .order_by(Waypoint.recorded_at, Waypoint.id)
        .limit(min(limit, MAX_PAGE))
    )
    if since is not None:
        statement = statement.where(Waypoint.recorded_at > since)
    result = await session.execute(statement)
    return [WaypointRead(**row._mapping) for row in result.all()]


_ROUTE_SQL = text(
    """
    WITH points AS (
        SELECT geom::geometry AS g
        FROM waypoints
        WHERE trip_id = :trip_id AND deleted_at IS NULL
        ORDER BY recorded_at, id
    ), line AS (
        SELECT ST_MakeLine(g) AS g FROM points
    ), params AS (
        -- The cast is load-bearing: next to the literal 0 an untyped parameter is
        -- inferred as int4, and the fractional tolerance silently arrives as 0 —
        -- simplification would then never happen and never complain.
        SELECT CAST(:tolerance AS double precision) AS tolerance
    )
    SELECT
        ST_NPoints(g) AS point_count,
        ST_Length(g::geography) AS distance_m,
        ST_XMin(g) AS west, ST_YMin(g) AS south,
        ST_XMax(g) AS east, ST_YMax(g) AS north,
        ST_AsGeoJSON(
            CASE WHEN p.tolerance > 0 THEN ST_Simplify(g, p.tolerance) ELSE g END
        ) AS geojson
    FROM line, params p
    WHERE g IS NOT NULL
    """
)


async def route(session: AsyncSession, trip: Trip, simplify_m: float = 0.0) -> RouteRead:
    """The trip's track as GeoJSON, with length and bounds computed by PostGIS."""
    tolerance = max(simplify_m, 0.0) / METRES_PER_DEGREE
    result = await session.execute(
        _ROUTE_SQL, {"trip_id": trip.id, "tolerance": tolerance}
    )
    row = result.one_or_none()
    if row is None:
        return RouteRead(coordinates=[], point_count=0, distance_m=0.0)

    geometry = json.loads(row.geojson)
    coordinates = geometry.get("coordinates", [])
    # A single waypoint makes ST_MakeLine return a POINT, whose coordinates are
    # a bare [lon, lat] pair rather than a list of pairs.
    if geometry.get("type") == "Point":
        coordinates = [coordinates]
    return RouteRead(
        coordinates=coordinates,
        point_count=row.point_count,
        distance_m=row.distance_m or 0.0,
        bounds=[row.west, row.south, row.east, row.north],
    )
