import type { OutboxRecord, SyncEntity } from './types';

/**
 * Local edits accumulate per record rather than as a log of individual changes.
 *
 * Editing a title five times offline should push one title, not five. Merging
 * keeps the newest value per field together with the timestamp of that specific
 * edit — which is exactly what the server's per-field resolution consumes.
 */
export function mergeOutbox(
  existing: OutboxRecord | null,
  entity: SyncEntity,
  id: string,
  tripId: string,
  fields: Record<string, unknown>,
  at: string = new Date().toISOString(),
): OutboxRecord {
  const merged: OutboxRecord = existing
    ? { ...existing, fields: { ...existing.fields }, fieldUpdatedAt: { ...existing.fieldUpdatedAt } }
    : { entity, id, tripId, fields: {}, fieldUpdatedAt: {}, updatedAt: at };

  for (const [name, value] of Object.entries(fields)) {
    merged.fields[name] = value;
    merged.fieldUpdatedAt[name] = at;
  }
  // The record stamp is the newest of any field: it is the fallback the server
  // uses for fields that arrive without one.
  merged.updatedAt = at > merged.updatedAt ? at : merged.updatedAt;
  return merged;
}

/** Groups pending records into the shape POST /sync/push expects. */
export function buildPushPayload(records: OutboxRecord[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const lists: Record<string, unknown[]> = {
    stops: [],
    journal_entries: [],
    photos: [],
  };

  for (const record of records) {
    const body = {
      id: record.id,
      updated_at: record.updatedAt,
      field_updated_at: record.fieldUpdatedAt,
      ...record.fields,
    };
    if (record.entity === 'trip') {
      // At most one trip record per push – the endpoint is scoped to one trip.
      payload.trip = body;
    } else if (record.entity === 'stop') {
      lists.stops?.push(body);
    } else if (record.entity === 'journal_entry') {
      lists.journal_entries?.push(body);
    } else {
      lists.photos?.push(body);
    }
  }

  for (const [key, value] of Object.entries(lists)) {
    if (value.length > 0) payload[key] = value;
  }
  return payload;
}
