"""The PDF travel book.

Deliberately self-contained: the route is drawn as a vector sketch from the
recorded points rather than fetched as map tiles. A self-hosted export that
needs an internet connection to render would defeat the purpose, and tile
licensing for redistributed PDFs is its own thicket.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
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


@dataclass
class BookPhoto:
    data: bytes
    caption: str | None = None


@dataclass
class BookItem:
    kind: str
    at: datetime | None
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


class RouteSketch(Flowable):
    """The recorded track, projected into a box. No tiles, no network."""

    def __init__(self, points: list[tuple[float, float]], width: float, height: float) -> None:
        super().__init__()
        self.points = points
        self.width = width
        self.height = height

    def draw(self) -> None:
        canvas = self.canv
        canvas.setStrokeColor(colors.HexColor("#e2e2dd"))
        canvas.setLineWidth(0.5)
        canvas.rect(0, 0, self.width, self.height, stroke=1, fill=0)

        if len(self.points) < 2:
            canvas.setFillColor(MUTED)
            canvas.setFont("Helvetica", 9)
            canvas.drawCentredString(
                self.width / 2, self.height / 2, "Keine aufgezeichnete Route"
            )
            return

        lats = [lat for lat, _ in self.points]
        lons = [lon for _, lon in self.points]
        min_lat, max_lat = min(lats), max(lats)
        min_lon, max_lon = min(lons), max(lons)

        # Equirectangular with a cosine correction, so a north-south track is not
        # stretched into something that looks nothing like the real shape.
        mid_lat = math.radians((min_lat + max_lat) / 2)
        span_x = max((max_lon - min_lon) * math.cos(mid_lat), 1e-9)
        span_y = max(max_lat - min_lat, 1e-9)

        padding = 8
        scale = min((self.width - 2 * padding) / span_x, (self.height - 2 * padding) / span_y)
        offset_x = (self.width - span_x * scale) / 2
        offset_y = (self.height - span_y * scale) / 2

        def project(lat: float, lon: float) -> tuple[float, float]:
            return (
                offset_x + (lon - min_lon) * math.cos(mid_lat) * scale,
                offset_y + (lat - min_lat) * scale,
            )

        path = canvas.beginPath()
        start = project(*self.points[0])
        path.moveTo(*start)
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
            # One unreadable image must not cost the whole book.
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

    story.append(RouteSketch(data.route, CONTENT_WIDTH, 80 * mm))
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

    for item in data.items:
        story.append(Paragraph(_escape(item.title), style["heading"]))
        meta = " · ".join(
            part
            for part in (
                item.at.strftime("%d.%m.%Y, %H:%M") if item.at else None,
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
