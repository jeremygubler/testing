import * as SQLite from 'expo-sqlite';

/**
 * Local mirror of the trips this device has seen.
 *
 * Separate from the tracking buffer's database on purpose: that one is written
 * from a headless background task and has different durability concerns.
 */

const DB_NAME = 'reiseapp-cache.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stops (
  id TEXT PRIMARY KEY NOT NULL,
  trip_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY NOT NULL,
  trip_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY NOT NULL,
  trip_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  entity TEXT NOT NULL,
  id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  fields TEXT NOT NULL,
  field_updated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (entity, id)
);

CREATE TABLE IF NOT EXISTS sync_state (
  trip_id TEXT PRIMARY KEY NOT NULL,
  cursor TEXT,
  last_synced_at TEXT
);

CREATE INDEX IF NOT EXISTS stops_trip ON stops (trip_id);
CREATE INDEX IF NOT EXISTS photos_trip ON photos (trip_id);
CREATE INDEX IF NOT EXISTS journal_trip ON journal_entries (trip_id);
CREATE INDEX IF NOT EXISTS outbox_trip ON outbox (trip_id);
`;

export async function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync(DB_NAME);
      await database.execAsync(SCHEMA);
      return database;
    })();
  }
  return dbPromise;
}

/** Records are stored as JSON: the API shape is the schema, and it can evolve
 * without a local migration for every added field. */
export interface StoredRow {
  id: string;
  payload: string;
  updated_at: string;
}

export function parseRows<T>(rows: StoredRow[]): T[] {
  return rows.map((row) => JSON.parse(row.payload) as T);
}
