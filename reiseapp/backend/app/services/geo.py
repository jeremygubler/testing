"""Shared geo helpers.

Coordinates travel through the API as lat/lon floats and live in the database as
`geography(Point,4326)`. These two functions are the only place that conversion
happens — note that WKT is longitude-first, which is the classic way to store a
route mirrored across the globe.
"""

from __future__ import annotations

from geoalchemy2 import Geometry
from geoalchemy2.elements import WKBElement
from geoalchemy2.shape import to_shape
from sqlalchemy import Cast, cast
from sqlalchemy.orm import InstrumentedAttribute

SRID = 4326
# ST_Simplify works in the units of the geometry, i.e. degrees for 4326. One
# degree of latitude is ~111.32 km; good enough to turn a metre tolerance into a
# rendering simplification, and wrong by at most a factor of cos(lat) east-west.
METRES_PER_DEGREE = 111_320.0


def point_ewkt(lat: float, lon: float) -> str:
    return f"SRID={SRID};POINT({lon} {lat})"


def lat_lon(geom: WKBElement | None) -> tuple[float, float] | None:
    if geom is None:
        return None
    point = to_shape(geom)
    return (point.y, point.x)


def as_geometry(column: InstrumentedAttribute[str]) -> Cast[str]:
    """ST_X/ST_Y are geometry functions; our columns are geography.

    Two traps: `cast(col, text("geometry"))` compiles but explodes when SQLAlchemy
    builds the statement cache key, and the bare `Geometry` class casts to
    `geometry(GEOMETRY,-1)` — SRID -1 is not a valid PostGIS typmod.
    """
    return cast(column, Geometry(geometry_type="POINT", srid=SRID))
