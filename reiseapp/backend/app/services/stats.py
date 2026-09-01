"""Trip statistics.

The arithmetic lives in pure functions because the hard part is not the sums but
the noise: raw GPS altitude wanders by several metres while standing still, and
summing every positive difference turns a flat walk into a mountain stage.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

EARTH_RADIUS_M = 6_371_008.8

# Altitude has to change by at least this much before it counts as a climb.
# Consumer GPS altitude is noisy by roughly ±5-10 m even at a standstill; without
# a threshold a single stationary hour invents a few hundred metres of ascent.
ELEVATION_THRESHOLD_M = 10.0

# Speed thresholds in m/s, the same boundaries the tracking profiles use.
WALKING_MAX = 2.8
CYCLING_MAX = 8.5
# Below this we are not travelling, we are standing.
MOVING_MIN = 0.4
# A gap longer than this is a break in the recording, not a slow leg.
MAX_GAP = timedelta(minutes=30)


@dataclass(frozen=True)
class TrackPoint:
    lat: float
    lon: float
    recorded_at: datetime
    altitude_m: float | None = None


@dataclass
class Segments:
    walking_m: float = 0.0
    cycling_m: float = 0.0
    vehicle_m: float = 0.0
    unknown_m: float = 0.0

    @property
    def total_m(self) -> float:
        return self.walking_m + self.cycling_m + self.vehicle_m + self.unknown_m


def haversine_m(a: TrackPoint, b: TrackPoint) -> float:
    to_rad = math.radians
    d_lat = to_rad(b.lat - a.lat)
    d_lon = to_rad(b.lon - a.lon)
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(to_rad(a.lat)) * math.cos(to_rad(b.lat)) * math.sin(d_lon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def elevation_change(
    altitudes: list[float | None], threshold_m: float = ELEVATION_THRESHOLD_M
) -> tuple[float, float]:
    """Total ascent and descent, in metres.

    Counts a climb only once the altitude has moved `threshold_m` away from the
    last confirmed level, which is the standard way to keep GPS jitter out of the
    total. Returns (gain, loss).
    """
    known = [value for value in altitudes if value is not None]
    if len(known) < 2:
        return (0.0, 0.0)

    gain = loss = 0.0
    reference = known[0]
    for value in known[1:]:
        delta = value - reference
        if abs(delta) < threshold_m:
            continue
        if delta > 0:
            gain += delta
        else:
            loss += -delta
        reference = value
    return (gain, loss)


def classify_segments(points: list[TrackPoint]) -> Segments:
    """Splits the distance travelled by how fast it was covered."""
    segments = Segments()
    for previous, current in zip(points, points[1:], strict=False):
        gap = current.recorded_at - previous.recorded_at
        distance = haversine_m(previous, current)
        if gap <= timedelta(0):
            continue
        if gap > MAX_GAP:
            # A recording gap; the straight line across it is not a journey.
            segments.unknown_m += distance
            continue

        speed = distance / gap.total_seconds()
        if speed < MOVING_MIN:
            continue
        if speed <= WALKING_MAX:
            segments.walking_m += distance
        elif speed <= CYCLING_MAX:
            segments.cycling_m += distance
        else:
            segments.vehicle_m += distance
    return segments


def moving_time(points: list[TrackPoint]) -> timedelta:
    """Time actually spent in motion, excluding stops and recording gaps."""
    total = timedelta(0)
    for previous, current in zip(points, points[1:], strict=False):
        gap = current.recorded_at - previous.recorded_at
        if gap <= timedelta(0) or gap > MAX_GAP:
            continue
        if haversine_m(previous, current) / gap.total_seconds() >= MOVING_MIN:
            total += gap
    return total


def tracked_span(points: list[TrackPoint]) -> timedelta:
    if len(points) < 2:
        return timedelta(0)
    return points[-1].recorded_at - points[0].recorded_at
