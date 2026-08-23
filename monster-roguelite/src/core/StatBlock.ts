import { getRelic, type RelicEffect } from '../data/relics';

/**
 * Aggregiert alle Relikt-Effekte eines Runs zu einem einzigen Wertepaket.
 *
 * Kernregel: Ein Relikt ×N wirkt exakt N-fach. Deshalb wird hier nur
 * aufsummiert — keine Sonderfälle, kein "erstes Exemplar wirkt anders".
 * Genau dieses Verhalten macht das Stapeln sichtbar und vorhersagbar.
 */
export interface AggregatedStats extends Required<RelicEffect> {}

const EMPTY: AggregatedStats = {
  attackSpeedPct: 0,
  flatDamage: 0,
  damagePct: 0,
  maxHp: 0,
  hpRegen: 0,
  bounces: 0,
  extraProjectiles: 0,
  moveSpeedPct: 0,
  catchBonus: 0,
  lifesteal: 0,
  critChance: 0,
  pickupRadius: 0,
  currencyPct: 0,
  thorns: 0,
  pierce: 0,
  harmony: 0,
  projectileSpeedPct: 0,
};

/**
 * Summiert Relikt-Stapel. `stacks` bildet Relikt-Id → Anzahl ab.
 * `permanent` sind dauerhafte Meta-Boni, die wie ein unsichtbares Relikt wirken.
 */
export function aggregate(
  stacks: ReadonlyMap<string, number>,
  permanent: Partial<AggregatedStats> = {},
): AggregatedStats {
  const out: AggregatedStats = { ...EMPTY, ...permanent };
  for (const [id, count] of stacks) {
    if (count <= 0) continue;
    const effect = getRelic(id).effect;
    for (const key of Object.keys(effect) as (keyof RelicEffect)[]) {
      const value = effect[key];
      if (typeof value === 'number') out[key] += value * count;
    }
  }
  // Krit- und Fangchance dürfen nicht über 100 % hinauslaufen.
  out.critChance = Math.min(out.critChance, 1);
  return out;
}

/** Multiplikator aus einem Prozent-Wert, nach unten gedeckelt. */
export function pctMul(pct: number, floor = 0.2): number {
  return Math.max(floor, 1 + pct);
}
