"""Import parsers – pure, no database. The formats are where the mess lives."""

from __future__ import annotations

import json
import zipfile
from datetime import UTC, datetime
from io import BytesIO

import pytest

from app.core.errors import AppError
from app.services.importers import (
    ImportFormat,
    detect_format,
    parse_google_timeline,
    parse_gpx,
    parse_polarsteps,
    parse_reiseapp_json,
)

GPX = """<?xml version="1.0"?>
<gpx version="1.1" creator="Garmin" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Alpenquerung</name><desc>Zwei Wochen</desc></metadata>
  <wpt lat="47.3769" lon="8.5417"><name>Zürich HB</name><desc>Start</desc></wpt>
  <trk><name>Tag 1</name><trkseg>
    <trkpt lat="47.3769" lon="8.5417"><ele>408.0</ele><time>2026-06-01T08:00:00Z</time></trkpt>
    <trkpt lat="47.0502" lon="8.3093"><time>2026-06-01T10:00:00Z</time></trkpt>
  </trkseg><trkseg>
    <trkpt lat="46.9480" lon="7.4474"><time>2026-06-01T12:00:00Z</time></trkpt>
  </trkseg></trk>
</gpx>
""".encode()


def test_gpx_reads_track_waypoints_and_metadata() -> None:
    trip = parse_gpx(GPX)
    assert trip.title == "Alpenquerung"
    assert trip.description == "Zwei Wochen"
    # Segments are a recording artefact, not part of the journey.
    assert len(trip.waypoints) == 3
    assert trip.waypoints[0].altitude_m == 408.0
    assert trip.waypoints[0].recorded_at == datetime(2026, 6, 1, 8, tzinfo=UTC)
    assert [stop.name for stop in trip.stops] == ["Zürich HB"]


def test_gpx_without_a_namespace_still_parses() -> None:
    # Plenty of devices emit exactly this.
    raw = b"""<gpx version="1.0"><trk><trkseg>
      <trkpt lat="47.0" lon="8.0"><time>2026-06-01T08:00:00Z</time></trkpt>
    </trkseg></trk></gpx>"""
    assert len(parse_gpx(raw).waypoints) == 1


def test_gpx_falls_back_to_a_planned_route_when_there_is_no_track() -> None:
    raw = b"""<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><rte>
      <rtept lat="47.0" lon="8.0"><time>2026-06-01T08:00:00Z</time></rtept>
    </rte></gpx>"""
    assert len(parse_gpx(raw).waypoints) == 1


def test_gpx_reports_skipped_points_instead_of_hiding_them() -> None:
    raw = b"""<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>
      <trkpt lat="47.0" lon="8.0"><time>2026-06-01T08:00:00Z</time></trkpt>
      <trkpt lat="999" lon="8.0"><time>2026-06-01T09:00:00Z</time></trkpt>
      <trkpt lat="47.1" lon="8.1"></trkpt>
    </trkseg></trk></gpx>"""
    trip = parse_gpx(raw)
    assert len(trip.waypoints) == 1
    assert "2 Punkte" in trip.warnings[0]


def test_gpx_naive_timestamps_are_read_as_utc() -> None:
    # An unusable timestamp would be worse than a slightly wrong one.
    raw = b"""<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>
      <trkpt lat="47.0" lon="8.0"><time>2026-06-01T08:00:00</time></trkpt>
    </trkseg></trk></gpx>"""
    assert parse_gpx(raw).waypoints[0].recorded_at.tzinfo is not None


def test_gpx_without_usable_points_is_an_error() -> None:
    with pytest.raises(AppError):
        parse_gpx(b'<gpx version="1.1"></gpx>')


def test_broken_xml_is_an_error_not_a_crash() -> None:
    with pytest.raises(AppError):
        parse_gpx(b"<gpx><trk>")


# --- own export ------------------------------------------------------------

REISEAPP = json.dumps(
    {
        "format": "reiseapp/trip",
        "version": 1,
        "trip": {"title": "Island", "description": "Ringstrasse"},
        "waypoints": [
            {"lat": 64.14, "lon": -21.94, "recorded_at": "2026-06-01T08:00:00+00:00",
             "altitude_m": 12.0},
            {"lat": 0, "lon": 0, "recorded_at": "2026-06-01T09:00:00+00:00"},
        ],
        "stops": [{"name": "Reykjavík", "lat": 64.14, "lon": -21.94, "country": "IS"}],
        "journal_entries": [
            {"title": "Tag 1", "text": "Angekommen.", "timestamp": "2026-06-01T20:00:00+00:00"}
        ],
        "photos": [{"id": "x"}],
    }
).encode()


def test_reiseapp_export_round_trips() -> None:
    trip = parse_reiseapp_json(REISEAPP)
    assert trip.title == "Island"
    # 0/0 means "no fix", not the Gulf of Guinea.
    assert len(trip.waypoints) == 1
    assert trip.stops[0].country == "IS"
    assert trip.entries[0].title == "Tag 1"
    # Photos are metadata only; saying so beats a silent gap.
    assert "Fotos" in trip.warnings[0]


def test_unknown_export_version_is_refused() -> None:
    payload = json.loads(REISEAPP)
    payload["version"] = 99
    with pytest.raises(AppError, match="version"):
        parse_reiseapp_json(json.dumps(payload).encode())


# --- Polarsteps ------------------------------------------------------------

POLARSTEPS_TRIP = {
    "name": "Südostasien",
    "summary": "Drei Monate",
    "all_steps": [
        {
            "display_name": "Bangkok",
            "start_time": 1780000000,
            "description": "Ankunft nachts.",
            "location": {"lat": 13.7563, "lon": 100.5018, "country_code": "th"},
        },
        {"display_name": "Kaputt", "location": {"lat": None, "lon": None}},
    ],
}
POLARSTEPS_LOCATIONS = {
    "locations": [
        {"lat": 13.7563, "lon": 100.5018, "time": 1780000000},
        {"lat": 13.80, "lon": 100.55, "time": 1780003600.5},
        {"lat": None, "lon": 100.55, "time": 1780007200},
    ]
}


def _polarsteps_zip() -> bytes:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("trip/trip.json", json.dumps(POLARSTEPS_TRIP))
        archive.writestr("trip/locations.json", json.dumps(POLARSTEPS_LOCATIONS))
    return buffer.getvalue()


def test_polarsteps_zip_yields_stops_track_and_journal() -> None:
    trip = parse_polarsteps(_polarsteps_zip())
    assert trip.title == "Südostasien"
    assert [stop.name for stop in trip.stops] == ["Bangkok"]
    assert trip.stops[0].country == "TH"
    assert len(trip.waypoints) == 2
    # A step's prose is the journal; it would otherwise be dropped.
    assert trip.entries[0].text == "Ankunft nachts."
    assert "1 Positionen" in trip.warnings[0]


def test_polarsteps_accepts_bare_json_too() -> None:
    trip = parse_polarsteps(json.dumps(POLARSTEPS_TRIP).encode())
    assert [stop.name for stop in trip.stops] == ["Bangkok"]


def test_polarsteps_millisecond_timestamps() -> None:
    payload = {"locations": [{"lat": 13.7, "lon": 100.5, "time": 1780000000000}]}
    trip = parse_polarsteps(json.dumps(payload).encode())
    assert trip.waypoints[0].recorded_at.year == 2026


# --- Google Timeline -------------------------------------------------------


def test_google_semantic_location_history() -> None:
    payload = {
        "timelineObjects": [
            {
                "placeVisit": {
                    "location": {"latitudeE7": 473769000, "longitudeE7": 85417000,
                                 "name": "Zürich HB"},
                    "duration": {"startTimestamp": "2026-06-01T08:00:00Z",
                                 "endTimestamp": "2026-06-01T09:00:00Z"},
                }
            },
            {
                "activitySegment": {
                    "startLocation": {"latitudeE7": 473769000, "longitudeE7": 85417000},
                    "endLocation": {"latitudeE7": 470502000, "longitudeE7": 83093000},
                    "duration": {"startTimestamp": "2026-06-01T09:00:00Z",
                                 "endTimestamp": "2026-06-01T10:00:00Z"},
                }
            },
        ]
    }
    trip = parse_google_timeline(json.dumps(payload).encode())
    assert [stop.name for stop in trip.stops] == ["Zürich HB"]
    assert trip.stops[0].lat == pytest.approx(47.3769)
    assert len(trip.waypoints) == 2


def test_google_records_export() -> None:
    payload = {
        "locations": [
            {"latitudeE7": 473769000, "longitudeE7": 85417000,
             "timestampMs": "1780000000000", "accuracy": 12},
        ]
    }
    trip = parse_google_timeline(json.dumps(payload).encode())
    assert trip.waypoints[0].accuracy_m == 12.0


def test_google_new_semantic_segments_with_geo_strings() -> None:
    payload = {
        "semanticSegments": [
            {
                "timelinePath": [
                    {"point": "geo:47.376900,8.541700", "time": "2026-06-01T08:00:00Z"},
                    {"point": "kaputt", "time": "2026-06-01T09:00:00Z"},
                ]
            }
        ]
    }
    trip = parse_google_timeline(json.dumps(payload).encode())
    assert len(trip.waypoints) == 1
    assert trip.waypoints[0].lon == pytest.approx(8.5417)


def test_google_waypoints_come_back_in_time_order() -> None:
    payload = {
        "locations": [
            {"latitudeE7": 470000000, "longitudeE7": 80000000, "timestampMs": "1780003600000"},
            {"latitudeE7": 471000000, "longitudeE7": 81000000, "timestampMs": "1780000000000"},
        ]
    }
    times = [p.recorded_at for p in parse_google_timeline(json.dumps(payload).encode()).waypoints]
    assert times == sorted(times)


# --- detection -------------------------------------------------------------


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        (GPX, ImportFormat.GPX),
        (REISEAPP, ImportFormat.REISEAPP),
        (_polarsteps_zip(), ImportFormat.POLARSTEPS),
        (b'{"timelineObjects": []}', ImportFormat.GOOGLE_TIMELINE),
        (b'{"locations": []}', ImportFormat.GOOGLE_TIMELINE),
        (b'{"all_steps": []}', ImportFormat.POLARSTEPS),
    ],
)
def test_format_detection(data: bytes, expected: ImportFormat) -> None:
    assert detect_format(data) == expected


def test_unrecognised_file_is_refused_clearly() -> None:
    with pytest.raises(AppError):
        detect_format(b"just some text")
