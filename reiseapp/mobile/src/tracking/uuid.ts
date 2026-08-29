/**
 * Pure UUID formatting – no expo imports, so it is testable off-device.
 */

/** Formats 32 hex characters as a version-4-shaped UUID. */
export function uuidFromHex(hex: string): string {
  const clean = hex.replace(/[^0-9a-f]/gi, '').toLowerCase();
  if (clean.length < 32) throw new Error('need at least 32 hex characters');
  const chars = clean.slice(0, 32).split('');
  chars[12] = '4'; // version
  const variant = '89ab'[parseInt(chars[16] ?? '0', 16) % 4] ?? '8';
  chars[16] = variant;
  const value = chars.join('');
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20, 32),
  ].join('-');
}
