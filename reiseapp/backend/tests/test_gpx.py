"""GPX export – pure, no database."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone
from xml.etree import ElementTree as ET

from app.services.gpx import GPX_NS, GpxPoint, GpxTrip, build_gpx

T0 = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)
NS = {"g": GPX_NS}


def parse(xml: str) -> ET.Element:
    return ET.fromstring(xml)


def test_minimal_trip_is_valid_xml_with_metadata() -> None:
    xml = build_gpx(GpxTrip(title="Island"), generated_at=T0)
    root = parse(xml)

    assert xml.startswith('<?xml version="1.0" encoding="UTF-8"?>')
    assert root.get("version") == "1.1"
    assert root.findtext("g:metadata/g:name", namespaces=NS) == "Island"
    assert root.findtext("g:metadata/g:time", namespaces=NS) == "2026-06-01T08:00:00Z"


def test_track_points_carry_time_and_elevation() -> None:
    trip = GpxTrip(
        title="Wanderung",
        track=(
            GpxPoint(lat=47.3769, lon=8.5417, time=T0, elevation_m=408.0),
            GpxPoint(lat=46.9480, lon=7.4474, time=T0 + timedelta(hours=2)),
        ),
    )
    root = parse(build_gpx(trip))
    points = root.findall("g:trk/g:trkseg/g:trkpt", NS)

    assert len(points) == 2
    assert points[0].get("lat") == "47.3769000"
    assert points[0].findtext("g:ele", namespaces=NS) == "408.00"
    assert points[1].find("g:ele", NS) is None


def test_times_are_normalised_to_utc() -> None:
    # A local offset is legal GPX but read back inconsistently by many tools.
    local = datetime(2026, 6, 1, 10, 0, tzinfo=timezone(timedelta(hours=2)))
    root = parse(build_gpx(GpxTrip(title="x", track=(GpxPoint(1.0, 2.0, time=local),))))
    assert root.findtext("g:trk/g:trkseg/g:trkpt/g:time", namespaces=NS) == "2026-06-01T08:00:00Z"


def test_stops_become_waypoints() -> None:
    trip = GpxTrip(
        title="Reise",
        stops=(GpxPoint(lat=47.0, lon=8.0, name="Zürich HB", description="Start"),),
    )
    root = parse(build_gpx(trip))
    waypoint = root.find("g:wpt", NS)

    assert waypoint is not None
    assert waypoint.findtext("g:name", namespaces=NS) == "Zürich HB"
    assert waypoint.findtext("g:desc", namespaces=NS) == "Start"


def test_special_characters_are_escaped() -> None:
    xml = build_gpx(GpxTrip(title="Fish & Chips <Reise>"))
    assert "Fish &amp; Chips &lt;Reise&gt;" in xml
    assert parse(xml).findtext("g:metadata/g:name", namespaces=NS) == "Fish & Chips <Reise>"


def test_umlauts_survive() -> None:
    root = parse(build_gpx(GpxTrip(title="Zürich–Bern")))
    assert root.findtext("g:metadata/g:name", namespaces=NS) == "Zürich–Bern"


def test_a_trip_without_a_track_has_no_empty_trk_element() -> None:
    root = parse(build_gpx(GpxTrip(title="Leer")))
    assert root.find("g:trk", NS) is None
