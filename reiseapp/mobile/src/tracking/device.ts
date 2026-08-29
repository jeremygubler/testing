import { getDeviceId, setDeviceId } from './state';
import { randomUuid } from './ids';

/**
 * A random per-installation id, generated once.
 *
 * Deliberately not the vendor/Android id: this only needs to separate the tracks
 * of two phones on a shared trip, and a hardware identifier would be a needless
 * thing to ship to a server.
 */
export async function deviceId(): Promise<string> {
  const existing = await getDeviceId();
  if (existing) return existing;
  const created = randomUuid();
  await setDeviceId(created);
  return created;
}
