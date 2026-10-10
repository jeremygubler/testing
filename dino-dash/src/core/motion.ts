/**
 * Respects the operating system's "reduce motion" setting. Screen shake and
 * heavy particle effects are the parts most likely to cause discomfort, so
 * they are toned down rather than the game being slowed.
 */
let query: MediaQueryList | null = null;

function media(): MediaQueryList | null {
  if (query) return query;
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  query = window.matchMedia('(prefers-reduced-motion: reduce)');
  return query;
}

export function prefersReducedMotion(): boolean {
  return media()?.matches ?? false;
}

/** Scales an effect strength to zero when reduced motion is requested. */
export function motionScale(): number {
  return prefersReducedMotion() ? 0 : 1;
}
