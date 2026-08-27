/**
 * Chart-Grundlagen.
 *
 * Farbe hat hier eine Aufgabe, nicht eine Stimmung: die kategoriale Palette
 * identifiziert einzelne Kategorien, `--chart-reference` ist der zurückgenommene
 * Budget-Referenzbalken, Personenfarben kommen aus den Stammdaten.
 * Die Reihenfolge ist fix und wird nie zyklisch fortgesetzt — ab dem siebten
 * Eintrag fasst „Übrige" zusammen.
 */

export const CHART_SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

export const CHART_OTHER = "var(--chart-other)";
export const CHART_REFERENCE = "var(--chart-reference)";

export const MAX_SLICES = CHART_SERIES.length;

export interface Sliceable {
  id: number | string;
  name: string;
  value: number;
}

export interface Slice extends Sliceable {
  color: string;
  isOther: boolean;
}

/**
 * Fasst eine Liste auf höchstens `MAX_SLICES` Scheiben plus „Übrige" zusammen,
 * absteigend nach Betrag. Nullwerte fallen raus — eine Scheibe der Grösse 0 ist
 * keine Information, nur ein Legendeneintrag.
 */
export function toSlices(items: Sliceable[], otherLabel = "Übrige"): Slice[] {
  const sorted = items.filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= MAX_SLICES) {
    return sorted.map((item, index) => ({ ...item, color: CHART_SERIES[index], isOther: false }));
  }
  const head = sorted.slice(0, MAX_SLICES - 1).map((item, index) => ({
    ...item,
    color: CHART_SERIES[index],
    isOther: false,
  }));
  const rest = sorted.slice(MAX_SLICES - 1);
  return [
    ...head,
    {
      id: "__other__",
      name: otherLabel,
      value: rest.reduce((sum, item) => sum + item.value, 0),
      color: CHART_OTHER,
      isOther: true,
    },
  ];
}

/** Achsenbeschriftung: aus Rappen wird ein kurzer Franken-Wert. */
export function axisTick(amountMinor: number): string {
  const value = amountMinor / 100;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000)}k`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}
