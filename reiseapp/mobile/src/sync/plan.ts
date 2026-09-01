import type { JournalEntry, Photo, Stop, Trip } from '@/api/types';
import type { SyncEntity } from './types';

export interface PullChanges {
  cursor: string;
  trip?: Trip | null;
  trip_deleted?: boolean;
  stops?: { updated: Stop[]; deleted: string[] };
  photos?: { updated: Photo[]; deleted: string[] };
  journal_entries?: { updated: JournalEntry[]; deleted: string[] };
  has_more?: boolean;
}

export interface Upsert {
  op: 'upsert';
  entity: SyncEntity;
  id: string;
  record: Trip | Stop | Photo | JournalEntry;
}

export interface Remove {
  op: 'delete';
  entity: SyncEntity;
  id: string;
}

export type Mutation = Upsert | Remove;

/**
 * Turns a pull response into a flat list of local writes.
 *
 * Pure on purpose: the ordering and skip rules are the part worth testing, and
 * they should not need a device to exercise.
 */
export function planFromPull(
  changes: PullChanges,
  pending: ReadonlySet<string> = new Set(),
): Mutation[] {
  const mutations: Mutation[] = [];

  const consider = (entity: SyncEntity, id: string, build: () => Mutation) => {
    // A record with unpushed local edits keeps them: overwriting it with the
    // server's version would silently discard what the user just wrote. It gets
    // reconciled on the next push, where the server resolves per field.
    if (pending.has(`${entity}:${id}`)) return;
    mutations.push(build());
  };

  if (changes.trip_deleted && changes.trip == null) {
    mutations.push({ op: 'delete', entity: 'trip', id: '' });
  } else if (changes.trip) {
    const trip = changes.trip;
    consider('trip', trip.id, () => ({ op: 'upsert', entity: 'trip', id: trip.id, record: trip }));
  }

  const groups: [SyncEntity, { updated: (Stop | Photo | JournalEntry)[]; deleted: string[] } | undefined][] = [
    ['stop', changes.stops],
    ['photo', changes.photos],
    ['journal_entry', changes.journal_entries],
  ];

  for (const [entity, group] of groups) {
    for (const record of group?.updated ?? []) {
      consider(entity, record.id, () => ({ op: 'upsert', entity, id: record.id, record }));
    }
    for (const id of group?.deleted ?? []) {
      // Deletions win over local edits: the record is gone server-side, and a
      // pending edit would be rejected on push anyway.
      mutations.push({ op: 'delete', entity, id });
    }
  }

  return mutations;
}
