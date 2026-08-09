import { HORIZON, VIEW } from '../core/config';
import { fillCircle, fillEllipse, fillPolygon } from './draw';

/** Stable pseudo-random value for a scenery index. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

const SKY_TOP = '#b8e6f5';
const SKY_MID = '#ffe9cf';
const SKY_HORIZON = '#ffd3b8';

/**
 * Draws the prehistoric backdrop: sky, sun, clouds, volcanoes, rolling hills
 * and a jungle tree line. Each layer scrolls at its own rate so the scene
 * gains depth as the player travels.
 */
export function drawBackground(ctx: CanvasRenderingContext2D, distance: number, time: number): void {
  drawSky(ctx);
  drawSun(ctx, time);
  drawClouds(ctx, distance);
  drawVolcanoes(ctx, distance, time);
  drawHills(ctx, distance);
  drawTreeLine(ctx, distance);
}

function drawSky(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, HORIZON + 40);
  gradient.addColorStop(0, SKY_TOP);
  gradient.addColorStop(0.62, SKY_MID);
  gradient.addColorStop(1, SKY_HORIZON);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW.W, HORIZON + 40);
}

function drawSun(ctx: CanvasRenderingContext2D, time: number): void {
  const cx = VIEW.W * 0.78;
  const cy = HORIZON - 150;
  const pulse = 1 + Math.sin(time * 0.8) * 0.03;

  ctx.save();
  ctx.globalAlpha = 0.35;
  fillCircle(ctx, cx, cy, 78 * pulse, '#fff2c4');
  ctx.globalAlpha = 0.55;
  fillCircle(ctx, cx, cy, 58 * pulse, '#ffe9a8');
  ctx.restore();
  fillCircle(ctx, cx, cy, 42, '#fff6d6');
}

function drawClouds(ctx: CanvasRenderingContext2D, distance: number): void {
  const scroll = distance * 0.6;
  const spacing = 330;
  ctx.save();
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < 8; i++) {
    const seed = hash(i * 3.7);
    const baseX = i * spacing - ((scroll * (0.4 + seed * 0.3)) % (spacing * 8));
    const x = ((baseX % (spacing * 8)) + spacing * 8) % (spacing * 8) - spacing;
    const y = 50 + seed * 130;
    const size = 26 + seed * 22;
    drawCloud(ctx, x, y, size);
  }
  ctx.restore();
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  fillEllipse(ctx, x, y, size * 1.5, size * 0.75, '#ffffff');
  fillEllipse(ctx, x - size * 0.9, y + size * 0.2, size * 0.85, size * 0.55, '#ffffff');
  fillEllipse(ctx, x + size * 0.95, y + size * 0.22, size * 0.8, size * 0.5, '#ffffff');
  fillEllipse(ctx, x + size * 0.15, y - size * 0.42, size * 0.8, size * 0.6, '#fdfdff');
}

function drawVolcanoes(ctx: CanvasRenderingContext2D, distance: number, time: number): void {
  const scroll = (distance * 1.6) % 1200;
  const volcanoes = [
    { x: 170, h: 190, w: 260, tone: '#9c8aad' },
    { x: 620, h: 240, w: 330, tone: '#8b7a9e' },
    { x: 1050, h: 165, w: 230, tone: '#a595b4' },
  ];

  for (const v of volcanoes) {
    for (let repeat = -1; repeat <= 1; repeat++) {
      const x = v.x - scroll + repeat * 1200;
      if (x < -400 || x > VIEW.W + 400) continue;
      drawVolcano(ctx, x, v.h, v.w, v.tone, time);
    }
  }
}

function drawVolcano(
  ctx: CanvasRenderingContext2D,
  cx: number,
  height: number,
  width: number,
  tone: string,
  time: number,
): void {
  const base = HORIZON + 12;
  const top = base - height;
  const craterHalf = width * 0.12;

  // Smoke plume, drawn behind the cone.
  ctx.save();
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 4; i++) {
    const drift = Math.sin(time * 0.5 + i) * 14;
    fillEllipse(ctx, cx + drift + i * 6, top - 26 - i * 30, 20 + i * 9, 14 + i * 6, '#d9d2e4');
  }
  ctx.restore();

  fillPolygon(
    ctx,
    [
      [cx - width / 2, base],
      [cx - craterHalf, top],
      [cx + craterHalf, top],
      [cx + width / 2, base],
    ],
    tone,
  );

  // Sunlit right flank.
  fillPolygon(
    ctx,
    [
      [cx + craterHalf, top],
      [cx + width / 2, base],
      [cx + width * 0.16, base],
    ],
    '#b4a4c4',
  );

  // Crater rim and lava spilling down the slope.
  fillEllipse(ctx, cx, top, craterHalf, craterHalf * 0.4, '#ff9d63');
  ctx.save();
  ctx.globalAlpha = 0.75;
  fillPolygon(
    ctx,
    [
      [cx - craterHalf * 0.5, top],
      [cx + craterHalf * 0.3, top],
      [cx + craterHalf * 0.9, top + height * 0.42],
      [cx + craterHalf * 0.1, top + height * 0.36],
    ],
    '#ff8b52',
  );
  ctx.restore();
}

function drawHills(ctx: CanvasRenderingContext2D, distance: number): void {
  const scroll = (distance * 3.2) % 520;
  ctx.fillStyle = '#a8dcc0';
  ctx.beginPath();
  ctx.moveTo(-100, HORIZON + 20);
  for (let x = -100; x <= VIEW.W + 100; x += 20) {
    const t = (x + scroll) * 0.012;
    const y = HORIZON - 34 - Math.sin(t) * 26 - Math.sin(t * 0.47) * 18;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(VIEW.W + 100, HORIZON + 20);
  ctx.closePath();
  ctx.fill();
}

function drawTreeLine(ctx: CanvasRenderingContext2D, distance: number): void {
  const scroll = (distance * 6) % 160;
  ctx.fillStyle = '#74c79b';
  ctx.fillRect(0, HORIZON - 4, VIEW.W, 26);

  for (let i = -1; i < VIEW.W / 80 + 2; i++) {
    const x = i * 80 - scroll;
    const seed = hash(i * 5.3);
    drawFernTree(ctx, x, HORIZON - 2, 22 + seed * 16, seed);
  }
}

/** A stylised tree-fern silhouette used along the horizon. */
function drawFernTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  height: number,
  seed: number,
): void {
  ctx.strokeStyle = '#5aab83';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.lineTo(x, groundY - height);
  ctx.stroke();

  const fronds = 5;
  for (let i = 0; i < fronds; i++) {
    const angle = -Math.PI / 2 + (i - (fronds - 1) / 2) * (0.55 + seed * 0.1);
    const length = height * (0.55 + seed * 0.25);
    fillEllipse(
      ctx,
      x + Math.cos(angle) * length * 0.5,
      groundY - height + Math.sin(angle) * length * 0.5,
      length * 0.5,
      height * 0.12,
      '#63b98d',
      angle,
    );
  }
}
