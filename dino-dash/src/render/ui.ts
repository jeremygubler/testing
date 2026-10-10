import { drawText, fillRoundRect, roundRect, shade } from './draw';

export interface Button {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sublabel?: string;
  color?: string;
  disabled?: boolean;
}

export const PANEL_BG = 'rgba(255, 250, 242, 0.94)';
export const INK = '#4a3559';

/** Rounded card used as the backdrop for menus and dialogs. */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 26,
): void {
  ctx.save();
  ctx.shadowColor = 'rgba(59, 42, 74, 0.28)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 8;
  fillRoundRect(ctx, x, y, w, h, radius, PANEL_BG);
  ctx.restore();
}

export function drawButton(ctx: CanvasRenderingContext2D, button: Button): void {
  const color = button.color ?? '#ffb35c';
  const base = button.disabled ? '#cfc7d6' : color;
  const lip = 5;

  // Darker slab underneath gives the button a chunky, tappable look.
  fillRoundRect(ctx, button.x, button.y + lip, button.w, button.h, 16, shade(base, 0.28));
  fillRoundRect(ctx, button.x, button.y, button.w, button.h, 16, base);

  ctx.save();
  ctx.globalAlpha = 0.28;
  roundRect(ctx, button.x + 6, button.y + 5, button.w - 12, button.h * 0.36, 10);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  const centreY = button.sublabel ? button.y + button.h * 0.38 : button.y + button.h / 2;
  drawText(ctx, button.label, button.x + button.w / 2, centreY, {
    size: Math.min(26, button.h * 0.42),
    color: '#ffffff',
    outline: shade(base, 0.4),
    outlineWidth: 3,
  });

  if (button.sublabel) {
    drawText(ctx, button.sublabel, button.x + button.w / 2, button.y + button.h * 0.72, {
      size: 14,
      color: '#ffffff',
      weight: 'bold',
      outline: shade(base, 0.4),
      outlineWidth: 2.5,
    });
  }
}

export function hitButton(buttons: Button[], x: number, y: number): Button | null {
  for (const button of buttons) {
    if (button.disabled) continue;
    if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) {
      return button;
    }
  }
  return null;
}

/** Small pill used for counters such as the egg total. */
export function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  color: string,
): void {
  fillRoundRect(ctx, x, y, w, h, h / 2, color);
  drawText(ctx, text, x + w / 2, y + h / 2, { size: h * 0.5, color: INK });
}
