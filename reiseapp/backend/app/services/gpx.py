"""GPX 1.1 export.

Built as a pure function over plain values: the format is fiddly (namespaces,
element order, escaping) and worth testing without a database in the way.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from xml.etree import ElementTree as ET

GPX_NS = "http://www.topografix.com/GPX/1/1"
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"
SCHEMA_LOCATION = f"{GPX_NS} http://www.topografix.com/GPX/1/1/gpx.xsd"
CREATOR = "reiseapp"


@dataclass(frozen=True)
class GpxPoint:
    lat: float
    lon: float
    time: datetime | None = None
    elevation_m: float | None = None
    name: str | None = None
    description: str | None = None


@dataclass(frozen=True)
class GpxTrip:
    title: str
    description: str | None = None
    track: tuple[GpxPoint, ...] = ()
    stops: tuple[GpxPoint, ...] = ()


def _format_time(value: datetime) -> str:
    # GPX wants UTC with a Z suffix; a local offset is legal but read back
    # inconsistently by a lot of tools.
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _point_element(tag: str, point: GpxPoint) -> ET.Element:
    element = ET.Element(tag, {"lat": f"{point.lat:.7f}", "lon": f"{point.lon:.7f}"})
    # Order matters in GPX: ele, time, name, desc.
    if point.elevation_m is not None:
        ET.SubElement(element, "ele").text = f"{point.elevation_m:.2f}"
    if point.time is not None:
        ET.SubElement(element, "time").text = _format_time(point.time)
    if point.name:
        ET.SubElement(element, "name").text = point.name
    if point.description:
        ET.SubElement(element, "desc").text = point.description
    return element


def build_gpx(trip: GpxTrip, *, generated_at: datetime | None = None) -> str:
    root = ET.Element(
        "gpx",
        {
            "version": "1.1",
            "creator": CREATOR,
            "xmlns": GPX_NS,
            "xmlns:xsi": XSI_NS,
            "xsi:schemaLocation": SCHEMA_LOCATION,
        },
    )

    metadata = ET.SubElement(root, "metadata")
    ET.SubElement(metadata, "name").text = trip.title
    if trip.description:
        ET.SubElement(metadata, "desc").text = trip.description
    ET.SubElement(metadata, "time").text = _format_time(generated_at or datetime.now(UTC))

    # Stops become waypoints, the recorded track becomes a single track segment.
    for stop in trip.stops:
        root.append(_point_element("wpt", stop))

    if trip.track:
        track = ET.SubElement(root, "trk")
        ET.SubElement(track, "name").text = trip.title
        segment = ET.SubElement(track, "trkseg")
        for point in trip.track:
            segment.append(_point_element("trkpt", point))

    ET.indent(root, space="  ")
    body = ET.tostring(root, encoding="unicode")
    return f'<?xml version="1.0" encoding="UTF-8"?>\n{body}\n'
