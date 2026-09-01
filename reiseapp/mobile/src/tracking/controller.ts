import * as Location from 'expo-location';

import { clearTrip, stats } from './queue';
import { PROFILES, type TrackingProfileName } from './profile';
import {
  getActiveTripId,
  getProfileName,
  setActiveTripId,
  setLastFix,
  setProfileName,
} from './state';
import { LOCATION_TASK, setProfileRestartHandler, syncNow } from './task';
import type { PermissionOutcome } from './permission';
import type { QueueStats } from './types';

export type { PermissionOutcome };

export interface TrackingStatus {
  tripId: string | null;
  running: boolean;
  profile: TrackingProfileName;
  queue: QueueStats;
}

function optionsFor(profile: TrackingProfileName): Location.LocationTaskOptions {
  const preset = PROFILES[profile];
  return {
    accuracy: preset.highAccuracy ? Location.Accuracy.High : Location.Accuracy.Balanced,
    timeInterval: preset.timeIntervalMs,
    distanceInterval: preset.distanceIntervalM,
    // Never let iOS pause updates on its own: it decides the user stopped moving
    // and silently never resumes, which loses the rest of the trip.
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Other,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Reise wird aufgezeichnet',
      notificationBody: 'Fernspur zeichnet deine Route auf. Tippen zum Öffnen.',
      notificationColor: '#2f6f4f',
      killServiceOnDestroy: false,
    },
  };
}

/**
 * The in-app dialog. Cheap, synchronous from the user's point of view, and the
 * app stays in the foreground — which is what lets us start recording right
 * after it.
 */
export async function requestForegroundPermission(): Promise<PermissionOutcome> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) return 'denied';
  const background = await Location.getBackgroundPermissionsAsync();
  return background.granted ? 'granted' : 'foreground-only';
}

/**
 * The "always" upgrade. On Android 11+ this does not show a dialog at all — it
 * hands the user to the system settings page, so the app goes to the background
 * and this promise resolves before anything has been decided. The answer only
 * arrives on the way back, via permissionState(). Never chain a start onto it.
 */
export async function requestBackgroundPermission(): Promise<void> {
  await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
}

export async function permissionState(): Promise<PermissionOutcome> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) return 'denied';
  const background = await Location.getBackgroundPermissionsAsync();
  return background.granted ? 'granted' : 'foreground-only';
}

async function restart(profile: TrackingProfileName): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  await Location.startLocationUpdatesAsync(LOCATION_TASK, optionsFor(profile));
}

setProfileRestartHandler(restart);

export async function startTracking(tripId: string): Promise<PermissionOutcome> {
  const outcome = await permissionState();
  if (outcome === 'denied') return outcome;

  await setActiveTripId(tripId);
  // Forget where the last recording ended: otherwise starting again from the
  // same spot rejects the opening fix as noise, and the trip begins nowhere.
  await setLastFix(null);
  // Start conservatively: the first fixes tell us how fast we are actually moving.
  const profile: TrackingProfileName = 'walking';
  await setProfileName(profile);
  await restart(profile);
  return outcome;
}

export async function stopTracking(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  await setActiveTripId(null);
  // Flush what is left before the user walks away from the screen.
  await syncNow().catch(() => undefined);
}

/**
 * Picks the recording back up after the OS interrupted it — Android restarts the
 * process when a permission changes, and refuses a foreground service start that
 * happened while the app was away. Both leave an active trip with no updates
 * running, which nothing else would ever notice.
 */
export async function resumeIfInterrupted(): Promise<boolean> {
  const tripId = await getActiveTripId();
  if (tripId === null) return false;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return false;
  if ((await permissionState()) === 'denied') return false;

  await restart(((await getProfileName()) ?? 'walking') as TrackingProfileName);
  return true;
}

export async function status(): Promise<TrackingStatus> {
  const [tripId, profile, running, queue] = await Promise.all([
    getActiveTripId(),
    getProfileName(),
    Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false),
    stats(),
  ]);
  return {
    tripId,
    running,
    profile: (profile ?? 'walking') as TrackingProfileName,
    queue,
  };
}

export { clearTrip, syncNow };
