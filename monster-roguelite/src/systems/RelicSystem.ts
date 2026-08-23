import type { Rng } from '../core/Rng';
import { RARITY_WEIGHTS, getRelic, type Relic } from '../data/relics';

/**
 * Zieht Relikte aus dem Run-Pool.
 *
 * Der Pool kommt aus dem Meta-Save (freigeschaltete Relikte). Duplikate sind
 * ausdrücklich erlaubt und erwünscht — Stapeln ist die Kernmechanik.
 */
export function rollRelic(rng: Rng, poolIds: readonly string[]): Relic {
  if (poolIds.length === 0) throw new Error('Relikt-Pool ist leer');
  const relics = poolIds.map(getRelic);
  return rng.pickWeighted(relics, (r) => RARITY_WEIGHTS[r.rarity]);
}

/** Mehrere unterschiedliche Relikte zur Auswahl anbieten (Belohnungsraum). */
export function rollRelicChoices(
  rng: Rng,
  poolIds: readonly string[],
  count: number,
): Relic[] {
  const chosen: Relic[] = [];
  const remaining = [...poolIds];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const relic = rollRelic(rng, remaining);
    chosen.push(relic);
    remaining.splice(remaining.indexOf(relic.id), 1);
  }
  return chosen;
}
