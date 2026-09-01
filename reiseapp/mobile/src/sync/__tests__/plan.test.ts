import { planFromPull, type PullChanges } from '../plan';

const CURSOR = '2026-06-01T10:00:00.000Z';

function stop(id: string) {
  return { id, name: `Stop ${id}` } as never;
}

function changes(over: Partial<PullChanges> = {}): PullChanges {
  return { cursor: CURSOR, ...over };
}

describe('planFromPull', () => {
  it('plans nothing for an empty response', () => {
    expect(planFromPull(changes())).toEqual([]);
  });

  it('upserts updated records and deletes removed ones', () => {
    const plan = planFromPull(
      changes({ stops: { updated: [stop('a')], deleted: ['b'] } }),
    );
    expect(plan).toEqual([
      { op: 'upsert', entity: 'stop', id: 'a', record: stop('a') },
      { op: 'delete', entity: 'stop', id: 'b' },
    ]);
  });

  it('skips records with unpushed local edits', () => {
    // Overwriting them would silently discard what the user just wrote; the
    // next push reconciles them per field instead.
    const plan = planFromPull(
      changes({ stops: { updated: [stop('a'), stop('b')], deleted: [] } }),
      new Set(['stop:a']),
    );
    expect(plan.map((m) => m.id)).toEqual(['b']);
  });

  it('applies deletions even when there are local edits', () => {
    // The record is gone server-side; a pending edit would be rejected anyway.
    const plan = planFromPull(
      changes({ stops: { updated: [], deleted: ['a'] } }),
      new Set(['stop:a']),
    );
    expect(plan).toEqual([{ op: 'delete', entity: 'stop', id: 'a' }]);
  });

  it('handles all three entity groups', () => {
    const plan = planFromPull(
      changes({
        stops: { updated: [stop('s')], deleted: [] },
        photos: { updated: [stop('p')], deleted: [] },
        journal_entries: { updated: [stop('j')], deleted: [] },
      }),
    );
    expect(plan.map((m) => m.entity)).toEqual(['stop', 'photo', 'journal_entry']);
  });
});
