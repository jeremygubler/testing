import { DESPAWN_Z, HORIZON, LANE_WIDTH, PATH_HALF_WIDTH, SPAWN_Z, VIEW } from '../core/config';
import { project } from './camera';
import { fillEllipse, fillPolygon } from './draw';

const BAND_LENGTH = 4;
const GROUND_GREEN = '#8fd4a8';
const GROUND_GREEN_DARK = '#7cc596';
const PATH_LIGHT = '#eccfa6';
const PATH_DARK = '#e0be92';
const PATH_EDGE = '#c9a179';

function hash(n: number): number {
  const x = Math.sin(n * 91.7) * 27183.1234;
  return x - Math.floor(x);
}

/**
 * Draws the jungle floor and the stone path, then the scenery that lines it.
 * Bands are laid out in world space and offset by the travelled distance, so
 * the ground appears to rush towards the camera.
 */
export function drawPath(ctx: CanvasRenderingContext2D, distance: number): void {
  drawGroundPlane(ctx);
  drawPathBands(ctx, distance);
  drawLaneSeams(ctx, distance);
  drawScenery(ctx, distance);
}

function drawGroundPlane(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createLinearGradient(0, HORIZON, 0, VIEW.H);
  gradient.addColorStop(0, GROUND_GREEN_DARK);
  gradient.addColorStop(1, GROUND_GREEN);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, HORIZON, VIEW.W, VIEW.H - HORIZON);
}

function drawPathBands(ctx: CanvasRenderingContext2D, distance: number): void {
  const offset = distance % BAND_LENGTH;
  // Far bands first so nearer ones paint over them.
  for (let z = SPAWN_Z; z > DESPAWN_Z; z -= BAND_LENGTH) {
    const near = z - offset;
    const far = near + BAND_LENGTH;
    if (near <= DESPAWN_Z * 0.5) continue;

    const index = Math.round((distance - near) / BAND_LENGTH);
    const color = index % 2 === 0 ? PATH_LIGHT : PATH_DARK;

    const nl = project(-PATH_HALF_WIDTH, 0, near);
    const nr = project(PATH_HALF_WIDTH, 0, near);
    const fl = project(-PATH_HALF_WIDTH, 0, far);
    const fr = project(PATH_HALF_WIDTH, 0, far);

    fillPolygon(
      ctx,
      [
        [fl.x, fl.y],
        [fr.x, fr.y],
        [nr.x, nr.y],
        [nl.x, nl.y],
      ],
      color,
    );

    // Soft dirt shoulders on both sides of the path.
    const shoulder = 0.55;
    const nlo = project(-PATH_HALF_WIDTH - shoulder, 0, near);
    const flo = project(-PATH_HALF_WIDTH - shoulder, 0, far);
    const nro = project(PATH_HALF_WIDTH + shoulder, 0, near);
    const fro = project(PATH_HALF_WIDTH + shoulder, 0, far);
    fillPolygon(
      ctx,
      [
        [flo.x, flo.y],
        [fl.x, fl.y],
        [nl.x, nl.y],
        [nlo.x, nlo.y],
      ],
      PATH_EDGE,
    );
    fillPolygon(
      ctx,
      [
        [fr.x, fr.y],
        [fro.x, fro.y],
        [nro.x, nro.y],
        [nr.x, nr.y],
      ],
      PATH_EDGE,
    );
  }
}

/** Dashed seams between the three lanes. */
function drawLaneSeams(ctx: CanvasRenderingContext2D, distance: number): void {
  const dashLength = 2.2;
  const gap = 2.2;
  const period = dashLength + gap;
  const offset = distance % period;

  ctx.save();
  ctx.globalAlpha = 0.35;
  for (const seam of [-0.5, 0.5]) {
    const worldX = seam * LANE_WIDTH;
    for (let z = SPAWN_Z; z > DESPAWN_Z; z -= period) {
      const near = z - offset;
      const far = near + dashLength;
      if (near <= DESPAWN_Z * 0.5) continue;
      const nl = project(worldX - 0.06, 0.01, near);
      const nr = project(worldX + 0.06, 0.01, near);
      const fl = project(worldX - 0.06, 0.01, far);
      const fr = project(worldX + 0.06, 0.01, far);
      fillPolygon(
        ctx,
        [
          [fl.x, fl.y],
          [fr.x, fr.y],
          [nr.x, nr.y],
          [nl.x, nl.y],
        ],
        '#ffffff',
      );
    }
  }
  ctx.restore();
}

/** Ferns, boulders and palms scattered along both shoulders. */
function drawScenery(ctx: CanvasRenderingContext2D, distance: number): void {
  const spacing = 7;
  const first = Math.floor((distance + DESPAWN_Z) / spacing);
  const count = Math.ceil((SPAWN_Z - DESPAWN_Z) / spacing);

  type Prop = { x: number; z: number; seed: number };
  const props: Prop[] = [];

  for (let i = count; i >= 0; i--) {
    const index = first + i;
    const z = index * spacing - distance;
    if (z <= DESPAWN_Z * 0.6 || z > SPAWN_Z) continue;
    for (const side of [-1, 1]) {
      const seed = hash(index * 2.7 + (side > 0 ? 0.31 : 0.83));
      if (seed < 0.25) continue;
      const x = side * (PATH_HALF_WIDTH + 1.1 + seed * 3.4);
      props.push({ x, z, seed });
    }
  }

  props.sort((a, b) => b.z - a.z);
  for (const prop of props) {
    const p = project(prop.x, 0, prop.z);
    if (p.scale < 0.6) continue;
    if (prop.seed > 0.78) drawBoulder(ctx, p.x, p.y, p.scale, prop.seed);
    else if (prop.seed > 0.5) drawPalm(ctx, p.x, p.y, p.scale, prop.seed);
    else drawFern(ctx, p.x, p.y, p.scale, prop.seed);
  }
}

function drawFern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  seed: number,
): void {
  const height = (0.9 + seed * 0.7) * scale;
  const leaves = 6;
  for (let i = 0; i < leaves; i++) {
    const angle = -Math.PI / 2 + (i - (leaves - 1) / 2) * 0.42;
    const length = height * (0.7 + ((i * 7 + seed * 13) % 3) * 0.08);
    fillEllipse(
      ctx,
      x + Math.cos(angle) * length * 0.5,
      y + Math.sin(angle) * length * 0.5,
      length * 0.5,
      height * 0.13,
      i % 2 === 0 ? '#5fb886' : '#6fc795',
      angle,
    );
  }
  fillEllipse(ctx, x, y, height * 0.22, height * 0.08, '#4e9c70');
}

function drawPalm(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  seed: number,
): void {
  const height = (2.4 + seed * 1.8) * scale;
  const lean = (seed - 0.5) * height * 0.22;

  ctx.strokeStyle = '#b9895e';
  ctx.lineWidth = Math.max(2, height * 0.07);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + lean * 0.4, y - height * 0.6, x + lean, y - height);
  ctx.stroke();

  const topX = x + lean;
  const topY = y - height;
  const fronds = 6;
  for (let i = 0; i < fronds; i++) {
    const angle = -Math.PI / 2 + (i - (fronds - 1) / 2) * 0.5;
    const length = height * 0.5;
    fillEllipse(
      ctx,
      topX + Math.cos(angle) * length * 0.55,
      topY + Math.sin(angle) * length * 0.55,
      length * 0.55,
      height * 0.09,
      i % 2 === 0 ? '#57ae7d' : '#67bf8d',
      angle,
    );
  }
}

function drawBoulder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  seed: number,
): void {
  const size = (0.6 + seed * 0.6) * scale;
  fillEllipse(ctx, x, y - size * 0.05, size * 0.95, size * 0.3, 'rgba(0,0,0,0.12)');
  fillEllipse(ctx, x, y - size * 0.45, size * 0.9, size * 0.55, '#b9b2c4');
  fillEllipse(ctx, x - size * 0.2, y - size * 0.6, size * 0.5, size * 0.3, '#cdc7d6');
}
