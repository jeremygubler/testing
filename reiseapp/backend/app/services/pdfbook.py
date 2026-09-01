"""The PDF travel book.

Deliberately self-contained: the route is drawn as a vector sketch from the
recorded points rather than fetched as map tiles. A self-hosted export that
needs an internet connection to render would defeat the purpose, and tile
licensing for redistributed PDFs is its own thicket.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date as date_type
from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Flowable,
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ACCENT = colors.HexColor("#2f6f4f")
MUTED = colors.HexColor("#6b6b63")
PAGE_WIDTH, PAGE_HEIGHT = A4
CONTENT_WIDTH = PAGE_WIDTH - 40 * mm

logger = logging.getLogger(__name__)


@dataclass
class BookPhoto:
    data: bytes
    caption: str | None = None


@dataclass
class BookItem:
    kind: str
    at: datetime | None
    #: Which day of the journey this belongs to, so the book can set chapters
    #: where the timeline sets headings — the same cut in both.
    day: int | None
    date: date_type | None
    title: str
    text: str | None = None
    subtitle: str | None = None
    photos: list[BookPhoto] | None = None


@dataclass
class BookData:
    title: str
    description: str | None
    subtitle: str | None
    stats: list[tuple[str, str]]
    route: list[tuple[float, float]]
    items: list[BookItem]
    #: A rendered map with the route on it, when a tileserver could supply one.
    #: Absent falls back to the sketch, which needs no network and no service.
    map_image: bytes | None = None
    #: Drawn into the same frame as the route, so a trip that was never tracked
    #: still shows where it happened.
    stop_places: list[tuple[float, float]] = field(default_factory=list)
    photo_places: list[tuple[float, float]] = field(default_factory=list)


LatLon = tuple[float, float]

SKETCH_PADDING = 8.0


def fit_projection(
    places: list[LatLon], width: float, height: float, padding: float = SKETCH_PADDING
) -> Callable[[float, float], tuple[float, float]]:
    """Maps coordinates into a drawing box, centred and to scale.

    Equirectangular with a cosine correction, so a north-south track is not
    stretched into a shape the traveller would not recognise. A single place, or
    several at the same spot, has no extent at all — the guard against a zero
    span is what keeps that from dividing the drawing by nothing.
    """
    lats = [lat for lat, _ in places]
    lons = [lon for _, lon in places]
    min_lat, max_lat = min(lats), max(lats)
    min_lon, max_lon = min(lons), max(lons)

    mid_lat = math.radians((min_lat + max_lat) / 2)
    stretch = math.cos(mid_lat)
    span_x = max((max_lon - min_lon) * stretch, 1e-9)
    span_y = max(max_lat - min_lat, 1e-9)

    scale = min((width - 2 * padding) / span_x, (height - 2 * padding) / span_y)
    offset_x = (width - span_x * scale) / 2
    offset_y = (height - span_y * scale) / 2

    def project(lat: float, lon: float) -> tuple[float, float]:
        return (
            offset_x + (lon - min_lon) * stretch * scale,
            offset_y + (lat - min_lat) * scale,
        )

    return project


class RouteSketch(Flowable):
    """The trip's geography, projected into a box. No tiles, no network."""

    def __init__(
        self,
        points: list[LatLon],
        width: float,
        height: float,
        stops: list[LatLon] | None = None,
        photos: list[LatLon] | None = None,
    ) -> None:
        super().__init__()
        self.points = points
        self.stops = stops or []
        self.photos = photos or []
        self.width = width
        self.height = height

    def draw(self) -> None:
        canvas = self.canv
        canvas.setStrokeColor(colors.HexColor("#e2e2dd"))
        canvas.setLineWidth(0.5)
        canvas.rect(0, 0, self.width, self.height, stroke=1, fill=0)

        # Stops and photos share the frame with the route: a trip that was never
        # tracked still happened somewhere, and drawing nothing said otherwise.
        places = [*self.points, *self.stops, *self.photos]
        if not places:
            canvas.setFillColor(MUTED)
            canvas.setFont("Helvetica", 9)
            canvas.drawCentredString(self.width / 2, self.height / 2, "Noch nichts verortet")
            return

        project = fit_projection(places, self.width, self.height)

        if len(self.points) > 1:
            path = canvas.beginPath()
            path.moveTo(*project(*self.points[0]))
            for lat, lon in self.points[1:]:
                path.lineTo(*project(lat, lon))

            canvas.setStrokeColor(ACCENT)
            canvas.setLineWidth(1.4)
            canvas.setLineJoin(1)
            canvas.setLineCap(1)
            canvas.drawPath(path)

            # Start and end markers, so the direction of travel is readable.
            canvas.setFillColor(ACCENT)
            canvas.circle(*project(*self.points[0]), 2.5, stroke=0, fill=1)
            canvas.setFillColor(colors.HexColor("#a4342b"))
            canvas.circle(*project(*self.points[-1]), 2.5, stroke=0, fill=1)

        canvas.setFillColor(colors.white)
        canvas.setStrokeColor(ACCENT)
        canvas.setLineWidth(1.2)
        for lat, lon in self.stops:
            canvas.circle(*project(lat, lon), 3.2, stroke=1, fill=1)

        canvas.setFillColor(MUTED)
        for lat, lon in self.photos:
            x, y = project(lat, lon)
            canvas.rect(x - 1.8, y - 1.8, 3.6, 3.6, stroke=0, fill=1)


# ReportLab carries no locale, and the server's is not the reader's language.
_WEEKDAYS = (
    "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag",
)


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle(
            "cover_title", parent=base["Title"], fontSize=30, leading=36, spaceAfter=6
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub", parent=base["Normal"], fontSize=13, textColor=MUTED,
            alignment=TA_CENTER, spaceAfter=18,
        ),
        "day": ParagraphStyle(
            "day", parent=base["Heading1"], fontSize=19, leading=23, spaceBefore=0,
            spaceAfter=4, borderPadding=0,
        ),
        "heading": ParagraphStyle(
            "heading", parent=base["Heading2"], fontSize=15, textColor=ACCENT, spaceBefore=14,
            spaceAfter=2,
        ),
        "meta": ParagraphStyle("meta", parent=base["Normal"], fontSize=8.5, textColor=MUTED),
        "body": ParagraphStyle("body", parent=base["BodyText"], fontSize=10.5, leading=15),
        "caption": ParagraphStyle(
            "caption", parent=base["Normal"], fontSize=8, textColor=MUTED, spaceBefore=2
        ),
    }


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _photo_grid(photos: list[BookPhoto], columns: int = 3) -> Table | None:
    cells: list[Image] = []
    size = (CONTENT_WIDTH - (columns - 1) * 6) / columns
    for photo in photos:
        try:
            reader = ImageReader(BytesIO(photo.data))
            width, height = reader.getSize()
            ratio = height / width if width else 1
            cells.append(Image(BytesIO(photo.data), width=size, height=size * ratio))
        except Exception:
            # One unreadable image must not cost the whole book — but a book
            # that quietly loses every picture looks like a bug in the export,
            # and silence is what makes that impossible to tell apart.
            logger.warning("pdf: skipping an image ReportLab could not read", exc_info=True)
            continue
    if not cells:
        return None

    rows = [cells[i : i + columns] for i in range(0, len(cells), columns)]
    padded: list[list[Image | str]] = [row + [""] * (columns - len(row)) for row in rows]
    table = Table(padded, colWidths=[size] * columns, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def _map_page(data: BookData) -> Flowable:
    """The rendered map if there is one, the sketch otherwise.

    Not a conditional at the call site, because the fallback is the normal case
    for anyone who has not set up a tileserver — and a book without a map page
    would be missing a page, not a picture.
    """
    height = 80 * mm
    if data.map_image is not None:
        try:
            reader = ImageReader(BytesIO(data.map_image))
            width, pixels_high = reader.getSize()
            ratio = pixels_high / width if width else 0.62
            return Image(BytesIO(data.map_image), width=CONTENT_WIDTH, height=CONTENT_WIDTH * ratio)
        except Exception:
            logger.warning("pdf: the map image could not be read", exc_info=True)

    return RouteSketch(
        data.route, CONTENT_WIDTH, height,
        stops=data.stop_places, photos=data.photo_places,
    )


def build_pdf(data: BookData) -> bytes:
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
        title=data.title,
        author="Fernspur",
    )
    style = _styles()
    story: list[object] = []

    story.append(Spacer(1, 40 * mm))
    story.append(Paragraph(_escape(data.title), style["cover_title"]))
    if data.subtitle:
        story.append(Paragraph(_escape(data.subtitle), style["cover_sub"]))
    if data.description:
        story.append(Paragraph(_escape(data.description), style["body"]))
        story.append(Spacer(1, 8 * mm))

    story.append(_map_page(data))
    story.append(Spacer(1, 8 * mm))

    if data.stats:
        stats = Table(
            [[label for label, _ in data.stats], [value for _, value in data.stats]],
            colWidths=[CONTENT_WIDTH / len(data.stats)] * len(data.stats),
        )
        stats.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, 0), 8),
                    ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
                    ("FONTSIZE", (0, 1), (-1, 1), 14),
                    ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("TOPPADDING", (0, 1), (-1, 1), 2),
                ]
            )
        )
        story.append(stats)

    story.append(PageBreak())

    current_day: int | None = None
    for item in data.items:
        # A travel book is read by days, not by timestamps. The heading carries
        # the date once; every row below it then only needs its time.
        if item.day is not None and item.day != current_day:
            current_day = item.day
            heading = f"Tag {item.day}"
            if item.date is not None:
                heading += f" · {_WEEKDAYS[item.date.weekday()]}, {item.date.strftime('%d.%m.%Y')}"
            story.append(Spacer(1, 6 * mm))
            story.append(Paragraph(_escape(heading), style["day"]))

        story.append(Paragraph(_escape(item.title), style["heading"]))
        meta = " · ".join(
            part
            for part in (
                item.at.strftime("%H:%M") if item.at else None,
                item.subtitle,
            )
            if part
        )
        if meta:
            story.append(Paragraph(_escape(meta), style["meta"]))
        if item.text:
            story.append(Spacer(1, 3))
            for paragraph in item.text.split("\n"):
                if paragraph.strip():
                    story.append(Paragraph(_escape(paragraph), style["body"]))
        if item.photos:
            grid = _photo_grid(item.photos)
            if grid is not None:
                story.append(Spacer(1, 4))
                story.append(grid)

    if not data.items:
        story.append(Paragraph("Diese Reise hat noch keine Einträge.", style["body"]))

    document.build(story)
    return buffer.getvalue()
