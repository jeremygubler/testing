"""The book's map page: rendered map when there is one, sketch when there is not."""

from __future__ import annotations

from datetime import UTC, date, datetime

from app.services.pdfbook import BookData, BookItem, build_pdf
from tests.images import jpeg

ROUTE = [(47.24, 7.97), (47.30, 8.10), (47.38, 8.54)]


def book(**fields: object) -> BookData:
    return BookData(
        title="Thailand",
        description=None,
        subtitle=None,
        stats=[("Distanz", "420 m")],
        route=ROUTE,
        items=[
            BookItem(
                kind="stop",
                at=datetime(2026, 6, 1, 9, tzinfo=UTC),
                day=1,
                date=date(2026, 6, 1),
                title="Ankunft",
            )
        ],
        **fields,  # type: ignore[arg-type]
    )


# "/Image" alone is useless as a marker: ReportLab writes /ImageB /ImageC
# /ImageI into every page's /ProcSet whether or not a picture is present.
IMAGE_XOBJECT = b"/Subtype /Image"


def test_a_rendered_map_is_embedded() -> None:
    pdf = build_pdf(book(map_image=jpeg(size=(1000, 620))))
    assert IMAGE_XOBJECT in pdf


def test_without_a_tileserver_the_sketch_carries_the_page() -> None:
    pdf = build_pdf(book())
    assert pdf.startswith(b"%PDF")
    # The sketch is drawn on the canvas, not embedded as a resource.
    assert IMAGE_XOBJECT not in pdf


def test_an_unreadable_map_falls_back_instead_of_failing() -> None:
    """A tileserver that answers with something else must not cost the export."""
    pdf = build_pdf(book(map_image=b"this is not an image"))
    assert pdf.startswith(b"%PDF")
