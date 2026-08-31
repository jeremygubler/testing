import { isRealMovement, keepMoving, MAX_ACCURACY_M } from '../filter';
import { haversineMetres } from '../geo';

/** The 16 fixes Jeremy's phone recorded while lying still in Reiden. */
const STANDING_STILL = [
  { lat: 47.24336, lon: 7.96884, accuracyM: 100 },
  { lat: 47.24332, lon: 7.96877, accuracyM: 17 },
  { lat: 47.24333, lon: 7.96877, accuracyM: 11 },
  { lat: 47.24333, lon: 7.96877, accuracyM: 100 },
  { lat: 47.24335, lon: 7.96885, accuracyM: 100 },
  { lat: 47.24334, lon: 7.96881, accuracyM: 13 },
  { lat: 47.24334, lon: 7.96881, accuracyM: 56 },
  { lat: 47.24336, lon: 7.96886, accuracyM: 15 },
  { lat: 47.24335, lon: 7.96872, accuracyM: 15 },
  { lat: 47.24336, lon: 7.96881, accuracyM: 14 },
  { lat: 47.24335, lon: 7.96883, accuracyM: 13 },
  { lat: 47.24335, lon: 7.96883, accuracyM: 100 },
  { lat: 47.24333, lon: 7.96874, accuracyM: 19 },
  { lat: 47.24333, lon: 7.96880, accuracyM: 11 },
  { lat: 47.24335, lon: 7.96883, accuracyM: 17 },
  { lat: 47.24334, lon: 7.96880, accuracyM: 11 },
];

describe('isRealMovement', () => {
  it('keeps the first fix, having nothing to compare it against', () => {
    expect(isRealMovement(null, { lat: 47.24334, lon: 7.968, accuracyM: 11 })).toBe(true);
  });

  it('rejects a fix too uncertain to mean anything', () => {
    expect(
      isRealMovement(null, { lat: 47.3, lon: 8.5, accuracyM: MAX_ACCURACY_M + 1 }),
    ).toBe(false);
  });

  it('rejects a step smaller than the uncertainty that produced it', () => {
    const a = { lat: 47.24334, lon: 7.9688, accuracyM: 11 };
    const b = { lat: 47.24335, lon: 7.96883, accuracyM: 17 };
    expect(isRealMovement(a, b)).toBe(false);
  });

  it('accepts a step that clearly leaves the error circle', () => {
    const a = { lat: 47.24334, lon: 7.9688, accuracyM: 11 };
    const b = { lat: 47.2438, lon: 7.9688, accuracyM: 11 }; // ~51 m north
    expect(isRealMovement(a, b)).toBe(true);
  });

  it('does not trust an implausibly precise claim', () => {
    // 3 m apart, both fixes claiming 1 m: still noise, MIN_MOVE_M decides.
    const a = { lat: 47.24334, lon: 7.9688, accuracyM: 1 };
    const b = { lat: 47.243367, lon: 7.9688, accuracyM: 1 };
    expect(isRealMovement(a, b)).toBe(false);
  });
});

describe('keepMoving', () => {
  it('reduces an evening of standing still to a single point', () => {
    expect(keepMoving(null, STANDING_STILL)).toHaveLength(1);
  });

  it('lets nothing through once that point is already known', () => {
    expect(keepMoving(STANDING_STILL[0]!, STANDING_STILL)).toHaveLength(0);
  });

  it('carries the last kept fix forward, so small steps have to add up', () => {
    // Six 4 m steps in one direction. Against its predecessor every one of them
    // is noise; against the last *kept* fix the drift accumulates until it is
    // real. Comparing against the last seen fix instead would keep none of them
    // and quietly lose 20 m of genuine ground.
    const drift = Array.from({ length: 6 }, (_, i) => ({
      lat: 47.24334 + i * 0.000036,
      lon: 7.9688,
      accuracyM: 11,
    }));
    const kept = keepMoving(null, drift);
    expect(kept).toHaveLength(2);
    expect(haversineMetres(kept[0]!, kept[1]!)).toBeGreaterThanOrEqual(11);
  });

  it('keeps a real walk', () => {
    const walk = Array.from({ length: 5 }, (_, i) => ({
      lat: 47.24334 + i * 0.00045, // ~50 m apart
      lon: 7.9688,
      accuracyM: 11,
    }));
    expect(keepMoving(null, walk)).toHaveLength(5);
  });
});
