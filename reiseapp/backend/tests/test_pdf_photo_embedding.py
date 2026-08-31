from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import as_user
from tests.images import jpeg

pytestmark = pytest.mark.integration

TRIPS = "/api/v1/trips"


async def test_the_book_actually_contains_the_photo(
    api: AsyncClient, db_session: AsyncSession
) -> None:
    """The grid swallows an unreadable image on purpose, so a broken pipeline
    produces a book that is complete in structure and empty of pictures — which
    is exactly what a passing "the export returns 200" test would report as
    success. Hence: look inside the bytes."""
    _, headers = await as_user(api, db_session)
    trip = str((await api.post(TRIPS, json={"title": "Buch"}, headers=headers)).json()["id"])

    upload = await api.post(
        f"{TRIPS}/{trip}/photos",
        files={"file": ("bild.jpg", jpeg(taken_at="2026:06:01 09:15:00", size=(600, 400)),
                        "image/jpeg")},
        headers=headers,
    )
    assert upload.status_code == 201, upload.text

    pdf = await api.get(f"{TRIPS}/{trip}/export.pdf", headers=headers)
    assert pdf.status_code == 200, pdf.text
    assert b"/Image" in pdf.content, "no embedded image resource in the PDF"
