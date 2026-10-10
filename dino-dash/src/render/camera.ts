import { EYE_HEIGHT, FOCAL, HORIZON, LANE_WIDTH, VIEW } from '../core/config';

export interface Projected {
  x: number;
  y: number;
  /** Pixels per world unit at this depth. */
  scale: number;
}

const CENTER_X = VIEW.W / 2;

/**
 * Projects a world point onto the screen. Depth `z` is the distance from the
 * camera; as it grows, points converge on the horizon.
 */
export function project(worldX: number, worldY: number, z: number): Projected {
  const scale = FOCAL / Math.max(z, 0.35);
  return {
    x: CENTER_X + worldX * scale,
    y: HORIZON + (EYE_HEIGHT - worldY) * scale,
    scale,
  };
}

export function laneToWorldX(lane: number): number {
  return lane * LANE_WIDTH;
}

/** Convenience wrapper for entities that sit on a lane. */
export function projectLane(lane: number, worldY: number, z: number): Projected {
  return project(laneToWorldX(lane), worldY, z);
}
