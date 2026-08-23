/**
 * Elementartypen und Typen-Effektivität.
 *
 * Die Matrix ist bewusst ein einfacher Kreis plus zwei Querbeziehungen —
 * lesbar, ohne Pokémon-Tabelle nachzubauen.
 */

export type ElementType = 'feuer' | 'wasser' | 'pflanze' | 'elektro' | 'normal' | 'gestein';

export const ELEMENT_TYPES: ElementType[] = [
  'feuer',
  'wasser',
  'pflanze',
  'elektro',
  'normal',
  'gestein',
];

/** Anzeigefarbe je Typ (Platzhalter-Grafik). */
export const TYPE_COLORS: Record<ElementType, number> = {
  feuer: 0xf97316,
  wasser: 0x3b82f6,
  pflanze: 0x22c55e,
  elektro: 0xfacc15,
  normal: 0xa8a29e,
  gestein: 0x92764a,
};

export const TYPE_LABELS: Record<ElementType, string> = {
  feuer: 'Feuer',
  wasser: 'Wasser',
  pflanze: 'Pflanze',
  elektro: 'Elektro',
  normal: 'Normal',
  gestein: 'Gestein',
};

const SUPER = 2.0;
const WEAK = 0.5;

/**
 * EFFECTIVENESS[angreifer][verteidiger] = Schadensmultiplikator.
 * Fehlende Einträge sind neutral (1.0).
 */
const EFFECTIVENESS: Partial<Record<ElementType, Partial<Record<ElementType, number>>>> = {
  feuer: { pflanze: SUPER, wasser: WEAK, gestein: WEAK },
  wasser: { feuer: SUPER, gestein: SUPER, pflanze: WEAK, elektro: WEAK },
  pflanze: { wasser: SUPER, gestein: SUPER, feuer: WEAK, elektro: WEAK },
  elektro: { wasser: SUPER, pflanze: WEAK, gestein: WEAK },
  gestein: { feuer: SUPER, elektro: SUPER, wasser: WEAK, pflanze: WEAK },
  normal: {},
};

/**
 * Multiplikator für einen Angriff.
 *
 * `harmony` (Relikt "Elementarharmonie") hebt schwache Multiplikatoren an und
 * verstärkt starke — pro Stapel um 25 % Richtung/über den Neutralwert hinaus.
 */
export function typeMultiplier(
  attacker: ElementType,
  defender: ElementType,
  harmonyStacks = 0,
): number {
  const base = EFFECTIVENESS[attacker]?.[defender] ?? 1.0;
  if (harmonyStacks <= 0) return base;
  const k = Math.min(1, harmonyStacks * 0.25);
  if (base > 1) return base + k * 0.5; // stark wird stärker
  if (base < 1) return base + (1 - base) * k; // schwach wandert Richtung neutral
  return base;
}

/** Kurztext für die UI, z. B. "sehr effektiv". */
export function effectivenessLabel(mult: number): string | null {
  if (mult >= 1.6) return 'stark!';
  if (mult <= 0.75) return 'schwach';
  return null;
}
