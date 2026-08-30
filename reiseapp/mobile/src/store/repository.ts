import type { JournalEntry, Photo, Stop, Trip } from '@/api/types';
import type { OutboxRecord, SyncEntity } from '@/sync/types';
import { db, parseRows, type StoredRow } from './db';

const TABLES: Record<SyncEntity, string> = {
  trip: 'trips',
  stop: 'stops',
  photo: 'photos',
  journal_entry: 'journal_entries',
};

export async function upsert(
  entity: SyncEntity,
  id: string,
  tripId: string,
  record: object,
  updatedAt: string,
): Promise<void> {
  const database = await db();
  const table = TABLES[entity];
  const payload = JSON.stringify(record);
  if (entity === 'trip') {
    await database.runAsync(
      `INSERT INTO trips (id, payload, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      [id, payload, updatedAt],
    );
    return;
  }
  await database.runAsync(
    `INSERT INTO ${table} (id, trip_id, payload, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    [id, tripId, payload, updatedAt],
  );
}

export async function remove(entity: SyncEntity, id: string): Promise<void> {
  const database = await db();
  await database.runAsync(`DELETE FROM ${TABLES[entity]} WHERE id = ?`, [id]);
}

export async function listTrips(): Promise<Trip[]> {
  const database = await db();
  return parseRows<Trip>(
    await database.getAllAsync<StoredRow>(`SELECT * FROM trips ORDER BY updated_at DESC`),
  );
}

export async function getTrip(id: string): Promise<Trip | null> {
  const database = await db();
  const rows = await database.getAllAsync<StoredRow>(`SELECT * FROM trips WHERE id = ?`, [id]);
  return rows.length > 0 ? parseRows<Trip>(rows)[0] ?? null : null;
}

async function listFor<T>(table: string, tripId: string): Promise<T[]> {
  const database = await db();
  return parseRows<T>(
    await database.getAllAsync<StoredRow>(
      `SELECT * FROM ${table} WHERE trip_id = ? ORDER BY updated_at`,
      [tripId],
    ),
  );
}

export const listStops = (tripId: string) => listFor<Stop>('stops', tripId);
export const listPhotos = (tripId: string) => listFor<Photo>('photos', tripId);
export const listEntries = (tripId: string) => listFor<JournalEntry>('journal_entries', tripId);

// --- outbox ---

interface OutboxRow {
  entity: SyncEntity;
  id: string;
  trip_id: string;
  fields: string;
  field_updated_at: string;
  updated_at: string;
}

function toOutbox(row: OutboxRow): OutboxRecord {
  return {
    entity: row.entity,
    id: row.id,
    tripId: row.trip_id,
    fields: JSON.parse(row.fields) as Record<string, unknown>,
    fieldUpdatedAt: JSON.parse(row.field_updated_at) as Record<string, string>,
    updatedAt: row.updated_at,
  };
}

export async function getOutbox(entity: SyncEntity, id: string): Promise<OutboxRecord | null> {
  const database = await db();
  const rows = await database.getAllAsync<OutboxRow>(
    `SELECT * FROM outbox WHERE entity = ? AND id = ?`,
    [entity, id],
  );
  const row = rows[0];
  return row ? toOutbox(row) : null;
}

export async function saveOutbox(record: OutboxRecord): Promise<void> {
  const database = await db();
  await database.runAsync(
    `INSERT INTO outbox (entity, id, trip_id, fields, field_updated_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (entity, id) DO UPDATE SET
       fields = excluded.fields,
       field_updated_at = excluded.field_updated_at,
       updated_at = excluded.updated_at`,
    [
      record.entity,
      record.id,
      record.tripId,
      JSON.stringify(record.fields),
      JSON.stringify(record.fieldUpdatedAt),
      record.updatedAt,
    ],
  );
}

export async function pendingFor(tripId: string): Promise<OutboxRecord[]> {
  const database = await db();
  const rows = await database.getAllAsync<OutboxRow>(
    `SELECT * FROM outbox WHERE trip_id = ?`,
    [tripId],
  );
  return rows.map(toOutbox);
}

export async function pendingCount(): Promise<number> {
  const database = await db();
  const rows = await database.getAllAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox`);
  return rows[0]?.n ?? 0;
}

export async function clearOutbox(records: OutboxRecord[]): Promise<void> {
  if (records.length === 0) return;
  const database = await db();
  for (const record of records) {
    await database.runAsync(`DELETE FROM outbox WHERE entity = ? AND id = ?`, [
      record.entity,
      record.id,
    ]);
  }
}

// --- cursors ---

export async function getCursor(tripId: string): Promise<string | null> {
  const database = await db();
  const rows = await database.getAllAsync<{ cursor: string | null }>(
    `SELECT cursor FROM sync_state WHERE trip_id = ?`,
    [tripId],
  );
  return rows[0]?.cursor ?? null;
}

export async function setCursor(tripId: string, cursor: string): Promise<void> {
  const database = await db();
  await database.runAsync(
    `INSERT INTO sync_state (trip_id, cursor, last_synced_at) VALUES (?, ?, ?)
     ON CONFLICT (trip_id) DO UPDATE SET cursor = excluded.cursor,
                                         last_synced_at = excluded.last_synced_at`,
    [tripId, cursor, new Date().toISOString()],
  );
}

export async function getLastSyncedAt(tripId: string): Promise<string | null> {
  const database = await db();
  const rows = await database.getAllAsync<{ last_synced_at: string | null }>(
    `SELECT last_synced_at FROM sync_state WHERE trip_id = ?`,
    [tripId],
  );
  return rows[0]?.last_synced_at ?? null;
}
