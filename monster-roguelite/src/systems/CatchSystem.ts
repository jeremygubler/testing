import { CATCH } from '../config/GameConfig';
import type { Rng } from '../core/Rng';
import type { AggregatedStats } from '../core/StatBlock';
import type { MonsterSpecies } from '../data/monsters';

/**
 * Fang-Mechanik.
 *
 * Idee: Je stärker der Gegner geschwächt ist, desto höher die Chance. Über
 * `CATCH.hpThreshold` ist ein Fang grundsätzlich unmöglich — das zwingt zum
 * Kämpfen statt zum Ball-Spam beim Raumbetreten.
 */

export interface CatchAttempt {
  possible: boolean;
  chance: number;
  reason?: 'zu_gesund' | 'team_voll' | 'zu_weit';
}

export function evaluateCatch(
  species: MonsterSpecies,
  hpRatio: number,
  distance: number,
  teamSize: number,
  mods: AggregatedStats,
): CatchAttempt {
  if (teamSize >= CATCH.teamSize) return { possible: false, chance: 0, reason: 'team_voll' };
  if (distance > CATCH.range) return { possible: false, chance: 0, reason: 'zu_weit' };
  if (hpRatio > CATCH.hpThreshold) return { possible: false, chance: 0, reason: 'zu_gesund' };

  // Lineare Rampe: bei 0 % HP volle Basischance, bei hpThreshold ein Viertel davon.
  const t = Math.max(0, Math.min(1, hpRatio / CATCH.hpThreshold));
  const ramp = CATCH.baseChance * (1 - 0.75 * t);
  const chance = Math.max(0.05, Math.min(0.95, ramp * species.catchRate + mods.catchBonus));

  return { possible: true, chance };
}

export function rollCatch(rng: Rng, attempt: CatchAttempt): boolean {
  return attempt.possible && rng.chance(attempt.chance);
}

export const CATCH_FAIL_TEXT: Record<NonNullable<CatchAttempt['reason']>, string> = {
  zu_gesund: 'Noch zu stark — erst schwächen!',
  team_voll: 'Team ist voll (4/4).',
  zu_weit: 'Kein Ziel in Reichweite.',
};
