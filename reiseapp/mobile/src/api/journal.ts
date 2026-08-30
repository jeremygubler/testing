import { request } from './client';
import type { JournalEntry, Timeline } from './types';

export async function listEntries(tripId: string): Promise<JournalEntry[]> {
  return request<JournalEntry[]>(`/trips/${tripId}/journal`);
}

export async function getEntry(tripId: string, entryId: string): Promise<JournalEntry> {
  return request<JournalEntry>(`/trips/${tripId}/journal/${entryId}`);
}

export interface JournalInput {
  title?: string | null;
  text: string;
  timestamp: string;
  stopId?: string | null;
  /** Order is preserved exactly as given. */
  photoIds?: string[];
}

function toBody(input: JournalInput) {
  return {
    title: input.title?.trim() || null,
    text: input.text,
    timestamp: input.timestamp,
    stop_id: input.stopId ?? null,
    photo_ids: input.photoIds ?? [],
  };
}

export async function createEntry(
  tripId: string,
  input: JournalInput,
): Promise<JournalEntry> {
  return request<JournalEntry>(`/trips/${tripId}/journal`, {
    method: 'POST',
    body: toBody(input),
  });
}

export async function updateEntry(
  tripId: string,
  entryId: string,
  input: JournalInput,
): Promise<JournalEntry> {
  return request<JournalEntry>(`/trips/${tripId}/journal/${entryId}`, {
    method: 'PATCH',
    body: toBody(input),
  });
}

export async function deleteEntry(tripId: string, entryId: string): Promise<void> {
  await request<void>(`/trips/${tripId}/journal/${entryId}`, { method: 'DELETE' });
}

/** Stops, entries and photo bursts, already merged and ordered by the server. */
export async function getTimeline(tripId: string): Promise<Timeline> {
  return request<Timeline>(`/trips/${tripId}/timeline`);
}
