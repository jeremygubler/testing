"""Rechnen mit ganzzahligen Minoreinheiten (Rappen/Cent).

Es gibt in dieser Anwendung keine Float-Betraege. Jede Verteilung eines Betrags auf
mehrere Personen laeuft ueber :func:`allocate`, damit die Summe der Teile immer exakt
dem Ausgangsbetrag entspricht.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

MINOR_DIGITS = 2
_MINOR_FACTOR = 10**MINOR_DIGITS


def allocate(total_minor: int, weights: list[int]) -> list[int]:
    """Verteilt ``total_minor`` gewichtet und ohne Rundungsverlust.

    Verfahren: groesster Rest (largest remainder). Bei gleichen Resten gewinnt die
    fruehere Position -- dadurch landet der Rundungsrest bei gleichmaessiger Verteilung
    automatisch bei der ersten Person, wie in der Spezifikation gefordert.

    ``sum(allocate(t, w)) == t`` gilt fuer jedes ``t`` und jede Gewichtung.
    """
    if not weights:
        raise ValueError("Mindestens ein Gewicht erforderlich")
    if any(w < 0 for w in weights):
        raise ValueError("Gewichte duerfen nicht negativ sein")
    total_weight = sum(weights)
    if total_weight <= 0:
        raise ValueError("Die Summe der Gewichte muss groesser als 0 sein")

    sign = -1 if total_minor < 0 else 1
    amount = abs(total_minor)

    base: list[int] = []
    remainders: list[tuple[int, int]] = []  # (rest, index)
    for index, weight in enumerate(weights):
        share = amount * weight
        base.append(share // total_weight)
        remainders.append((share % total_weight, index))

    missing = amount - sum(base)
    # Groesster Rest zuerst, bei Gleichstand die kleinere Position.
    remainders.sort(key=lambda item: (-item[0], item[1]))
    for rest, index in remainders[:missing]:
        del rest
        base[index] += 1

    return [sign * value for value in base]


def parse_amount(value: str | int | float | Decimal) -> int:
    """Wandelt eine Benutzereingabe in Minoreinheiten.

    Akzeptiert ``1234.50``, ``1'234.50``, ``1 234,50`` und ``-12.-``.
    Floats werden ueber ihre String-Darstellung geleitet, damit keine Binaerartefakte
    einfliessen.
    """
    if isinstance(value, int):
        return value * _MINOR_FACTOR
    if isinstance(value, Decimal):
        decimal_value = value
    else:
        text = str(value).strip()
        if not text:
            raise ValueError("Leerer Betrag")
        text = text.replace("'", "").replace("’", "").replace(" ", "").replace(" ", "")
        text = text.replace("CHF", "").replace("EUR", "").replace("€", "")
        if "," in text and "." in text:
            # Letztes Trennzeichen ist das Dezimaltrennzeichen.
            if text.rfind(",") > text.rfind("."):
                text = text.replace(".", "").replace(",", ".")
            else:
                text = text.replace(",", "")
        elif "," in text:
            text = text.replace(",", ".")
        if text.endswith(".-"):
            text = text[:-2]
        try:
            decimal_value = Decimal(text)
        except InvalidOperation as exc:
            raise ValueError(f"Kein gueltiger Betrag: {value!r}") from exc
    quantized = decimal_value.quantize(Decimal(1).scaleb(-MINOR_DIGITS), rounding=ROUND_HALF_UP)
    return int(quantized.scaleb(MINOR_DIGITS))


def to_decimal(amount_minor: int) -> Decimal:
    return (Decimal(amount_minor) / _MINOR_FACTOR).quantize(Decimal(1).scaleb(-MINOR_DIGITS))


def format_amount(amount_minor: int) -> str:
    """Reine Punkt-Darstellung fuer CSV-Export. Anzeige-Formatierung macht das Frontend."""
    return f"{to_decimal(amount_minor):.{MINOR_DIGITS}f}"
