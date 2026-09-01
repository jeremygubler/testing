import type { BufferedWaypoint } from './types';

/**
 * Drains the buffer into the backend.
 *
 * Kept free of expo imports so the batching and failure behaviour can be tested
 * without a device.
 */

export interface SyncDeps {
  takeBatch: (limit: number) => Promise<BufferedWaypoint[]>;
  drop: (ids: string[]) => Promise<void>;
  upload: (tripId: string, points: BufferedWaypoint[]) => Promise<void>;
  /**
   * Whether the server's refusal will still stand tomorrow.
   *
   * A connection that dropped is worth retrying forever; a trip that was
   * deleted is not. Without this distinction the buffer keeps points nobody
   * will ever accept, retries them on every run, and shows a count that can
   * never reach zero.
   */
  isPermanent?: (error: unknown) => boolean;
}

export interface SyncResult {
  uploaded: number;
  batches: number;
  failed: boolean;
  /** Points thrown away because their destination is gone for good. */
  discarded: number;
}

export const BATCH_SIZE = 500;
const MAX_BATCHES_PER_RUN = 20;

export async function drainQueue(
  deps: SyncDeps,
  { batchSize = BATCH_SIZE }: { batchSize?: number } = {},
): Promise<SyncResult> {
  let uploaded = 0;
  let batches = 0;
  let discarded = 0;

  for (let i = 0; i < MAX_BATCHES_PER_RUN; i += 1) {
    const pending = await deps.takeBatch(batchSize);
    if (pending.length === 0) break;

    // One request per trip: a single device can buffer points for more than one
    // trip if the user switches while offline.
    const byTrip = new Map<string, BufferedWaypoint[]>();
    for (const point of pending) {
      const bucket = byTrip.get(point.tripId);
      if (bucket) bucket.push(point);
      else byTrip.set(point.tripId, [point]);
    }

    for (const [tripId, points] of byTrip) {
      try {
        await deps.upload(tripId, points);
      } catch (error) {
        if (deps.isPermanent?.(error)) {
          // Dropped, not kept: these points have nowhere left to go, and a
          // buffer that never empties tells the user their data is stuck when
          // in truth it is undeliverable.
          await deps.drop(points.map((point) => point.id));
          discarded += points.length;
          continue;
        }
        // Leave everything in the buffer and stop: the next run retries. Points
        // are only dropped after the server has confirmed them.
        return { uploaded, batches, failed: true, discarded };
      }
      // The upload is idempotent server-side, so a crash between upload and drop
      // costs one duplicate request, never a lost or doubled point.
      await deps.drop(points.map((point) => point.id));
      uploaded += points.length;
    }
    batches += 1;

    if (pending.length < batchSize) break;
  }

  return { uploaded, batches, failed: false, discarded };
}

/** Exponential backoff with a ceiling, for the retry timer. */
export function backoffMs(attempt: number): number {
  const base = 5_000 * 2 ** Math.max(0, attempt - 1);
  return Math.min(base, 5 * 60_000);
}
