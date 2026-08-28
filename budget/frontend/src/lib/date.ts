/** Datums-Helfer. Alle Daten laufen als ISO-String `YYYY-MM-DD` durch die App. */

export interface MonthKey {
  year: number;
  month: number; // 1-12
}

export function todayIso(): string {
  const now = new Date();
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function currentMonth(): MonthKey {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addMonths({ year, month }: MonthKey, delta: number): MonthKey {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

export function daysInMonth({ year, month }: MonthKey): number {
  return new Date(year, month, 0).getDate();
}

export function monthRange(key: MonthKey): { from: string; to: string } {
  return {
    from: toIso(key.year, key.month, 1),
    to: toIso(key.year, key.month, daysInMonth(key)),
  };
}

/** `2026-03` — die Darstellung des Monats in der URL. */
export function toMonthParam({ year, month }: MonthKey): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthParam(value: string | null): MonthKey | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 1900 || year > 2200) return null;
  return { year, month };
}

export function monthOf(iso: string): MonthKey {
  const [year, month] = iso.split("-");
  return { year: Number(year), month: Number(month) };
}

export function isSameMonth(a: MonthKey, b: MonthKey): boolean {
  return a.year === b.year && a.month === b.month;
}

/** Wochentag als 0 = Montag … 6 = Sonntag (die Kalenderansicht beginnt am Montag). */
export function weekdayIndex(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return (new Date(year, month - 1, day).getDay() + 6) % 7;
}
