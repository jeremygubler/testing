"""Renders the trip onto a real map, via a self-hosted tileserver-gl.

Optional by design: the book has a vector sketch that needs nothing, and an
export must not fail because a service is down. This upgrades the map page when
a tileserver is configured and reachable, and gets out of the way otherwise.
"""

from __future__ import annotations

import logging
from urllib.parse import quote, urlencode

import httpx

logger = logging.getLogger(__name__)

LatLon = tuple[float, float]

#: tileserver-gl puts the whole path into the URL. Servers and proxies stop
#: reading somewhere around 8 kB, and a recorded trip has thousands of points,
#: so the line has to be thinned before it is asked for.
MAX_PATH_POINTS = 120

#: Coordinates beyond this are noise at any zoom a page can show: one ten-
#: thousandth of a degree is about 11 metres.
COORDINATE_DECIMALS = 4

REQUEST_TIMEOUT_SECONDS = 20.0


def thin(points: list[LatLon], limit: int = MAX_PATH_POINTS) -> list[LatLon]:
    """Evenly samples a line down to `limit` points, keeping both ends.

    Evenly rather than by shape: this only decides how much of the line survives
    into a URL, and the geometry has already been simplified by PostGIS. Losing
    the last point would visibly shorten the route, so it is kept explicitly.
    """
    if limit < 2 or len(points) <= limit:
        return list(points)

    step = (len(points) - 1) / (limit - 1)
    sampled = [points[round(index * step)] for index in range(limit - 1)]
    sampled.append(points[-1])
    return sampled


def _pairs(points: list[LatLon]) -> str:
    return "|".join(
        f"{lat:.{COORDINATE_DECIMALS}f},{lon:.{COORDINATE_DECIMALS}f}"
        for lat, lon in points
    )


def static_map_url(
    base_url: str,
    style: str,
    route: list[LatLon],
    *,
    width: int = 1000,
    height: int = 620,
    stroke: str = "#2f6f4f",
    line_width: int = 4,
) -> str | None:
    """The URL of a map image fitted around the route, or None if there is none.

    `auto` lets the server choose centre and zoom. Doing that here would mean
    reimplementing the web mercator maths it already contains, and getting the
    padding subtly wrong.
    """
    if not base_url or len(route) < 2:
        return None

    path = f"fill:none|stroke:{stroke}|width:{line_width}|{_pairs(thin(route))}"
    query = urlencode({"path": path})
    return (
        f"{base_url.rstrip('/')}/styles/{quote(style)}/static/auto"
        f"/{width}x{height}@2x.png?{query}"
    )


async def render(
    base_url: str, style: str, route: list[LatLon], **options: object
) -> bytes | None:
    """Fetches the map image. Any failure is a missing picture, never a failed export."""
    url = static_map_url(base_url, style, route, **options)  # type: ignore[arg-type]
    if url is None:
        return None

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.get(url)
        response.raise_for_status()
    except httpx.HTTPError:
        logger.warning("tiles: no map image for the book", exc_info=True)
        return None

    if not response.headers.get("content-type", "").startswith("image/"):
        logger.warning(
            "tiles: expected an image, got %s", response.headers.get("content-type")
        )
        return None
    return response.content
