import type { Rng } from '../core/Rng';
import type { AggregatedStats } from '../core/StatBlock';
import { pctMul } from '../core/StatBlock';
import { typeMultiplier, type ElementType } from '../data/types';

/**
 * Schadensberechnung. Bewusst eine reine Funktion ohne Phaser-Bezug:
 * Eingabe = Basiswert + Modifikatoren, Ausgabe = Zahl + Metadaten für die UI.
 */

export interface DamageInput {
  /** Grundschaden der Quelle (Monster-Angriff oder Trainer-Waffe). */
  base: number;
  attackerType: ElementType;
  defenderType: ElementType;
  mods: AggregatedStats;
  rng: Rng;
  /** Zusätzlicher Multiplikator, z. B. Etagen-Skalierung bei Gegnern. */
  scale?: number;
  /** Relikt-Boni ignorieren (Gegner nutzen sie nicht). */
  ignoreMods?: boolean;
}

export interface DamageResult {
  amount: number;
  crit: boolean;
  /** Typen-Multiplikator, für die "stark!"-Anzeige. */
  typeMult: number;
}

export function computeDamage(input: DamageInput): DamageResult {
  const { base, attackerType, defenderType, mods, rng } = input;
  const scale = input.scale ?? 1;

  if (input.ignoreMods) {
    const mult = typeMultiplier(attackerType, defenderType, 0);
    return { amount: Math.max(1, Math.round(base * scale * mult)), crit: false, typeMult: mult };
  }

  const mult = typeMultiplier(attackerType, defenderType, mods.harmony);
  let dmg = (base + mods.flatDamage) * pctMul(mods.damagePct) * scale * mult;

  const crit = mods.critChance > 0 && rng.chance(mods.critChance);
  if (crit) dmg *= 2;

  return { amount: Math.max(1, Math.round(dmg)), crit, typeMult: mult };
}

/**
 * Schadensanteil pro Einzelprojektil je Angriffsmuster.
 *
 * Ohne diese Normalisierung feuert ein `spread3`-Monster drei Projektile mit
 * jeweils vollem Angriffswert und macht damit die dreifache DPS eines
 * `single`-Monsters mit gleichem Angriffswert — die Werte in `monsters.json`
 * wären dann nicht mehr vergleichbar. Die Faktoren sind so gewählt, dass
 * risikoreiche Muster (Nahkampf) und zuverlässige Muster (zielsuchend) leicht
 * darüber bzw. darunter liegen.
 */
export const PATTERN_DAMAGE: Record<string, number> = {
  single: 1.0,
  spread3: 0.45, // breite Deckung, selten treffen alle drei
  burst3: 0.45, // Salve, trifft meist mehrfach
  homing: 1.1, // langsam, aber verlässlich
  melee: 1.6, // muss sich in Gefahr begeben
  lob: 0.85, // dazu kommt der Flächenschaden
};

export function patternDamage(pattern: string): number {
  return PATTERN_DAMAGE[pattern] ?? 1.0;
}

/** Winkelversatz für Mehrfach-Projektile (gleichmässiger Fächer um 0). */
export function spreadAngles(count: number, totalSpreadRad: number): number[] {
  if (count <= 1) return [0];
  const step = totalSpreadRad / (count - 1);
  const start = -totalSpreadRad / 2;
  return Array.from({ length: count }, (_, i) => start + step * i);
}
