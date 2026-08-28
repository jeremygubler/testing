"""Belege zu Buchungen: hochladen, ansehen, loeschen."""

from fastapi import APIRouter, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, undefer

from app.deps import CurrentHousehold, DbSession
from app.models import Attachment, Transaction
from app.schemas import AttachmentRead
from app.services import attachments as service

router = APIRouter(tags=["attachments"])

#: Belege aendern sich nie -- sie werden hochgeladen oder geloescht, nie bearbeitet.
#: Deshalb darf der Browser sie behalten, statt jede Vorschau neu zu holen.
_CACHE = "private, max-age=31536000, immutable"


def _to_read(row: Attachment) -> AttachmentRead:
    return AttachmentRead(
        id=row.id,
        txn_id=row.txn_id,
        filename=row.filename,
        content_type=row.content_type,
        size_bytes=row.size_bytes,
        width=row.width,
        height=row.height,
        created_at=row.created_at,
        has_thumbnail=row.thumbnail is not None,
    )


def _get_txn(db: Session, household_id: int, txn_id: int) -> Transaction:
    txn = db.get(Transaction, txn_id)
    if txn is None or txn.household_id != household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Buchung nicht gefunden.")
    return txn


def _get(db: Session, household_id: int, attachment_id: int, *, with_data: bool) -> Attachment:
    query = select(Attachment).where(Attachment.id == attachment_id)
    if with_data:
        query = query.options(undefer(Attachment.data), undefer(Attachment.thumbnail))
    row = db.scalar(query)
    if row is None or row.household_id != household_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Beleg nicht gefunden.")
    return row


@router.get("/api/transactions/{txn_id}/attachments", response_model=list[AttachmentRead])
def list_attachments(
    txn_id: int, household: CurrentHousehold, db: DbSession
) -> list[AttachmentRead]:
    txn = _get_txn(db, household.id, txn_id)
    return [_to_read(row) for row in txn.attachments]


@router.post(
    "/api/transactions/{txn_id}/attachments",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    txn_id: int,
    household: CurrentHousehold,
    db: DbSession,
    file: UploadFile = File(...),
) -> AttachmentRead:
    """Nimmt einen Beleg an, verkleinert ihn und haengt ihn an die Buchung."""
    _get_txn(db, household.id, txn_id)
    raw = await file.read()

    try:
        prepared = service.prepare(raw, file.content_type)
    except service.AttachmentError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    attachment = Attachment(
        household_id=household.id,
        txn_id=txn_id,
        # Nur der reine Dateiname, ohne Pfad: Browser schicken je nach Herkunft
        # "C:\\fakepath\\bon.jpg" oder einen relativen Pfad mit.
        filename=(file.filename or "Beleg").replace("\\", "/").rsplit("/", 1)[-1][:255],
        content_type=prepared.content_type,
        size_bytes=prepared.size_bytes,
        width=prepared.width,
        height=prepared.height,
        data=prepared.data,
        thumbnail=prepared.thumbnail,
    )
    db.add(attachment)
    db.flush()
    return _to_read(attachment)


@router.get("/api/attachments/{attachment_id}")
def download_attachment(attachment_id: int, household: CurrentHousehold, db: DbSession) -> Response:
    row = _get(db, household.id, attachment_id, with_data=True)
    return Response(
        content=row.data,
        media_type=row.content_type,
        headers={
            # inline, nicht attachment: der Beleg soll sich im Browser ansehen lassen.
            "Content-Disposition": f'inline; filename="{_ascii_name(row.filename)}"',
            "Cache-Control": _CACHE,
        },
    )


@router.get("/api/attachments/{attachment_id}/thumbnail")
def attachment_thumbnail(
    attachment_id: int, household: CurrentHousehold, db: DbSession
) -> Response:
    row = _get(db, household.id, attachment_id, with_data=True)
    if row.thumbnail is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Zu diesem Beleg gibt es keine Vorschau.")
    return Response(
        content=row.thumbnail, media_type="image/jpeg", headers={"Cache-Control": _CACHE}
    )


@router.delete("/api/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(attachment_id: int, household: CurrentHousehold, db: DbSession) -> None:
    db.delete(_get(db, household.id, attachment_id, with_data=False))


def _ascii_name(name: str) -> str:
    """Content-Disposition vertraegt keine Umlaute und keine Anfuehrungszeichen."""
    cleaned = name.replace('"', "").replace("\r", "").replace("\n", "")
    return cleaned.encode("ascii", "replace").decode("ascii") or "Beleg"
