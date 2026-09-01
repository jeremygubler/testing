/**
 * Adaptive recording density.
 *
 * The battery cost of tracking is dominated by how often the GPS chip has to get
 * a fix. Standing still at a 10-second interval burns the same power as driving
 * at one, and produces a cloud of near-identical points that says nothing. So the
 * profile follows the movement.
 */

export type TrackingProfileName = 'stationary' | 'walking' | 'cycling' | 'vehicle';

export interface TrackingProfile {
  name: TrackingProfileName;
  /** Minimum time between fixes. */
  timeIntervalMs: number;
  /** Minimum movement before a new point is recorded. */
  distanceIntervalM: number;
  /** Whether this profile justifies the high-accuracy (more expensive) mode. */
  highAccuracy: boolean;
  label: string;
}

export const PROFILES: Record<TrackingProfileName, TrackingProfile> = {
  stationary: {
    name: 'stationary',
    timeIntervalMs: 120_000,
    distanceIntervalM: 40,
    highAccuracy: false,
    label: 'Pause',
  },
  walking: {
    name: 'walking',
    timeIntervalMs: 20_000,
    distanceIntervalM: 12,
    highAccuracy: true,
    label: 'zu Fuss',
  },
  cycling: {
    name: 'cycling',
    timeIntervalMs: 15_000,
    distanceIntervalM: 30,
    highAccuracy: true,
    label: 'Rad',
  },
  vehicle: {
    name: 'vehicle',
    timeIntervalMs: 10_000,
    distanceIntervalM: 100,
    highAccuracy: false,
    label: 'Fahrzeug',
  },
};

export const PROFILE_ORDER: TrackingProfileName[] = [
  'stationary',
  'walking',
  'cycling',
  'vehicle',
];

/**
 * Asymmetric thresholds in m/s. Moving up needs a clearly higher speed than
 * moving back down needs a lower one — without that gap, a walker waiting at a
 * traffic light would flip profiles every few seconds, and every flip restarts
 * the location updates.
 */
const STEP_UP = [0.7, 2.8, 8.5];
const STEP_DOWN = [0.4, 2.0, 6.5];

export function nextProfile(
  current: TrackingProfileName,
  speedMps: number | null | undefined,
): TrackingProfileName {
  // expo-location reports -1 (or nothing) when it has no speed estimate.
  if (speedMps === null || speedMps === undefined || speedMps < 0 || !Number.isFinite(speedMps)) {
    return current;
  }

  let index = PROFILE_ORDER.indexOf(current);
  if (index < 0) index = 0;

  while (index < STEP_UP.length && speedMps > (STEP_UP[index] ?? Infinity)) index += 1;
  while (index > 0 && speedMps < (STEP_DOWN[index - 1] ?? -Infinity)) index -= 1;

  return PROFILE_ORDER[index] ?? 'walking';
}
