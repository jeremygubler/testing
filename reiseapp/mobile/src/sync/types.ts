/** Entities the client can change locally. Waypoints go through the tracking queue. */
export type SyncEntity = 'trip' | 'stop' | 'journal_entry' | 'photo';

/** A local change waiting to be pushed. */
export interface OutboxRecord {
  entity: SyncEntity;
  id: string;
  tripId: string;
  /** Only the fields this device changed. */
  fields: Record<string, unknown>;
  /** When each field was changed locally. */
  fieldUpdatedAt: Record<string, string>;
  updatedAt: string;
}

export interface Conflict {
  id: string;
  fields: string[];
}

export interface SyncSummary {
  pushed: number;
  pulled: number;
  conflicts: Conflict[];
}
