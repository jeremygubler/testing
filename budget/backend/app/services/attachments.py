"""Belege annehmen, pruefen und verkleinern.

Ein Kassenzettel muss lesbar sein, nicht ausstellungsreif. Ein Handyfoto mit 4000
Pixel Kantenlaenge und 4 MB traegt kein Byte mehr Information als dieselbe Aufnahme
mit 1600 Pixeln -- kostet aber das Zwanzigfache an Platz in einer Datenbank, die
jemand als einzelne Datei sichern koennen soll. Deshalb wird beim Hochladen
verkleinert, einmal, und danach nie wieder angefasst.

PDFs werden unveraendert uebernommen: eine E-Rechnung ist schon klein, und sie
umzurechnen hiesse, Text zu Pixeln zu machen.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError

#: Was der Server ueberhaupt annimmt. Bewusst kurz: was nicht hier steht, kann die
#: Oberflaeche auch nicht anzeigen.
ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
}

#: Groesse der hochgeladenen Datei, bevor irgendetwas passiert.
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
#: Laengste Kante nach dem Verkleinern.
MAX_EDGE = 1600
#: Kantenlaenge der Vorschau in der Liste.
THUMBNAIL_EDGE = 320
JPEG_QUALITY = 82


class AttachmentError(ValueError):
    """Fachlicher Fehler beim Hochladen -- wird zu 422 mit lesbarer Meldung."""


@dataclass(slots=True)
class PreparedAttachment:
    data: bytes
    thumbnail: bytes | None
    content_type: str
    size_bytes: int
    width: int | None
    height: int | None


def _to_jpeg(image: Image.Image, quality: int = JPEG_QUALITY) -> bytes:
    buffer = io.BytesIO()
    # JPEG kennt keine Transparenz; ohne den weissen Grund wuerde ein PNG mit
    # Alphakanal schwarze Flaechen bekommen.
    if image.mode in ("RGBA", "LA", "P"):
        rgba = image.convert("RGBA")
        flat = Image.new("RGB", rgba.size, (255, 255, 255))
        flat.paste(rgba, mask=rgba.split()[-1])
        image = flat
    elif image.mode != "RGB":
        image = image.convert("RGB")
    image.save(buffer, format="JPEG", quality=quality, optimize=True)
    return buffer.getvalue()


def prepare(raw: bytes, content_type: str | None) -> PreparedAttachment:
    """Prueft und verkleinert einen hochgeladenen Beleg."""
    if not raw:
        raise AttachmentError("Die Datei ist leer.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise AttachmentError(f"Die Datei ist groesser als {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")

    declared = (content_type or "").split(";")[0].strip().lower()
    if declared not in ALLOWED_CONTENT_TYPES:
        raise AttachmentError(
            "Nur Bilder (JPEG, PNG, WebP, GIF) und PDF koennen als Beleg abgelegt werden."
        )

    if declared == "application/pdf":
        # Der angegebene Typ allein ist kein Beweis -- die Signatur schon eher.
        if not raw.startswith(b"%PDF-"):
            raise AttachmentError("Die Datei ist als PDF angekuendigt, sieht aber nicht so aus.")
        return PreparedAttachment(
            data=raw,
            thumbnail=None,
            content_type="application/pdf",
            size_bytes=len(raw),
            width=None,
            height=None,
        )

    try:
        with Image.open(io.BytesIO(raw)) as opened:
            opened.load()
            # Handyfotos tragen die Ausrichtung im EXIF statt in den Pixeln. Ohne das
            # liegt der Kassenzettel quer.
            image = _apply_exif_rotation(opened)

            preview = image.copy()
            preview.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
            data = _to_jpeg(preview)
            width, height = preview.size

            small = image.copy()
            small.thumbnail((THUMBNAIL_EDGE, THUMBNAIL_EDGE), Image.Resampling.LANCZOS)
            thumbnail = _to_jpeg(small, quality=75)
    except (UnidentifiedImageError, OSError) as exc:
        raise AttachmentError("Die Datei liess sich nicht als Bild lesen.") from exc

    return PreparedAttachment(
        data=data,
        thumbnail=thumbnail,
        content_type="image/jpeg",
        size_bytes=len(data),
        width=width,
        height=height,
    )


def _apply_exif_rotation(image: Image.Image) -> Image.Image:
    from PIL import ImageOps

    return ImageOps.exif_transpose(image) or image
