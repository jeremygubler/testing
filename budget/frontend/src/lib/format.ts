import { t } from "@/i18n";
import { MINOR_DIGITS } from "./money";

export interface MoneyFormatOptions {
  locale?: string;
  currency?: string;
  /** Währungssymbol weglassen — in dichten Tabellen ist es reines Rauschen. */
  bare?: boolean;
  /** Ohne Nachkommastellen, für Achsen und Grobwerte. */
  compact?: boolean;
  /** Vorzeichen immer zeigen, auch bei positiven Werten. */
  explicitSign?: boolean;
}

const cache = new Map<string, Intl.NumberFormat>();

function formatter(key: string, options: Intl.NumberFormatOptions, locale: string) {
  const cacheKey = `${locale}|${key}`;
  let instance = cache.get(cacheKey);
  if (!instance) {
    instance = new Intl.NumberFormat(locale, options);
    cache.set(cacheKey, instance);
  }
  return instance;
}

/** Minoreinheiten als lesbaren Betrag. Das Frontend formatiert, die API liefert Integer. */
export function formatMoney(amountMinor: number, options: MoneyFormatOptions = {}): string {
  const { locale = "de-CH", currency = "CHF", bare = false, compact = false, explicitSign = false } = options;
  const value = amountMinor / 10 ** MINOR_DIGITS;
  const digits = compact ? 0 : MINOR_DIGITS;
  const intlOptions: Intl.NumberFormatOptions = bare
    ? { minimumFractionDigits: digits, maximumFractionDigits: digits }
    : { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits };
  // Intl setzt das Minus bei de-CH zwischen Symbol und Zahl ("CHF-88.29"). In einer
  // rechtsbuendigen Betragsspalte liest sich das schlecht -- deshalb selbst voranstellen.
  const text = formatter(`${bare}|${compact}|${currency}`, intlOptions, locale).format(Math.abs(value));
  if (amountMinor < 0) return `-${text}`;
  return explicitSign && amountMinor > 0 ? `+${text}` : text;
}

/** Prozent mit einer Nachkommastelle; `null` (kein Nenner) wird zu „–". */
export function formatPercent(value: number | null, locale = "de-CH", digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "–";
  return formatter(`percent${digits}`, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }, locale).format(value) + " %";
}

/** ISO-Datum (`2026-03-15`) als `15.03.2026`. */
export function formatDate(iso: string, locale = "de-CH"): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(Number(year), Number(month) - 1, Number(day)));
}

/** Kurzform ohne Jahr, für Listen innerhalb eines Monats. */
export function formatDateShort(iso: string, locale = "de-CH"): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" })
    .format(new Date(Number(year), Number(month) - 1, Number(day)));
}

export function monthLabel(year: number, month: number): string {
  return `${t.month.names[month - 1]} ${year}`;
}
