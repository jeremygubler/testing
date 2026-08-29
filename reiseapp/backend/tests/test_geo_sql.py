"""Compile-only guards for the geo SQL – no database needed."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.dialects import postgresql

from app.models import Waypoint
from tests.geo import as_geometry, point_wkt


def _compile(statement: object) -> str:
    return str(statement.compile(dialect=postgresql.dialect()))  # type: ignore[attr-defined]


def test_point_wkt_is_lon_lat() -> None:
    assert point_wkt(47.3769, 8.5417) == "SRID=4326;POINT(8.5417 47.3769)"


def test_geography_column_casts_to_geometry_for_st_x_y() -> None:
    geom = as_geometry(Waypoint.geom)
    sql = _compile(select(func.ST_Y(geom), func.ST_X(geom)))
    # geometry(POINT,4326) and not geometry(GEOMETRY,-1): -1 is not a valid SRID.
    assert "CAST(waypoints.geom AS geometry(POINT,4326))" in sql


def test_statement_with_cast_is_cacheable() -> None:
    # Regression: casting to a text() clause instead of a type compiles fine but
    # raises AttributeError when SQLAlchemy generates the statement cache key.
    statement = select(func.ST_Y(as_geometry(Waypoint.geom)))
    assert statement._generate_cache_key() is not None
