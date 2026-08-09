/** Small canvas helpers shared by every drawing routine. */

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

export function fillEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  rotation = 0,
): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), rotation, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function fillCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, Math.abs(r), 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function fillPolygon(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  color: string,
): void {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    size?: number;
    color?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    weight?: string;
    outline?: string;
    outlineWidth?: number;
  } = {},
): void {
  const {
    size = 20,
    color = '#3b2a4a',
    align = 'center',
    baseline = 'middle',
    weight = 'bold',
    outline,
    outlineWidth = 4,
  } = options;

  ctx.font = `${weight} ${size}px "Trebuchet MS", "Comic Sans MS", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (outline) {
    ctx.lineWidth = outlineWidth;
    ctx.strokeStyle = outline;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Mixes two `#rrggbb` colours. */
export function mixColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const to = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${to(ar + (br - ar) * t)}${to(ag + (bg - ag) * t)}${to(ab + (bb - ab) * t)}`;
}

/** Darkens a `#rrggbb` colour towards black. */
export function shade(color: string, amount: number): string {
  return mixColor(color, '#000000', amount);
}

/** Lightens a `#rrggbb` colour towards white. */
export function tint(color: string, amount: number): string {
  return mixColor(color, '#ffffff', amount);
}
