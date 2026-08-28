/**
 * Rechnen mit ganzzahligen Minoreinheiten (Rappen/Cent).
 *
 * Diese Datei ist die Frontend-Entsprechung von `backend/app/services/money.py`.
 * Beide muessen bei identischer Eingabe identisch rechnen -- die Aufteilungs-Vorschau
 * im Erfassungsformular soll sofort das zeigen, was der Server anschliessend speichert.
 * Deshalb ist `allocate` hier bewusst dupliziert statt per Request geholt.
 */

export const MINOR_DIGITS = 2;
const MINOR_FACTOR = 10 ** MINOR_DIGITS;

/**
 * Verteilt `totalMinor` gewichtet und ohne Rundungsverlust (Verfahren des groessten
 * Rests). Bei gleichen Resten gewinnt die fruehere Position, damit der Rundungsrest
 * bei gleichmaessiger Verteilung an die erste Person geht.
 *
 * Es gilt immer: `allocate(t, w).reduce((a, b) => a + b, 0) === t`.
 */
export function allocate(totalMinor: number, weights: number[]): number[] {
  if (weights.length === 0) throw new Error("Mindestens ein Gewicht erforderlich");
  if (weights.some((w) => w < 0)) throw new Error("Gewichte duerfen nicht negativ sein");
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) throw new Error("Die Summe der Gewichte muss groesser als 0 sein");

  const sign = totalMinor < 0 ? -1 : 1;
  const amount = Math.abs(totalMinor);

  const base = weights.map((w) => Math.floor((amount * w) / totalWeight));
  const remainders = weights.map((w, index) => ({
    rest: (amount * w) % totalWeight,
    index,
  }));

  let missing = amount - base.reduce((a, b) => a + b, 0);
  remainders.sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of remainders) {
    if (missing <= 0) break;
    base[index] += 1;
    missing -= 1;
  }

  return base.map((value) => sign * value);
}

/**
 * Liest eine Benutzereingabe als Minoreinheiten.
 * Akzeptiert `1234.50`, `1'234.50`, `1 234,50`, `12.-` und einfache Rechnungen
 * wie `12.50+3` (praktisch beim Erfassen einer Quittung).
 * Gibt `null` zurueck, wenn die Eingabe kein Betrag ist.
 */
export function parseAmountInput(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;

  const cleaned = raw
    // Geschütztes und schmales geschütztes Leerzeichen kommen als Tausendertrenner vor.
    .replace(/['’\s\u00A0\u202F]/g, "")
    .replace(/(CHF|EUR|€|\$)/gi, "")
    .replace(/\.-$/, "");

  if (/^[-+]?[\d.,]+([+\-*][\d.,]+)+$/.test(cleaned)) {
    // Kleine Kettenrechnung: Summanden einzeln lesen und in Minoreinheiten addieren.
    const parts = cleaned.match(/[+\-*]?[\d.,]+/g);
    if (!parts) return null;
    let total = 0;
    for (const part of parts) {
      const operator = /^[+\-*]/.test(part) ? part[0] : "+";
      const value = toMinor(part.replace(/^[+\-*]/, ""));
      if (value === null) return null;
      if (operator === "+") total += value;
      else if (operator === "-") total -= value;
      else total = Math.round((total * value) / MINOR_FACTOR);
    }
    return total;
  }

  return toMinor(cleaned);
}

function toMinor(text: string): number | null {
  let normalized = text;
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");
  if (hasComma && hasDot) {
    normalized =
      normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (hasComma) {
    normalized = normalized.replace(",", ".");
  }
  if (!/^[-+]?\d*(\.\d*)?$/.test(normalized) || !/\d/.test(normalized)) return null;

  const negative = normalized.startsWith("-");
  const [whole, fraction = ""] = normalized.replace(/^[-+]/, "").split(".");
  const padded = (fraction + "00").slice(0, MINOR_DIGITS + 1);
  const rounded = Math.round(Number(`${whole || "0"}.${padded}`) * MINOR_FACTOR);
  return negative ? -rounded : rounded;
}

/** Minoreinheiten als einfacher Dezimalstring, z. B. fuer Eingabefelder. */
export function toDecimalString(amountMinor: number): string {
  const sign = amountMinor < 0 ? "-" : "";
  const abs = Math.abs(amountMinor);
  return `${sign}${Math.floor(abs / MINOR_FACTOR)}.${String(abs % MINOR_FACTOR).padStart(MINOR_DIGITS, "0")}`;
}

/** Anteil als Prozentwert, oder `null` wenn der Nenner 0 ist. */
export function share(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return (part / whole) * 100;
}
