import { backoffMs, drainQueue, type SyncDeps } from '../sync';
import type { BufferedWaypoint } from '../types';

function point(id: string, tripId = 'trip-1'): BufferedWaypoint {
  return {
    id,
    tripId,
    lat: 47,
    lon: 8,
    altitudeM: null,
    accuracyM: null,
    speedMps: null,
    headingDeg: null,
    recordedAt: `2026-06-01T00:00:${id.padStart(2, '0')}Z`,
    deviceId: 'device-1',
  };
}

function fakeQueue(initial: BufferedWaypoint[]) {
  let rows = [...initial];
  const uploads: BufferedWaypoint[][] = [];
  const deps: SyncDeps = {
    takeBatch: async (limit) => rows.slice(0, limit),
    drop: async (ids) => {
      rows = rows.filter((row) => !ids.includes(row.id));
    },
    upload: async (_tripId, points) => {
      uploads.push(points);
    },
  };
  return {
    deps,
    uploads,
    get remaining() {
      return rows;
    },
  };
}

describe('drainQueue', () => {
  it('uploads everything and empties the buffer', async () => {
    const queue = fakeQueue([point('1'), point('2'), point('3')]);
    const result = await drainQueue(queue.deps, { batchSize: 2 });

    expect(result).toEqual({ uploaded: 3, batches: 2, failed: false, discarded: 0 });
    expect(queue.remaining).toEqual([]);
    expect(queue.uploads.map((batch) => batch.length)).toEqual([2, 1]);
  });

  it('does nothing on an empty buffer', async () => {
    const queue = fakeQueue([]);
    expect(await drainQueue(queue.deps)).toEqual({
      uploaded: 0,
      batches: 0,
      failed: false,
      discarded: 0,
    });
  });

  it('keeps the points when the upload fails', async () => {
    // The one invariant that matters: points are only dropped after the server
    // has confirmed them, so a failed sync can never lose a leg of the trip.
    const queue = fakeQueue([point('1'), point('2')]);
    queue.deps.upload = async () => {
      throw new Error('offline');
    };

    const result = await drainQueue(queue.deps);

    expect(result.failed).toBe(true);
    expect(result.uploaded).toBe(0);
    expect(queue.remaining).toHaveLength(2);
  });

  it('splits a batch into one request per trip', async () => {
    const queue = fakeQueue([point('1', 'trip-a'), point('2', 'trip-b'), point('3', 'trip-a')]);
    await drainQueue(queue.deps, { batchSize: 10 });

    expect(queue.uploads).toHaveLength(2);
    expect(queue.uploads[0]?.map((p) => p.id)).toEqual(['1', '3']);
    expect(queue.uploads[1]?.map((p) => p.id)).toEqual(['2']);
  });

  it('stops after a failing trip without dropping the rest', async () => {
    const queue = fakeQueue([point('1', 'trip-a'), point('2', 'trip-b')]);
    queue.deps.upload = async (tripId) => {
      if (tripId === 'trip-a') throw new Error('offline');
    };

    const result = await drainQueue(queue.deps, { batchSize: 10 });
    expect(result.failed).toBe(true);
    expect(queue.remaining).toHaveLength(2);
  });

  describe('a refusal that will not change', () => {
    function goneQueue(initial: BufferedWaypoint[], gone: string) {
      const queue = fakeQueue(initial);
      queue.deps.upload = async (tripId, points) => {
        if (tripId === gone) throw new Error('404');
        queue.uploads.push(points);
      };
      queue.deps.isPermanent = (error) => String(error).includes('404');
      return queue;
    }

    it('throws the points away instead of keeping them forever', async () => {
      // A trip deleted on another device: the server will answer 404 today,
      // tomorrow and in a year, and a buffer that never empties tells the user
      // their data is stuck when it is merely undeliverable.
      const queue = goneQueue([point('1', 'weg'), point('2', 'weg')], 'weg');

      const result = await drainQueue(queue.deps, { batchSize: 10 });

      expect(result.discarded).toBe(2);
      expect(result.failed).toBe(false);
      expect(queue.remaining).toHaveLength(0);
    });

    it('keeps going for the trips that are still there', async () => {
      const queue = goneQueue([point('1', 'weg'), point('2', 'da')], 'weg');

      const result = await drainQueue(queue.deps, { batchSize: 10 });

      expect(result.discarded).toBe(1);
      expect(result.uploaded).toBe(1);
      expect(queue.remaining.map((row) => row.id)).toEqual([]);
    });

    it('still keeps what only failed temporarily', async () => {
      const queue = fakeQueue([point('1', 'trip-a')]);
      queue.deps.upload = async () => {
        throw new Error('offline');
      };
      queue.deps.isPermanent = (error) => String(error).includes('404');

      const result = await drainQueue(queue.deps, { batchSize: 10 });

      expect(result.failed).toBe(true);
      expect(result.discarded).toBe(0);
      expect(queue.remaining).toHaveLength(1);
    });

    it('without a classifier nothing is ever thrown away', async () => {
      const queue = fakeQueue([point('1', 'weg')]);
      queue.deps.upload = async () => {
        throw new Error('404');
      };

      const result = await drainQueue(queue.deps, { batchSize: 10 });

      expect(result.discarded).toBe(0);
      expect(queue.remaining).toHaveLength(1);
    });
  });
});

describe('backoffMs', () => {
  it('grows exponentially and is capped', () => {
    expect(backoffMs(1)).toBe(5_000);
    expect(backoffMs(2)).toBe(10_000);
    expect(backoffMs(3)).toBe(20_000);
    expect(backoffMs(99)).toBe(300_000);
  });

  it('never returns less than the base delay', () => {
    expect(backoffMs(0)).toBe(5_000);
    expect(backoffMs(-5)).toBe(5_000);
  });
});
