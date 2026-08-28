"""Belege zu Buchungen.

Der Kern: die Bytes liegen in der Datenbank, Bilder werden beim Hochladen
verkleinert, und ein Beleg gehoert zu genau einer Buchung -- verschwindet die
Buchung, verschwindet er mit.
"""

from __future__ import annotations

import io

import pytest
from PIL import Image

from app.services import attachments as service


def _png(width: int = 40, height: int = 30, color: str = "red") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buffer, format="PNG")
    return buffer.getvalue()


def _jpeg(width: int, height: int) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(buffer, format="JPEG")
    return buffer.getvalue()


@pytest.fixture
def txn(client, categories, members) -> int:
    anna, _ = members
    response = client.post(
        "/api/transactions",
        json={
            "date": "2026-03-10",
            "category_id": categories["Lebensmittel"].id,
            "description": "Quartierladen",
            "amount_minor": 4_250,
            "split": {"template": "SINGLE", "member_id": anna.id},
        },
    )
    return response.json()["id"]


def _upload(client, txn_id, data, name="bon.png", content_type="image/png"):
    return client.post(
        f"/api/transactions/{txn_id}/attachments",
        files={"file": (name, data, content_type)},
    )


# ------------------------------------------------------------------ Hochladen


def test_an_image_is_stored_and_listed(client, txn):
    response = _upload(client, txn, _png())
    assert response.status_code == 201
    body = response.json()
    assert body["txn_id"] == txn
    assert body["filename"] == "bon.png"
    assert body["has_thumbnail"] is True
    assert body["size_bytes"] > 0

    listed = client.get(f"/api/transactions/{txn}/attachments").json()
    assert [row["id"] for row in listed] == [body["id"]]


def test_the_transaction_reports_how_many_belege_it_has(client, txn):
    assert client.get(f"/api/transactions/{txn}").json()["attachment_count"] == 0
    _upload(client, txn, _png())
    _upload(client, txn, _png(color="blue"), name="zweiter.png")
    assert client.get(f"/api/transactions/{txn}").json()["attachment_count"] == 2


def test_a_large_photo_is_scaled_down(client, txn):
    """Ein Kassenzettel muss lesbar sein, nicht ausstellungsreif."""
    original = _jpeg(4000, 3000)
    body = _upload(client, txn, original, name="foto.jpg", content_type="image/jpeg").json()

    assert max(body["width"], body["height"]) == service.MAX_EDGE
    # Seitenverhaeltnis bleibt erhalten.
    assert body["width"] / body["height"] == pytest.approx(4000 / 3000, abs=0.01)
    assert body["size_bytes"] < len(original)


def test_a_small_image_is_not_blown_up(client, txn):
    body = _upload(client, txn, _png(40, 30)).json()
    assert (body["width"], body["height"]) == (40, 30)


def test_a_png_becomes_a_jpeg_because_that_is_what_gets_stored(client, txn):
    body = _upload(client, txn, _png()).json()
    assert body["content_type"] == "image/jpeg"


def test_a_pdf_is_kept_as_it_is(client, txn):
    pdf = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
    body = _upload(client, txn, pdf, name="rechnung.pdf", content_type="application/pdf").json()
    assert body["content_type"] == "application/pdf"
    assert body["size_bytes"] == len(pdf)
    # Ein PDF zu rastern hiesse, Text zu Pixeln zu machen -- also keine Vorschau.
    assert body["has_thumbnail"] is False
    assert client.get(f"/api/attachments/{body['id']}").content == pdf


def test_a_path_from_the_browser_is_reduced_to_the_file_name(client, txn):
    body = _upload(client, txn, _png(), name="C:\\fakepath\\bon.png").json()
    assert body["filename"] == "bon.png"


# ------------------------------------------------------------------ Abwehr


def test_a_word_document_is_refused(client, txn):
    response = _upload(
        client, txn, b"PK\x03\x04irgendwas", name="brief.docx", content_type="application/msword"
    )
    assert response.status_code == 422
    assert "Bilder" in response.json()["detail"]


def test_something_that_only_claims_to_be_an_image_is_refused(client, txn):
    response = _upload(client, txn, b"kein bild, nur text", name="bon.png")
    assert response.status_code == 422


def test_something_that_only_claims_to_be_a_pdf_is_refused(client, txn):
    response = _upload(client, txn, b"auch kein pdf", name="x.pdf", content_type="application/pdf")
    assert response.status_code == 422


def test_an_empty_file_is_refused(client, txn):
    assert _upload(client, txn, b"").status_code == 422


def test_a_file_beyond_the_limit_is_refused():
    with pytest.raises(service.AttachmentError, match="groesser"):
        service.prepare(b"x" * (service.MAX_UPLOAD_BYTES + 1), "image/jpeg")


def test_an_unknown_transaction_gets_no_beleg(client):
    assert _upload(client, 9999, _png()).status_code == 404


# ------------------------------------------------------------------ Abrufen


def test_the_original_and_the_thumbnail_come_back_separately(client, txn):
    body = _upload(client, txn, _jpeg(2000, 1000), name="b.jpg", content_type="image/jpeg").json()

    full = client.get(f"/api/attachments/{body['id']}")
    assert full.status_code == 200
    assert full.headers["content-type"] == "image/jpeg"

    thumb = client.get(f"/api/attachments/{body['id']}/thumbnail")
    assert thumb.status_code == 200
    # Die Vorschau ist fuer eine Liste da -- sie muss deutlich kleiner sein.
    assert len(thumb.content) < len(full.content)
    with Image.open(io.BytesIO(thumb.content)) as image:
        assert max(image.size) <= service.THUMBNAIL_EDGE


def test_a_pdf_has_no_thumbnail_to_fetch(client, txn):
    pdf = b"%PDF-1.4\ntrailer\n%%EOF\n"
    body = _upload(client, txn, pdf, name="r.pdf", content_type="application/pdf").json()
    assert client.get(f"/api/attachments/{body['id']}/thumbnail").status_code == 404


def test_an_unknown_beleg_is_a_404(client):
    assert client.get("/api/attachments/9999").status_code == 404


# ------------------------------------------------------------------ Loeschen


def test_a_beleg_can_be_deleted(client, txn):
    body = _upload(client, txn, _png()).json()
    assert client.delete(f"/api/attachments/{body['id']}").status_code == 204
    assert client.get(f"/api/attachments/{body['id']}").status_code == 404
    assert client.get(f"/api/transactions/{txn}").json()["attachment_count"] == 0


def test_deleting_the_transaction_takes_its_belege_along(client, txn):
    """Ein Beleg ohne seine Buchung ist ein Bild ohne Bezug."""
    body = _upload(client, txn, _png()).json()
    assert client.delete(f"/api/transactions/{txn}").status_code == 204
    assert client.get(f"/api/attachments/{body['id']}").status_code == 404


def test_resetting_the_transactions_removes_the_belege(client, txn):
    _upload(client, txn, _png())
    removed = client.post("/api/io/reset", json={"scope": "TRANSACTIONS", "confirm": "LOESCHEN"})
    assert removed.status_code == 200
    assert removed.json()["removed"]["attachment"] == 1


# ------------------------------------------------------------------ Sicherung


def test_the_json_backup_says_how_many_belege_it_leaves_behind(client, txn):
    """Base64 im Backup waere um Groessenordnungen groesser -- aber schweigen darf
    es darueber nicht, sonst verliert sie jemand beim Zurueckspielen unbemerkt."""
    _upload(client, txn, _png())
    backup = client.get("/api/io/export/household.json").json()
    assert backup["attachments_excluded"] == 1
    assert "attachments" not in backup


def test_listing_transactions_does_not_carry_the_bytes(client, txn):
    """Die Belegdaten sind deferred -- eine Buchungsliste darf sie nie mitziehen."""
    _upload(client, txn, _jpeg(2000, 2000), name="gross.jpg", content_type="image/jpeg")
    page = client.get("/api/transactions").json()
    row = next(item for item in page["items"] if item["id"] == txn)
    assert row["attachment_count"] == 1
    assert "attachments" not in row
