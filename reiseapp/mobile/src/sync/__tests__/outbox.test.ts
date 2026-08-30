import { buildPushPayload, mergeOutbox } from '../outbox';
import type { OutboxRecord } from '../types';

const T1 = '2026-06-01T10:00:00.000Z';
const T2 = '2026-06-01T11:00:00.000Z';

describe('mergeOutbox', () => {
  it('creates a record with a stamp per field', () => {
    const record = mergeOutbox(null, 'stop', 's1', 't1', { name: 'Bern' }, T1);
    expect(record.fields).toEqual({ name: 'Bern' });
    expect(record.fieldUpdatedAt).toEqual({ name: T1 });
    expect(record.updatedAt).toBe(T1);
  });

  it('collapses repeated edits of the same field', () => {
    // Editing a title five times offline should push one title, not five.
    const first = mergeOutbox(null, 'stop', 's1', 't1', { name: 'Alt' }, T1);
    const second = mergeOutbox(first, 'stop', 's1', 't1', { name: 'Neu' }, T2);
    expect(second.fields).toEqual({ name: 'Neu' });
    expect(second.fieldUpdatedAt.name).toBe(T2);
  });

  it('keeps fields edited at different times apart', () => {
    const first = mergeOutbox(null, 'stop', 's1', 't1', { name: 'Bern' }, T1);
    const second = mergeOutbox(first, 'stop', 's1', 't1', { notes: 'schön' }, T2);
    expect(second.fields).toEqual({ name: 'Bern', notes: 'schön' });
    expect(second.fieldUpdatedAt).toEqual({ name: T1, notes: T2 });
    // The record stamp is the newest field – the server's fallback.
    expect(second.updatedAt).toBe(T2);
  });

  it('does not move the record stamp backwards', () => {
    const first = mergeOutbox(null, 'stop', 's1', 't1', { name: 'Neu' }, T2);
    const outOfOrder = mergeOutbox(first, 'stop', 's1', 't1', { notes: 'x' }, T1);
    expect(outOfOrder.updatedAt).toBe(T2);
  });

  it('does not mutate the record it was given', () => {
    const first = mergeOutbox(null, 'stop', 's1', 't1', { name: 'Alt' }, T1);
    mergeOutbox(first, 'stop', 's1', 't1', { name: 'Neu' }, T2);
    expect(first.fields.name).toBe('Alt');
  });
});

describe('buildPushPayload', () => {
  const record = (over: Partial<OutboxRecord>): OutboxRecord => ({
    entity: 'stop',
    id: 's1',
    tripId: 't1',
    fields: { name: 'Bern' },
    fieldUpdatedAt: { name: T1 },
    updatedAt: T1,
    ...over,
  });

  it('groups records by entity', () => {
    const payload = buildPushPayload([
      record({}),
      record({ id: 's2' }),
      record({ entity: 'journal_entry', id: 'j1', fields: { text: 'x' } }),
    ]);
    expect((payload.stops as unknown[]).length).toBe(2);
    expect((payload.journal_entries as unknown[]).length).toBe(1);
    expect(payload.photos).toBeUndefined();
  });

  it('flattens fields next to the envelope', () => {
    const payload = buildPushPayload([record({})]);
    expect((payload.stops as Record<string, unknown>[])[0]).toEqual({
      id: 's1',
      updated_at: T1,
      field_updated_at: { name: T1 },
      name: 'Bern',
    });
  });

  it('puts the trip on its own key, not in a list', () => {
    const payload = buildPushPayload([record({ entity: 'trip', id: 't1', fields: { title: 'x' } })]);
    expect(payload.trip).toMatchObject({ id: 't1', title: 'x' });
    expect(payload.trips).toBeUndefined();
  });

  it('returns an empty payload for no records', () => {
    expect(buildPushPayload([])).toEqual({});
  });
});
