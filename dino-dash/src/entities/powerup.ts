import { LANE_WIDTH } from '../core/config';
import type { PowerUpKind } from '../core/types';
import { project } from '../render/camera';
import { fillCircle, fillEllipse, fillPolygon, fillRoundRect } from '../render/draw';

export interface PowerUp {
  kind: PowerUpKind;
  worldX: number;
  y: number;
  z: number;
  dead: boolean;
  seed: number;
}

export const POWERUP_RADIUS = 0.45;

export const POWERUP_COLOR: Record<PowerUpKind, string> = {
  magnet: '#ff6f91',
  shield: '#5ec8f2',
  boost: '#ffa94d',
  spring: '#9d7bf0',
};

export const POWERUP_LABEL: Record<PowerUpKind, string> = {
  magnet: 'Magnet',
  shield: 'Schild',
  boost: 'Tempo',
  spring: 'Sprungfeder',
};

export function createPowerUp(kind: PowerUpKind, lane: number, z: number): PowerUp {
  return {
    kind,
    worldX: lane * LANE_WIDTH,
    y: 0.95,
    z,
    dead: false,
    seed: Math.random(),
  };
}

export function drawPowerUp(ctx: CanvasRenderingContext2D, p: PowerUp, time: number): void {
  const bob = Math.sin(time * 2 + p.seed * 6) * 0.12;
  const proj = project(p.worldX, p.y + bob, p.z);
  if (proj.scale < 0.4) return;

  const color = POWERUP_COLOR[p.kind];

  ctx.save();
  ctx.translate(proj.x, proj.y);
  ctx.scale(proj.scale, proj.scale);

  // Pulsing halo.
  const pulse = 0.5 + Math.sin(time * 3.4 + p.seed * 4) * 0.5;
  ctx.save();
  ctx.globalAlpha = 0.18 + pulse * 0.18;
  fillCircle(ctx, 0, 0, POWERUP_RADIUS * (1.5 + pulse * 0.22), color);
  ctx.restore();

  fillCircle(ctx, 0, 0, POWERUP_RADIUS, '#fffaf2');
  ctx.lineWidth = 0.09;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, POWERUP_RADIUS - 0.045, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.rotate(Math.sin(time * 1.5 + p.seed * 3) * 0.12);
  drawIcon(ctx, p.kind, color);
  ctx.restore();

  ctx.restore();
}

function drawIcon(ctx: CanvasRenderingContext2D, kind: PowerUpKind, color: string): void {
  switch (kind) {
    case 'magnet': {
      // Horseshoe magnet with two poles.
      ctx.lineWidth = 0.12;
      ctx.strokeStyle = color;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(0, 0.02, 0.17, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.17, 0.02);
      ctx.lineTo(-0.17, 0.19);
      ctx.moveTo(0.17, 0.02);
      ctx.lineTo(0.17, 0.19);
      ctx.stroke();
      fillRoundRect(ctx, -0.23, 0.17, 0.12, 0.08, 0.02, '#5ec8f2');
      fillRoundRect(ctx, 0.11, 0.17, 0.12, 0.08, 0.02, '#5ec8f2');
      break;
    }
    case 'shield': {
      fillPolygon(
        ctx,
        [
          [0, -0.24],
          [0.2, -0.14],
          [0.2, 0.06],
          [0, 0.25],
          [-0.2, 0.06],
          [-0.2, -0.14],
        ],
        color,
      );
      ctx.strokeStyle = '#fffaf2';
      ctx.lineWidth = 0.06;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-0.08, -0.01);
      ctx.lineTo(-0.02, 0.08);
      ctx.lineTo(0.1, -0.1);
      ctx.stroke();
      break;
    }
    case 'boost': {
      for (let i = 0; i < 2; i++) {
        const x = -0.12 + i * 0.16;
        fillPolygon(
          ctx,
          [
            [x - 0.09, -0.2],
            [x + 0.11, 0],
            [x - 0.09, 0.2],
          ],
          color,
        );
      }
      break;
    }
    case 'spring': {
      // Coiled spring with a footplate.
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.075;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const y = 0.16 - t * 0.3;
        const x = Math.sin(t * Math.PI * 4) * 0.14;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      fillEllipse(ctx, 0, 0.21, 0.2, 0.055, color);
      break;
    }
  }
}
