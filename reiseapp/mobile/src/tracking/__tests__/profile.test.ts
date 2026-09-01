import { nextProfile, PROFILES, PROFILE_ORDER } from '../profile';

describe('adaptive tracking profile', () => {
  it('moves up when the speed clearly exceeds the threshold', () => {
    expect(nextProfile('stationary', 1.5)).toBe('walking');
    expect(nextProfile('walking', 5)).toBe('cycling');
    expect(nextProfile('cycling', 20)).toBe('vehicle');
  });

  it('can skip levels when the speed jumps', () => {
    expect(nextProfile('stationary', 25)).toBe('vehicle');
  });

  it('moves back down when movement stops', () => {
    expect(nextProfile('vehicle', 0.1)).toBe('stationary');
    expect(nextProfile('cycling', 1.2)).toBe('walking');
  });

  it('holds the profile inside the hysteresis gap', () => {
    // 0.5 m/s is above the step-down and below the step-up threshold: whichever
    // side we come from, the profile must not flip. A walker at a traffic light
    // would otherwise restart the location updates every few seconds.
    expect(nextProfile('walking', 0.5)).toBe('walking');
    expect(nextProfile('stationary', 0.5)).toBe('stationary');
    expect(nextProfile('cycling', 2.4)).toBe('cycling');
    expect(nextProfile('walking', 2.4)).toBe('walking');
  });

  it('keeps the current profile when the speed is unknown', () => {
    // expo-location reports -1, null or nothing when it has no estimate.
    for (const unknown of [-1, null, undefined, NaN]) {
      expect(nextProfile('cycling', unknown)).toBe('cycling');
    }
  });

  it('recovers from an unknown profile name', () => {
    expect(nextProfile('nonsense' as never, 0)).toBe('stationary');
  });

  it('records less often the slower we move', () => {
    const intervals = PROFILE_ORDER.map((name) => PROFILES[name].timeIntervalMs);
    expect(intervals[0]).toBeGreaterThan(intervals[1]!);
    expect(PROFILES.stationary.timeIntervalMs).toBeGreaterThan(PROFILES.vehicle.timeIntervalMs);
  });
});
