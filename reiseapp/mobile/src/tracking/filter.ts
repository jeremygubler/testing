import { haversineMetres } from './geo';

/** A fix this uncertain says nothing about where you are. */
export const MAX_ACCURACY_M = 150;

/** Below this, a "step" is noise even from a perfect receiver. */
export const MIN_MOVE_M = 10;

export interface Fix {
  lat: number;
  lon: number;
  accuracyM: number | null;
}

/**
 * Whether a fix records movement or only measurement noise.
 *
 * A receiver reporting 11 m accuracy places you somewhere inside an 11 m circle;
 * two consecutive fixes from a phone lying on a table differ by a few metres
 * purely at random. Summing those differences is how a stationary evening turns
 * into kilometres — 16 fixes spanning 10.6 m of ground measured 58.8 m of
 * "walking" before this existed.
 *
 * So a step counts only once it leaves the uncertainty of the two fixes that
 * define it. That threshold is the reported accuracy itself, never below
 * MIN_MOVE_M: trusting a 2 m claim from a phone in a pocket invents motion just
 * as reliably.
 */
export function isRealMovement(previous: Fix | null, candidate: Fix): boolean {
  if (candidate.accuracyM !== null && candidate.accuracyM > MAX_ACCURACY_M) return false;
  if (previous === null) return true;

  const uncertainty = Math.max(
    MIN_MOVE_M,
    previous.accuracyM ?? MIN_MOVE_M,
    candidate.accuracyM ?? MIN_MOVE_M,
  );
  return haversineMetres(previous, candidate) >= uncertainty;
}

/**
 * Runs the rule across a batch, carrying the last *kept* fix forward — not the
 * last seen one. Comparing against a rejected fix would let a slow drift through
 * one small step at a time.
 */
export function keepMoving<T extends Fix>(previous: Fix | null, batch: T[]): T[] {
  const kept: T[] = [];
  let last = previous;
  for (const fix of batch) {
    if (!isRealMovement(last, fix)) continue;
    kept.push(fix);
    last = fix;
  }
  return kept;
}
