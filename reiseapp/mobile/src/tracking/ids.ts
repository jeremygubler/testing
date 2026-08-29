import * as Crypto from 'expo-crypto';

/**
 * Waypoint ids are derived from (device, timestamp), not random.
 *
 * The OS can hand the same fix to a restarted headless task more than once. With
 * a random id that replay would become a second point in the route; with a
 * derived one it collides — locally on INSERT OR IGNORE and server-side on
 * ON CONFLICT DO NOTHING.
 */

import { uuidFromHex } from './uuid';

export { uuidFromHex };

export async function waypointId(deviceId: string, recordedAtMs: number): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${deviceId}|${recordedAtMs}`,
  );
  return uuidFromHex(digest);
}

export function randomUuid(): string {
  return Crypto.randomUUID();
}
