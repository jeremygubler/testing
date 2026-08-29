import { haversineMetres } from '../geo';

const ZURICH = { lat: 47.3769, lon: 8.5417 };
const BERN = { lat: 46.948, lon: 7.4474 };

describe('haversineMetres', () => {
  it('matches the known distance Zürich–Bern', () => {
    expect(haversineMetres(ZURICH, BERN)).toBeGreaterThan(90_000);
    expect(haversineMetres(ZURICH, BERN)).toBeLessThan(100_000);
  });

  it('is zero for the same point and symmetric', () => {
    expect(haversineMetres(ZURICH, ZURICH)).toBe(0);
    expect(haversineMetres(ZURICH, BERN)).toBeCloseTo(haversineMetres(BERN, ZURICH), 6);
  });

  it('handles the antimeridian without NaN', () => {
    const distance = haversineMetres({ lat: 0, lon: 179.9 }, { lat: 0, lon: -179.9 });
    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeLessThan(25_000);
  });
});
