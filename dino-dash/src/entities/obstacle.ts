import { LANE_WIDTH } from '../core/config';
import { project } from '../render/camera';
import { fillCircle, fillEllipse, fillPolygon, fillRoundRect } from '../render/draw';

export type ObstacleKind = 'rock' | 'log' | 'branch' | 'dino' | 'lava';

export interface Obstacle {
  kind: ObstacleKind;
  /** Centre of the obstacle along x. */
  worldX: number;
  halfWidth: number;
  z: number;
  halfDepth: number;
  /** Vertical extent of the collision volume, in world units above the path. */
  yMin: number;
  yMax: number;
  dead: boolean;
  seed: number;
}

interface KindSpec {
  halfWidth: number;
  halfDepth: number;
  yMin: number;
  yMax: number;
}

/**
 * Vertical extents decide how each obstacle must be handled: things that end
 * below jump height are jumpable, the branch starts above duck height, and the
 * rival dino is too tall for either — you have to change lane.
 */
const SPECS: Record<ObstacleKind, KindSpec> = {
  rock: { halfWidth: 0.72, halfDepth: 0.7, yMin: 0, yMax: 1.15 },
  log: { halfWidth: 0.95, halfDepth: 0.5, yMin: 0, yMax: 0.72 },
  branch: { halfWidth: 1.05, halfDepth: 0.42, yMin: 1.02, yMax: 3.2 },
  dino: { halfWidth: 0.78, halfDepth: 0.7, yMin: 0, yMax: 2.6 },
  lava: { halfWidth: 1.05, halfDepth: 2.2, yMin: 0, yMax: 0.42 },
};

/** Builds an obstacle covering the inclusive lane range `laneFrom..laneTo`. */
export function createObstacle(
  kind: ObstacleKind,
  laneFrom: number,
  laneTo: number,
  z: number,
): Obstacle {
  const spec = SPECS[kind];
  const centreLane = (laneFrom + laneTo) / 2;
  const spanHalf = (Math.abs(laneTo - laneFrom) / 2) * LANE_WIDTH;
  return {
    kind,
    worldX: centreLane * LANE_WIDTH,
    halfWidth: spanHalf + spec.halfWidth,
    z,
    halfDepth: spec.halfDepth,
    yMin: spec.yMin,
    yMax: spec.yMax,
    dead: false,
    seed: Math.random(),
  };
}

export function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle, time: number): void {
  if (o.kind === 'lava') {
    drawLava(ctx, o, time);
    return;
  }

  const p = project(o.worldX, 0, o.z);
  if (p.scale < 0.4) return;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.scale, p.scale);

  switch (o.kind) {
    case 'rock':
      drawRock(ctx, o);
      break;
    case 'log':
      drawLog(ctx, o);
      break;
    case 'branch':
      drawBranch(ctx, o, time);
      break;
    case 'dino':
      drawRivalDino(ctx, o, time);
      break;
  }

  ctx.restore();
}

function contactShadow(ctx: CanvasRenderingContext2D, halfWidth: number): void {
  ctx.save();
  ctx.globalAlpha = 0.16;
  fillEllipse(ctx, 0, 0, halfWidth * 0.95, 0.18, '#3b2a4a');
  ctx.restore();
}

function drawRock(ctx: CanvasRenderingContext2D, o: Obstacle): void {
  contactShadow(ctx, o.halfWidth);
  const w = o.halfWidth;

  fillEllipse(ctx, 0, -0.55, w * 0.92, 0.6, '#a79fb8');
  fillEllipse(ctx, -w * 0.3, -0.28, w * 0.5, 0.3, '#948ca8');
  fillEllipse(ctx, w * 0.28, -0.75, w * 0.55, 0.4, '#bdb5cc');
  fillEllipse(ctx, -w * 0.18, -0.85, w * 0.42, 0.3, '#cfc8db');

  // Moss caps to keep it friendly rather than menacing.
  ctx.save();
  ctx.globalAlpha = 0.85;
  fillEllipse(ctx, w * 0.1, -1.02, w * 0.35, 0.13, '#7cc596');
  fillEllipse(ctx, -w * 0.45, -0.5, w * 0.22, 0.1, '#7cc596');
  ctx.restore();
}

function drawLog(ctx: CanvasRenderingContext2D, o: Obstacle): void {
  contactShadow(ctx, o.halfWidth);
  const w = o.halfWidth;
  const h = 0.72;

  fillRoundRect(ctx, -w, -h, w * 2, h, 0.3, '#b98a5e');
  ctx.save();
  ctx.globalAlpha = 0.35;
  fillRoundRect(ctx, -w, -h * 0.42, w * 2, h * 0.42, 0.22, '#8f6642');
  ctx.restore();

  // Bark grooves.
  ctx.strokeStyle = 'rgba(120, 82, 52, 0.55)';
  ctx.lineWidth = 0.05;
  for (let i = -2; i <= 2; i++) {
    const x = (i / 2.4) * w;
    ctx.beginPath();
    ctx.moveTo(x, -h + 0.12);
    ctx.lineTo(x + 0.05, -0.1);
    ctx.stroke();
  }

  // Cut ends with growth rings.
  for (const side of [-1, 1]) {
    fillEllipse(ctx, side * w, -h / 2, 0.13, h / 2, '#d3a878');
    fillEllipse(ctx, side * w, -h / 2, 0.07, h / 3.2, '#c1935f');
  }

  // Moss along the top.
  ctx.save();
  ctx.globalAlpha = 0.9;
  fillEllipse(ctx, -w * 0.35, -h, w * 0.3, 0.11, '#7cc596');
  fillEllipse(ctx, w * 0.4, -h, w * 0.26, 0.1, '#8fd4a8');
  ctx.restore();
}

function drawBranch(ctx: CanvasRenderingContext2D, o: Obstacle, time: number): void {
  const w = o.halfWidth;
  const barY = -1.35;

  // Support trunks just outside the obstacle span.
  for (const side of [-1, 1]) {
    ctx.strokeStyle = '#a87a52';
    ctx.lineWidth = 0.22;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(side * (w + 0.25), 0);
    ctx.lineTo(side * (w + 0.18), barY - 0.1);
    ctx.stroke();
  }

  // The branch itself, sagging slightly in the middle.
  ctx.strokeStyle = '#b98a5e';
  ctx.lineWidth = 0.28;
  ctx.beginPath();
  ctx.moveTo(-(w + 0.2), barY - 0.08);
  ctx.quadraticCurveTo(0, barY + 0.16, w + 0.2, barY - 0.08);
  ctx.stroke();

  // Hanging vines with leaves, swaying gently.
  const vines = Math.max(3, Math.round(w * 2.2));
  for (let i = 0; i < vines; i++) {
    const t = vines === 1 ? 0.5 : i / (vines - 1);
    const x = -w + t * w * 2;
    const sway = Math.sin(time * 1.6 + i * 1.3) * 0.06;
    const length = 0.28 + ((i * 7) % 3) * 0.07;

    ctx.strokeStyle = '#5fb886';
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(x, barY + 0.1);
    ctx.quadraticCurveTo(x + sway, barY + 0.1 + length * 0.6, x + sway * 2, barY + 0.1 + length);
    ctx.stroke();
    fillEllipse(ctx, x + sway * 2, barY + 0.12 + length, 0.11, 0.07, '#6fc795');
  }

  // Leafy crown so the gap you must duck through is obvious.
  for (let i = 0; i < 7; i++) {
    const x = -w + (i / 6) * w * 2;
    fillEllipse(ctx, x, barY - 0.22, 0.26, 0.16, i % 2 === 0 ? '#57ae7d' : '#67bf8d');
  }
}

function drawRivalDino(ctx: CanvasRenderingContext2D, o: Obstacle, time: number): void {
  contactShadow(ctx, o.halfWidth * 0.8);
  const waddle = Math.sin(time * 4 + o.seed * 6) * 0.05;
  const body = '#e0885f';
  const bodyDark = '#c46f4b';
  const belly = '#f7c9a8';

  ctx.save();
  ctx.rotate(waddle * 0.25);

  // Tail sweeping to one side.
  for (let i = 8; i >= 0; i--) {
    const t = i / 8;
    const px = t * 0.6 * Math.sign(waddle || 1);
    const py = -1.05 + t * 0.55;
    fillCircle(ctx, px, py, 0.3 - t * 0.2, t > 0.5 ? bodyDark : body);
  }

  // Legs.
  for (const side of [-1, 1]) {
    ctx.strokeStyle = bodyDark;
    ctx.lineWidth = 0.26;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(side * 0.26, -0.8);
    ctx.lineTo(side * 0.3 + waddle * side * 2, -0.06);
    ctx.stroke();
  }

  fillEllipse(ctx, 0, -1.15 + waddle, 0.62, 0.68, body);
  ctx.save();
  ctx.globalAlpha = 0.5;
  fillEllipse(ctx, -0.28, -1.13 + waddle, 0.34, 0.6, bodyDark);
  ctx.restore();
  fillEllipse(ctx, 0, -0.75 + waddle, 0.3, 0.2, belly);

  // Back plates.
  for (let i = 0; i < 4; i++) {
    const y = -1.6 - i * 0.16 + waddle;
    const size = 0.2 - i * 0.03;
    fillPolygon(
      ctx,
      [
        [-size, y + size * 0.5],
        [0, y - size],
        [size, y + size * 0.5],
      ],
      '#f2a65a',
    );
  }

  // Head, turned just enough to show a grumpy eye.
  const headY = -2.15 + waddle;
  fillEllipse(ctx, 0.06, headY, 0.44, 0.42, body);
  fillEllipse(ctx, 0.36, headY + 0.08, 0.26, 0.18, '#eb9d74');
  fillEllipse(ctx, 0.2, headY - 0.08, 0.14, 0.15, '#ffffff');
  fillCircle(ctx, 0.24, headY - 0.06, 0.08, '#4a2a1a');
  // Frowning brow.
  ctx.strokeStyle = '#8f4f30';
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(0.1, headY - 0.24);
  ctx.lineTo(0.33, headY - 0.16);
  ctx.stroke();

  ctx.restore();
}

function drawLava(ctx: CanvasRenderingContext2D, o: Obstacle, time: number): void {
  const near = o.z - o.halfDepth;
  const far = o.z + o.halfDepth;
  if (far < 1) return;

  const nl = project(o.worldX - o.halfWidth, 0, Math.max(near, 0.8));
  const nr = project(o.worldX + o.halfWidth, 0, Math.max(near, 0.8));
  const fl = project(o.worldX - o.halfWidth, 0, far);
  const fr = project(o.worldX + o.halfWidth, 0, far);

  const corners: [number, number][] = [
    [fl.x, fl.y],
    [fr.x, fr.y],
    [nr.x, nr.y],
    [nl.x, nl.y],
  ];

  // Charred rim.
  fillPolygon(ctx, corners, '#5a4250');

  const inset = 0.86;
  const cx = (fl.x + fr.x + nl.x + nr.x) / 4;
  const cy = (fl.y + fr.y + nl.y + nr.y) / 4;
  const inner = corners.map(
    ([x, y]) => [cx + (x - cx) * inset, cy + (y - cy) * inset] as [number, number],
  );

  const pulse = 0.5 + Math.sin(time * 3 + o.seed * 6) * 0.5;
  const gradient = ctx.createLinearGradient(0, fl.y, 0, nl.y);
  gradient.addColorStop(0, '#ff7a3d');
  gradient.addColorStop(0.5, pulse > 0.5 ? '#ffd166' : '#ffb84d');
  gradient.addColorStop(1, '#ff6b35');

  ctx.beginPath();
  ctx.moveTo(inner[0][0], inner[0][1]);
  for (let i = 1; i < inner.length; i++) ctx.lineTo(inner[i][0], inner[i][1]);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Heat shimmer above the crack.
  ctx.save();
  ctx.globalAlpha = 0.25 + pulse * 0.15;
  fillEllipse(ctx, cx, cy - (nl.y - fl.y) * 0.3, (nr.x - nl.x) * 0.4, (nl.y - fl.y) * 0.5, '#ffb347');
  ctx.restore();
}
