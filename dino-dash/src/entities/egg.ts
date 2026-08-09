import { LANE_WIDTH } from '../core/config';
import { project } from '../render/camera';
import { fillCircle, fillEllipse } from '../render/draw';

export interface Egg {
  worldX: number;
  /** Height above the path. */
  y: number;
  z: number;
  dead: boolean;
  /** Set once the magnet has claimed it, so it homes in on the player. */
  magnetized: boolean;
  seed: number;
}

export const EGG_RADIUS = 0.3;

export function createEgg(lane: number, y: number, z: number): Egg {
  return {
    worldX: lane * LANE_WIDTH,
    y,
    z,
    dead: false,
    magnetized: false,
    seed: Math.random(),
  };
}

export function drawEgg(ctx: CanvasRenderingContext2D, egg: Egg, time: number): void {
  const bob = Math.sin(time * 2.4 + egg.seed * 7) * 0.07;
  const p = project(egg.worldX, egg.y + EGG_RADIUS + bob, egg.z);
  if (p.scale < 0.4) return;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.scale, p.scale);
  // Slow wobble instead of a full spin keeps the egg readable at speed.
  ctx.rotate(Math.sin(time * 1.8 + egg.seed * 5) * 0.22);

  ctx.save();
  ctx.globalAlpha = 0.3;
  fillCircle(ctx, 0, 0, EGG_RADIUS * 1.55, '#ffe9a8');
  ctx.restore();

  fillEllipse(ctx, 0, 0, EGG_RADIUS * 0.78, EGG_RADIUS, '#f5c542');
  fillEllipse(ctx, -EGG_RADIUS * 0.16, EGG_RADIUS * 0.12, EGG_RADIUS * 0.55, EGG_RADIUS * 0.7, '#ffd766');
  fillEllipse(ctx, EGG_RADIUS * 0.2, -EGG_RADIUS * 0.3, EGG_RADIUS * 0.22, EGG_RADIUS * 0.3, '#fff3c4');

  // Speckles.
  ctx.save();
  ctx.globalAlpha = 0.5;
  fillCircle(ctx, -EGG_RADIUS * 0.28, -EGG_RADIUS * 0.1, EGG_RADIUS * 0.1, '#e0a92e');
  fillCircle(ctx, EGG_RADIUS * 0.1, EGG_RADIUS * 0.42, EGG_RADIUS * 0.09, '#e0a92e');
  ctx.restore();

  ctx.restore();
}
