"""Import parsers.

Every parser is a pure function from bytes to an ImportedTrip: no database, no
network, no framework. The formats are where the mess lives — a Polarsteps
export is undocumented and Google has shipped three shapes of its timeline — so
the parsing has to be testable on its own.
"""

from app.services.importers.base import (
    ImportedJournalEntry,
    ImportedPhoto,
    ImportedStop,
    ImportedTrip,
    ImportedWaypoint,
    ImportFormat,
    detect_format,
)
from app.services.importers.google import parse_google_timeline
from app.services.importers.gpx_in import parse_gpx
from app.services.importers.polarsteps import parse_polarsteps
from app.services.importers.reiseapp import parse_reiseapp_json

_PARSERS = {
    ImportFormat.GPX: parse_gpx,
    ImportFormat.REISEAPP: parse_reiseapp_json,
    ImportFormat.POLARSTEPS: parse_polarsteps,
    ImportFormat.GOOGLE_TIMELINE: parse_google_timeline,
}


def parse(data: bytes, fmt: ImportFormat | None = None) -> ImportedTrip:
    return _PARSERS[fmt or detect_format(data)](data)


__all__ = [
    "ImportFormat",
    "ImportedJournalEntry",
    "ImportedPhoto",
    "ImportedStop",
    "ImportedTrip",
    "ImportedWaypoint",
    "detect_format",
    "parse",
    "parse_google_timeline",
    "parse_gpx",
    "parse_polarsteps",
    "parse_reiseapp_json",
]
