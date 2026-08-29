"""Geo helpers shared by the tests."""

from __future__ import annotations

from geoalchemy2 import Geometry
from sqlalchemy import Cast, cast
from sqlalchemy.orm import InstrumentedAttribute


def point_wkt(lat: float, lon: float) -> str:
    """EWKT as the DB wants it – longitude first."""
    return f"SRID=4326;POINT({lon} {lat})"


def as_geometry(column: InstrumentedAttribute[str]) -> Cast[str]:
    """ST_X/ST_Y are geometry functions; our columns are geography.

    Two traps here. `cast(col, text("geometry"))` compiles but blows up when
    SQLAlchemy builds the statement cache key, and the bare `Geometry` class casts
    to `geometry(GEOMETRY,-1)` – SRID -1 is not a valid PostGIS typmod. Casting to
    the concrete type keeps the SRID.
    """
    return cast(column, Geometry(geometry_type="POINT", srid=4326))
