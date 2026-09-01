import { trackingDb as db } from './db';
import type { Fix } from './filter';

/**
 * Which trip the background task should attribute points to.
 *
 * Lives in SQLite next to the buffer rather than in React state: the headless
 * task runs in its own JS context after the app has been killed, and has to be
 * able to answer this question on its own.
 */

async function get(key: string): Promise<string | null> {
  const database = await db();
  const rows = await database.getAllAsync<{ value: string | null }>(
    `SELECT value FROM tracking_state WHERE key = ?`,
    [key],
  );
  return rows[0]?.value ?? null;
}

async function set(key: string, value: string | null): Promise<void> {
  const database = await db();
  if (value === null) {
    await database.runAsync(`DELETE FROM tracking_state WHERE key = ?`, [key]);
    return;
  }
  await database.runAsync(
    `INSERT INTO tracking_state (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export const getActiveTripId = () => get('active_trip_id');
export const setActiveTripId = (tripId: string | null) => set('active_trip_id', tripId);

export const getProfileName = () => get('profile');
export const setProfileName = (name: string) => set('profile', name);

/**
 * The last fix that counted as movement.
 *
 * Kept next to the queue rather than in memory because the filter has to survive
 * the same process restarts the task does — otherwise every restart re-admits a
 * point the previous run had already rejected as noise.
 */
export async function getLastFix(): Promise<Fix | null> {
  const raw = await get('last_fix');
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as Fix;
  } catch {
    return null;
  }
}

export const setLastFix = (fix: Fix | null) =>
  set('last_fix', fix === null ? null : JSON.stringify(fix));

export const getDeviceId = () => get('device_id');
export const setDeviceId = (deviceId: string) => set('device_id', deviceId);
