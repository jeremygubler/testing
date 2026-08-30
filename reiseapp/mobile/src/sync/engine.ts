import { request } from '@/api/client';
import type { JournalEntry, Photo, Stop, Trip } from '@/api/types';
import * as repo from '@/store/repository';
import { buildPushPayload, mergeOutbox } from './outbox';
import { planFromPull, type PullChanges } from './plan';
import type { Conflict, OutboxRecord, SyncEntity, SyncSummary } from './types';

interface PushResponse {
  cursor: string;
  trip: { conflicts: Conflict[] };
  stops: { conflicts: Conflict[] };
  journal_entries: { conflicts: Conflict[] };
  photos: { conflicts: Conflict[] };
}

function updatedAtOf(record: Trip | Stop | Photo | JournalEntry): string {
  return 'updated_at' in record ? record.updated_at : new Date().toISOString();
}

/** Records a local change and queues it for the next push. */
export async function recordChange(
  entity: SyncEntity,
  id: string,
  tripId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const existing = await repo.getOutbox(entity, id);
  await repo.saveOutbox(mergeOutbox(existing, entity, id, tripId, fields));
}

async function push(tripId: string): Promise<{ pushed: number; conflicts: Conflict[] }> {
  const pending = await repo.pendingFor(tripId);
  if (pending.length === 0) return { pushed: 0, conflicts: [] };

  const response = await request<PushResponse>(`/trips/${tripId}/sync/push`, {
    method: 'POST',
    body: buildPushPayload(pending),
  });

  // Only clear after the server has accepted them; a failed push leaves the
  // queue untouched so nothing written offline can be lost.
  await repo.clearOutbox(pending);

  const conflicts = [
    ...response.trip.conflicts,
    ...response.stops.conflicts,
    ...response.journal_entries.conflicts,
    ...response.photos.conflicts,
  ];
  return { pushed: pending.length, conflicts };
}

async function pull(tripId: string): Promise<number> {
  let applied = 0;
  let cursor = await repo.getCursor(tripId);

  for (let page = 0; page < 20; page += 1) {
    const query = cursor ? `?since=${encodeURIComponent(cursor)}` : '';
    const changes = await request<PullChanges>(`/trips/${tripId}/sync/pull${query}`);

    // Records with unpushed edits are skipped rather than overwritten.
    const pendingKeys = new Set(
      (await repo.pendingFor(tripId)).map((record) => `${record.entity}:${record.id}`),
    );

    for (const mutation of planFromPull(changes, pendingKeys)) {
      if (mutation.op === 'delete') await repo.remove(mutation.entity, mutation.id);
      else
        await repo.upsert(
          mutation.entity,
          mutation.id,
          tripId,
          mutation.record,
          updatedAtOf(mutation.record),
        );
      applied += 1;
    }

    cursor = changes.cursor;
    await repo.setCursor(tripId, cursor);
    if (!changes.has_more) break;
  }

  return applied;
}

/**
 * Push before pull, always.
 *
 * The other order would pull the server's version of a record this device has
 * just edited, and the pull skips pending records — so the local edit would sit
 * unsynced behind a stale view until the next round.
 */
export async function syncTrip(tripId: string): Promise<SyncSummary> {
  const pushed = await push(tripId);
  const pulled = await pull(tripId);
  return { pushed: pushed.pushed, pulled, conflicts: pushed.conflicts };
}

export async function syncAll(tripIds: string[]): Promise<SyncSummary> {
  const total: SyncSummary = { pushed: 0, pulled: 0, conflicts: [] };
  for (const tripId of tripIds) {
    const summary = await syncTrip(tripId);
    total.pushed += summary.pushed;
    total.pulled += summary.pulled;
    total.conflicts.push(...summary.conflicts);
  }
  return total;
}

export async function pendingCount(): Promise<number> {
  return repo.pendingCount();
}

export type { OutboxRecord };
