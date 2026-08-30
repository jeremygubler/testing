"""Statistics arithmetic – pure, no database."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.services.stats import (
    ELEVATION_THRESHOLD_M,
    TrackPoint,
    classify_segments,
    elevation_change,
    haversine_m,
    moving_time,
    tracked_span,
)

T0 = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)
ZURICH = (47.3769, 8.5417)


def point(minutes: float, lat: float = 47.0, lon: float = 8.0) -> TrackPoint:
    return TrackPoint(lat=lat, lon=lon, recorded_at=T0 + timedelta(minutes=minutes))


class TestElevation:
    def test_no_data_is_no_climb(self) -> None:
        assert elevation_change([]) == (0.0, 0.0)
        assert elevation_change([100.0]) == (0.0, 0.0)
        assert elevation_change([None, None]) == (0.0, 0.0)

    def test_a_clean_climb_and_descent(self) -> None:
        gain, loss = elevation_change([400.0, 700.0, 500.0])
        assert gain == pytest.approx(300.0)
        assert loss == pytest.approx(200.0)

    def test_gps_jitter_does_not_become_a_mountain(self) -> None:
        # An hour standing still, altitude wandering by a few metres. Summing
        # every positive difference would invent ~50 m of ascent here.
        noisy = [400.0, 404.0, 397.0, 403.0, 399.0, 402.0, 398.0, 401.0]
        assert elevation_change(noisy) == (0.0, 0.0)

    def test_a_real_climb_survives_the_filter(self) -> None:
        # Noise on the way up must not swallow the climb itself.
        readings = [400.0, 403.0, 450.0, 447.0, 500.0]
        gain, loss = elevation_change(readings)
        assert gain == pytest.approx(100.0, abs=1.0)
        assert loss == 0.0

    def test_gaps_in_altitude_are_skipped_not_guessed(self) -> None:
        assert elevation_change([400.0, None, 500.0]) == (100.0, 0.0)

    def test_the_threshold_is_the_knob(self) -> None:
        small = [400.0, 400.0 + ELEVATION_THRESHOLD_M - 1]
        assert elevation_change(small) == (0.0, 0.0)
        assert elevation_change(small, threshold_m=0.5)[0] > 0


class TestSegments:
    def test_walking_pace_is_counted_as_walking(self) -> None:
        # ~1.4 m/s over ten minutes.
        points = [point(0), point(10, lat=47.0075)]
        segments = classify_segments(points)
        assert segments.walking_m > 0
        assert segments.cycling_m == segments.vehicle_m == 0

    def test_vehicle_pace_is_counted_as_vehicle(self) -> None:
        # ~25 m/s.
        points = [point(0), point(10, lat=47.135)]
        segments = classify_segments(points)
        assert segments.vehicle_m > 0
        assert segments.walking_m == 0

    def test_standing_still_covers_no_distance(self) -> None:
        points = [point(0), point(10), point(20)]
        assert classify_segments(points).total_m == 0

    def test_a_recording_gap_is_not_a_journey(self) -> None:
        # Two hours with nothing in between: the straight line across it says
        # nothing about how the distance was covered.
        points = [point(0), point(120, lat=48.0)]
        segments = classify_segments(points)
        assert segments.unknown_m > 0
        assert segments.vehicle_m == 0

    def test_out_of_order_points_do_not_produce_negative_time(self) -> None:
        points = [point(10), point(0, lat=47.1)]
        assert classify_segments(points).total_m == 0


class TestTime:
    def test_moving_time_excludes_stops(self) -> None:
        points = [point(0), point(10, lat=47.0075), point(20, lat=47.0075)]
        assert moving_time(points) == timedelta(minutes=10)

    def test_moving_time_excludes_recording_gaps(self) -> None:
        points = [point(0), point(120, lat=48.0)]
        assert moving_time(points) == timedelta(0)

    def test_tracked_span_is_first_to_last(self) -> None:
        assert tracked_span([point(0), point(90)]) == timedelta(minutes=90)
        assert tracked_span([point(0)]) == timedelta(0)


def test_haversine_matches_a_known_distance() -> None:
    zurich = TrackPoint(lat=ZURICH[0], lon=ZURICH[1], recorded_at=T0)
    bern = TrackPoint(lat=46.9480, lon=7.4474, recorded_at=T0)
    assert 90_000 < haversine_m(zurich, bern) < 100_000
    assert haversine_m(zurich, zurich) == 0
