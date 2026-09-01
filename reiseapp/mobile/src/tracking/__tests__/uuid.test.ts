import { uuidFromHex } from '../uuid';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidFromHex', () => {
  it('produces a valid version 4 shaped uuid', () => {
    expect(uuidFromHex('a'.repeat(64))).toMatch(UUID_RE);
    expect(uuidFromHex('0123456789abcdef0123456789abcdef')).toMatch(UUID_RE);
  });

  it('is deterministic – that is the whole point', () => {
    // The same fix replayed by the OS has to collapse onto the same id, both in
    // the local buffer and server-side.
    const digest = '9f'.repeat(32);
    expect(uuidFromHex(digest)).toBe(uuidFromHex(digest));
  });

  it('maps different digests to different ids', () => {
    expect(uuidFromHex('1'.repeat(64))).not.toBe(uuidFromHex('2'.repeat(64)));
  });

  it('rejects input that is too short', () => {
    expect(() => uuidFromHex('abc')).toThrow();
  });
});
