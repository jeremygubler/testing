import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { uploadWaypoints } from '@/api/geo';
import type { WaypointInput } from '@/api/types';
import { deviceId } from './device';
import { waypointId } from './ids';
import { nextProfile, PROFILES, type TrackingProfileName } from './profile';
import { drop, enqueue, takeBatch } from './queue';
import { drainQueue } from './sync';
import { getActiveTripId, getProfileName, setProfileName } from './state';
import type { BufferedWaypoint } from './types';

export const LOCATION_TASK = 'fernspur-location-updates';

/** Set by the controller so the task can restart updates with new options. */
type Restart = (profile: TrackingProfileName) => Promise<void>;
let restartWithProfile: Restart | null = null;

export function setProfileRestartHandler(handler: Restart | null): void {
  restartWithProfile = handler;
}

async function toBuffered(
  tripId: string,
  device: string,
  location: Location.LocationObject,
): Promise<BufferedWaypoint> {
  return {
    id: await waypointId(device, Math.round(location.timestamp)),
    tripId,
    lat: location.coords.latitude,
    lon: location.coords.longitude,
    altitudeM: location.coords.altitude,
    accuracyM: location.coords.accuracy,
    // expo reports -1 when it has no estimate; the API wants null.
    speedMps: location.coords.speed !== null && location.coords.speed >= 0 ? location.coords.speed : null,
    headingDeg:
      location.coords.heading !== null && location.coords.heading >= 0
        ? location.coords.heading
        : null,
    recordedAt: new Date(location.timestamp).toISOString(),
    deviceId: device,
  };
}

function toApi(point: BufferedWaypoint): WaypointInput {
  return {
    id: point.id,
    lat: point.lat,
    lon: point.lon,
    altitude_m: point.altitudeM,
    accuracy_m: point.accuracyM,
    speed_mps: point.speedMps,
    heading_deg: point.headingDeg,
    recorded_at: point.recordedAt,
    source: 'gps',
    device_id: point.deviceId,
  };
}

/** Uploads whatever is buffered. Safe to call at any time; failures just wait. */
export async function syncNow(): Promise<{ uploaded: number; failed: boolean }> {
  const result = await drainQueue({
    takeBatch,
    drop,
    upload: async (tripId, points) => {
      await uploadWaypoints(tripId, points.map(toApi));
    },
  });
  return { uploaded: result.uploaded, failed: result.failed };
}

async function adaptProfile(locations: Location.LocationObject[]): Promise<void> {
  const latest = locations[locations.length - 1];
  if (!latest) return;
  const current = ((await getProfileName()) ?? 'walking') as TrackingProfileName;
  const target = nextProfile(current, latest.coords.speed);
  if (target === current) return;

  await setProfileName(target);
  // Options cannot be changed in place – the updates have to be restarted.
  await restartWithProfile?.(target);
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      console.warn('[tracking] location task error', error.message);
      return;
    }
    const locations = data?.locations ?? [];
    if (locations.length === 0) return;

    const tripId = await getActiveTripId();
    if (!tripId) {
      // Tracking was stopped while the task was in flight, or the OS restarted a
      // task we no longer want. Shut it down instead of collecting orphan points.
      await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
      return;
    }

    const device = await deviceId();
    const points = await Promise.all(
      locations.map((location) => toBuffered(tripId, device, location)),
    );
    await enqueue(points);

    await adaptProfile(locations);
    // Best effort: with no connectivity the points simply stay buffered.
    await syncNow().catch(() => undefined);
  },
);

export { PROFILES };
