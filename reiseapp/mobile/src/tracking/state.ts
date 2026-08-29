import * as SQLite from 'expo-sqlite';

/**
 * Which trip the background task should attribute points to.
 *
 * Lives in SQLite next to the buffer rather than in React state: the headless
 * task runs in its own JS context after the app has been killed, and has to be
 * able to answer this question on its own.
 */

const DB_NAME = 'reiseapp-tracking.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync(DB_NAME);
      await database.execAsync(
        `CREATE TABLE IF NOT EXISTS tracking_state (key TEXT PRIMARY KEY NOT NULL, value TEXT);`,
      );
      return database;
    })();
  }
  return dbPromise;
}

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

export const getDeviceId = () => get('device_id');
export const setDeviceId = (deviceId: string) => set('device_id', deviceId);
