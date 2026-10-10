import { VIEW } from '../core/config';
import type { PowerUpKind } from '../core/types';
import { POWERUP_COLOR, POWERUP_LABEL } from '../entities/powerup';
import { drawText, fillEllipse, fillRoundRect } from './draw';
import { INK } from './ui';

export interface ActiveTimer {
  kind: PowerUpKind;
  remaining: number;
  duration: number;
}

export interface HudState {
  score: number;
  distance: number;
  eggs: number;
  highScore: number;
  speed: number;
  timers: ActiveTimer[];
  newRecord: boolean;
}

export function drawHud(ctx: CanvasRenderingContext2D, state: HudState, time: number): void {
  drawScoreBlock(ctx, state, time);
  drawEggCounter(ctx, state.eggs);
  drawTimers(ctx, state.timers);
  drawSpeedBar(ctx, state.speed);
}

function drawScoreBlock(ctx: CanvasRenderingContext2D, state: HudState, time: number): void {
  fillRoundRect(ctx, 16, 14, 210, 74, 18, 'rgba(255, 250, 242, 0.82)');

  drawText(ctx, formatNumber(Math.floor(state.score)), 32, 40, {
    size: 32,
    align: 'left',
    color: INK,
  });
  drawText(ctx, `${Math.floor(state.distance)} m`, 32, 70, {
    size: 18,
    align: 'left',
    color: '#8a7a9a',
  });

  if (state.newRecord) {
    const pulse = 0.7 + Math.sin(time * 6) * 0.3;
    ctx.save();
    ctx.globalAlpha = pulse;
    drawText(ctx, 'NEUER REKORD!', 32, 104, {
      size: 17,
      align: 'left',
      color: '#ff7f9c',
      outline: '#ffffff',
      outlineWidth: 3,
    });
    ctx.restore();
  } else {
    drawText(ctx, `Rekord ${formatNumber(state.highScore)}`, 32, 104, {
      size: 15,
      align: 'left',
      color: 'rgba(74, 53, 89, 0.7)',
      outline: 'rgba(255,255,255,0.75)',
      outlineWidth: 3,
    });
  }
}

function drawEggCounter(ctx: CanvasRenderingContext2D, eggs: number): void {
  const w = 128;
  const x = VIEW.W - w - 16;
  fillRoundRect(ctx, x, 14, w, 46, 23, 'rgba(255, 250, 242, 0.82)');
  drawEggIcon(ctx, x + 28, 37, 13);
  drawText(ctx, formatNumber(eggs), x + 50, 38, { size: 24, align: 'left', color: INK });
}

export function drawEggIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  fillEllipse(ctx, cx, cy, r * 0.78, r, '#f5c542');
  fillEllipse(ctx, cx - r * 0.16, cy + r * 0.12, r * 0.55, r * 0.7, '#ffd766');
  fillEllipse(ctx, cx + r * 0.2, cy - r * 0.32, r * 0.22, r * 0.3, '#fff3c4');
}

function drawTimers(ctx: CanvasRenderingContext2D, timers: ActiveTimer[]): void {
  timers.forEach((timer, index) => {
    const y = 130 + index * 40;
    const w = 168;
    const color = POWERUP_COLOR[timer.kind];

    fillRoundRect(ctx, 16, y, w, 30, 15, 'rgba(255, 250, 242, 0.85)');
    const progress = Math.max(0, timer.remaining / timer.duration);
    fillRoundRect(ctx, 20, y + 4, (w - 8) * progress, 22, 11, color);
    // Dark text with a light halo stays readable over both the filled and the
    // drained part of the bar.
    drawText(ctx, `${POWERUP_LABEL[timer.kind]}  ${timer.remaining.toFixed(1)}s`, 16 + w / 2, y + 15, {
      size: 14,
      color: INK,
      outline: 'rgba(255, 250, 242, 0.85)',
      outlineWidth: 3,
    });
  });
}

function drawSpeedBar(ctx: CanvasRenderingContext2D, normalisedSpeed: number): void {
  const w = 128;
  const x = VIEW.W - w - 16;
  const y = 70;
  fillRoundRect(ctx, x, y, w, 14, 7, 'rgba(255, 250, 242, 0.7)');
  fillRoundRect(ctx, x + 2, y + 2, (w - 4) * normalisedSpeed, 10, 5, '#ff9f68');
}

export function formatNumber(value: number): string {
  return value.toLocaleString('de-CH');
}
