import * as SQLite from 'expo-sqlite';

import type { BufferedWaypoint, QueueStats } from './types';

/**
 * On-device write-ahead buffer for tracked points.
 *
 * Every fix lands here first and is only deleted once the server has confirmed
 * it. That is the whole offline story for tracking: the phone can spend three
 * weeks in a valley without signal and still lose nothing.
 */

const DB_NAME = 'reiseapp-tracking.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync(DB_NAME);
      await database.execAsync(`
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
      `);
      return database;
    })();
  }
  return dbPromise;
}

interface Row {
  id: string;
  trip_id: string;
  lat: number;
  lon: number;
  altitude_m: number | null;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  recorded_at: string;
  device_id: string | null;
}

function toWaypoint(row: Row): BufferedWaypoint {
  return {
    id: row.id,
    tripId: row.trip_id,
    lat: row.lat,
    lon: row.lon,
    altitudeM: row.altitude_m,
    accuracyM: row.accuracy_m,
    speedMps: row.speed_mps,
    headingDeg: row.heading_deg,
    recordedAt: row.recorded_at,
    deviceId: row.device_id,
  };
}

export async function enqueue(points: BufferedWaypoint[]): Promise<void> {
  if (points.length === 0) return;
  const database = await db();
  await database.withTransactionAsync(async () => {
    for (const point of points) {
      // INSERT OR IGNORE: the same fix can be delivered twice when the OS
      // replays a batch to a restarted headless task.
      await database.runAsync(
        `INSERT OR IGNORE INTO waypoint_queue
           (id, trip_id, lat, lon, altitude_m, accuracy_m, speed_mps, heading_deg,
            recorded_at, device_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          point.id,
          point.tripId,
          point.lat,
          point.lon,
          point.altitudeM,
          point.accuracyM,
          point.speedMps,
          point.headingDeg,
          point.recordedAt,
          point.deviceId,
        ],
      );
    }
  });
}

export async function takeBatch(limit: number): Promise<BufferedWaypoint[]> {
  const database = await db();
  const rows = await database.getAllAsync<Row>(
    `SELECT * FROM waypoint_queue ORDER BY recorded_at, id LIMIT ?`,
    [limit],
  );
  return rows.map(toWaypoint);
}

export async function drop(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const database = await db();
  const placeholders = ids.map(() => '?').join(',');
  await database.runAsync(`DELETE FROM waypoint_queue WHERE id IN (${placeholders})`, ids);
}

export async function stats(): Promise<QueueStats> {
  const database = await db();
  const rows = await database.getAllAsync<{ pending: number; oldest: string | null }>(
    `SELECT COUNT(*) AS pending, MIN(recorded_at) AS oldest FROM waypoint_queue`,
  );
  const row = rows[0];
  return { pending: row?.pending ?? 0, oldestRecordedAt: row?.oldest ?? null };
}

export async function clearTrip(tripId: string): Promise<void> {
  const database = await db();
  await database.runAsync(`DELETE FROM waypoint_queue WHERE trip_id = ?`, [tripId]);
}
