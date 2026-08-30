from __future__ import annotations

import json

from fastapi import APIRouter, Response

from app.api.deps import SessionDep, TripForViewer
from app.services import export as export_service
from app.storage import get_store

router = APIRouter(tags=["export"])


def _attachment(filename: str) -> str:
    # RFC 5987 for the umlauts a trip title will inevitably contain.
    quoted = filename.encode("utf-8").hex()
    ascii_name = filename.encode("ascii", "replace").decode("ascii")
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quoted}"


@router.get("/{trip_id}/export.gpx", response_class=Response)
async def export_gpx(session: SessionDep, trip: TripForViewer) -> Response:
    document, filename = await export_service.to_gpx(session, trip)
    return Response(
        content=document,
        media_type="application/gpx+xml",
        headers={"Content-Disposition": _attachment(filename)},
    )


@router.get("/{trip_id}/export.json", response_class=Response)
async def export_json(session: SessionDep, trip: TripForViewer) -> Response:
    payload, filename = await export_service.to_json(session, trip)
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": _attachment(filename)},
    )


@router.get("/{trip_id}/export.pdf", response_class=Response)
async def export_pdf(session: SessionDep, trip: TripForViewer) -> Response:
    document, filename = await export_service.to_pdf(session, get_store(), trip)
    return Response(
        content=document,
        media_type="application/pdf",
        headers={"Content-Disposition": _attachment(filename)},
    )
