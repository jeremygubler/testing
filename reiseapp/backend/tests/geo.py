"""Geo helpers shared by the tests – the cast itself lives in the app."""

from __future__ import annotations

from app.services.geo import as_geometry, point_ewkt

__all__ = ["as_geometry", "point_wkt"]


def point_wkt(lat: float, lon: float) -> str:
    """EWKT as the DB wants it – longitude first."""
    return point_ewkt(lat, lon)
