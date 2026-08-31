import * as Location from 'expo-location';

import { clearTrip, stats } from './queue';
import { PROFILES, type TrackingProfileName } from './profile';
import { getActiveTripId, getProfileName, setActiveTripId, setProfileName } from './state';
import { LOCATION_TASK, setProfileRestartHandler, syncNow } from './task';
import type { QueueStats } from './types';

export type PermissionOutcome = 'granted' | 'foreground-only' | 'denied';

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
 * Foreground first, then background.
 *
 * Android and iOS both refuse the background prompt unless foreground access is
 * already granted, so the order is not a style choice.
 */
export async function requestPermissions(): Promise<PermissionOutcome> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) return 'denied';

  const background = await Location.requestBackgroundPermissionsAsync();
  return background.granted ? 'granted' : 'foreground-only';
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
