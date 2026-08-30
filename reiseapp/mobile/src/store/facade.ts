import { listTrips as fetchTrips } from '@/api/trips';
import type { JournalEntry, Photo, Stop, Trip } from '@/api/types';
import { recordChange, syncTrip } from '@/sync/engine';
import { randomUuid } from '@/tracking/ids';
import * as repo from './repository';

/**
 * Cache-first data access.
 *
 * Screens read what is on the device and render immediately, then a sync runs
 * and they read again. Without network the first half still works — which is
 * the entire point of the phase.
 */

export interface TripData {
  trip: Trip | null;
  stops: Stop[];
  photos: Photo[];
  entries: JournalEntry[];
}

export async function cachedTrips(): Promise<Trip[]> {
  return repo.listTrips();
}

/** Refreshes the trip list from the server; falls back to the cache offline. */
export async function refreshTrips(): Promise<{ trips: Trip[]; offline: boolean }> {
  try {
    const trips = await fetchTrips();
    for (const trip of trips) {
      await repo.upsert('trip', trip.id, trip.id, trip, trip.updated_at);
    }
    return { trips, offline: false };
  } catch {
    return { trips: await repo.listTrips(), offline: true };
  }
}

export async function cachedTrip(tripId: string): Promise<TripData> {
  const [trip, stops, photos, entries] = await Promise.all([
    repo.getTrip(tripId),
    repo.listStops(tripId),
    repo.listPhotos(tripId),
    repo.listEntries(tripId),
  ]);
  return { trip, stops, photos, entries };
}

/** Syncs the trip and returns the refreshed local state. */
export async function refreshTrip(tripId: string): Promise<{ data: TripData; offline: boolean }> {
  try {
    await syncTrip(tripId);
    return { data: await cachedTrip(tripId), offline: false };
  } catch {
    return { data: await cachedTrip(tripId), offline: true };
  }
}

// --- local edits -----------------------------------------------------------

export async function createStopLocally(
  tripId: string,
  input: { name: string; lat: number; lon: number; notes?: string },
): Promise<Stop> {
  const now = new Date().toISOString();
  const stop: Stop = {
    id: randomUuid(),
    trip_id: tripId,
    name: input.name,
    lat: input.lat,
    lon: input.lon,
    altitude_m: null,
    arrived_at: now,
    left_at: null,
    country: null,
    locality: null,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  };
  await repo.upsert('stop', stop.id, tripId, stop, now);
  await recordChange('stop', stop.id, tripId, {
    name: stop.name,
    lat: stop.lat,
    lon: stop.lon,
    arrived_at: stop.arrived_at,
    notes: stop.notes,
  });
  return stop;
}

export async function deleteStopLocally(tripId: string, stopId: string): Promise<void> {
  await repo.remove('stop', stopId);
  // The delete is a field like any other, so it resolves against concurrent
  // edits by timestamp rather than always winning.
  await recordChange('stop', stopId, tripId, { deleted_at: new Date().toISOString() });
}

export async function saveEntryLocally(
  tripId: string,
  input: { id?: string; title: string | null; text: string; timestamp: string },
): Promise<JournalEntry> {
  const now = new Date().toISOString();
  const id = input.id ?? randomUuid();
  const existing = (await repo.listEntries(tripId)).find((entry) => entry.id === id);
  const entry: JournalEntry = {
    id,
    trip_id: tripId,
    stop_id: existing?.stop_id ?? null,
    author_id: existing?.author_id ?? null,
    title: input.title,
    text: input.text,
    timestamp: input.timestamp,
    photos: existing?.photos ?? [],
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  await repo.upsert('journal_entry', id, tripId, entry, now);
  await recordChange('journal_entry', id, tripId, {
    title: entry.title,
    text: entry.text,
    timestamp: entry.timestamp,
  });
  return entry;
}

export async function deleteEntryLocally(tripId: string, entryId: string): Promise<void> {
  await repo.remove('journal_entry', entryId);
  await recordChange('journal_entry', entryId, tripId, {
    deleted_at: new Date().toISOString(),
  });
}

export { pendingCount } from '@/sync/engine';
export const lastSyncedAt = repo.getLastSyncedAt;
