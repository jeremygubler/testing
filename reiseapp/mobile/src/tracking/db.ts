import * as SQLite from 'expo-sqlite';

/**
 * The one connection to the tracking database.
 *
 * expo-sqlite hands out a SharedObject per `openDatabaseAsync` call, but the
 * native side keeps a single database per file. Opening the same file from two
 * modules therefore produces two JS handles racing over one native object: as
 * soon as one of them is finalized, the other's id is stale and every call
 * fails with "cannot be cast to NativeDatabase (received Integer)". Queue and
 * state both live in this file, so they have to share one handle.
 */

const DB_NAME = 'reiseapp-tracking.db';

const SCHEMA = `
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS waypoint_queue (
    id TEXT PRIMARY KEY NOT NULL,
    trip_id TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    altitude_m REAL,
    accuracy_m REAL,
    speed_mps REAL,
    heading_deg REAL,
    recorded_at TEXT NOT NULL,
    device_id TEXT
  );

  CREATE INDEX IF NOT EXISTS waypoint_queue_trip_recorded
    ON waypoint_queue (trip_id, recorded_at);

  CREATE TABLE IF NOT EXISTS tracking_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function trackingDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync(DB_NAME);
      await database.execAsync(SCHEMA);
      return database;
    })();
  }
  return dbPromise;
}
