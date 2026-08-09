import { lerp } from '../core/math';
import { fillCircle, fillEllipse, fillPolygon } from '../render/draw';
import { resolveSkin, type ResolvedSkin, type Skin } from './skins';

export interface DinoPose {
  /** Run cycle phase in radians. */
  runPhase: number;
  /** 0 = upright, 1 = fully crouched. */
  duck: number;
  airborne: boolean;
  /** Lateral lean in -1..1 while switching lanes. */
  lean: number;
  /** Rotation applied on death, in radians. */
  spin: number;
  /** Seconds since the game started, for idle animation. */
  time: number;
}

/*
 * Body layout in world units, measured up from the feet. The silhouette is
 * built so each part stays readable at gameplay size: a small body sitting
 * high on visible legs, a thin neck separating body from head, and an
 * oversized head carrying the expression.
 */
const LEG_TOP = 0.4;
const BODY_Y = 0.6;
const BODY_RX = 0.39;
const BODY_RY = 0.28;
const NECK_BOTTOM = 0.78;
const HEAD_Y = 1.28;
const HEAD_RX = 0.33;
const HEAD_RY = 0.29;

/**
 * Draws the cartoon dino from behind — the runner's view. The head is turned
 * to the side so the snout, one big eye and the blush stay visible.
 *
 * `x`/`groundY` is where the feet touch the path, `scale` is pixels per world
 * unit at that depth.
 */
export function drawDino(
  ctx: CanvasRenderingContext2D,
  x: number,
  feetY: number,
  scale: number,
  pose: DinoPose,
  skin: Skin,
  /** Screen y of the path below the dino; differs from `feetY` mid-jump. */
  shadowY: number = feetY,
): void {
  const colors = resolveSkin(skin, pose.time);
  // The head keeps a standing three-quarter turn so the snout, eye and blush
  // stay visible from behind; leaning into a lane change turns it further.
  const turn = 0.58 + Math.sin(pose.time * 0.7) * 0.24 + pose.lean * 0.9;
  const turnDir = Math.max(-1, Math.min(1, turn));

  drawShadow(ctx, x, shadowY, scale, Math.max(0, (shadowY - feetY) / scale));

  ctx.save();
  ctx.translate(x, feetY);
  ctx.scale(scale, scale);
  if (pose.spin !== 0) ctx.rotate(pose.spin);
  ctx.rotate(pose.lean * 0.14);
  ctx.scale(lerp(1, 1.24, pose.duck), lerp(1, 0.56, pose.duck));

  if (colors.glow) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    fillEllipse(ctx, 0, -0.8, 0.66, 0.92, colors.spike);
    ctx.restore();
  }

  const bob = pose.airborne ? 0.03 : Math.sin(pose.runPhase * 2) * 0.026;

  drawTail(ctx, pose, colors);
  drawLegs(ctx, pose, colors);
  drawBody(ctx, bob, colors);
  drawArms(ctx, pose, bob, colors);
  drawHead(ctx, pose, bob, turnDir, colors);

  ctx.restore();
}

/** Contact shadow, kept on the path and shrinking as the dino rises. */
function drawShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  scale: number,
  heightAboveGround: number,
): void {
  const shrink = 1 / (1 + heightAboveGround * 0.6);
  ctx.save();
  ctx.globalAlpha = 0.1 + 0.14 * shrink;
  fillEllipse(ctx, x, groundY, 0.46 * scale * shrink, 0.15 * scale * shrink, '#3b2a4a');
  ctx.restore();
}

/** Thin dark edge that keeps shapes legible against the bright background. */
function outline(ctx: CanvasRenderingContext2D, colors: ResolvedSkin): void {
  ctx.strokeStyle = colors.bodyDark;
  ctx.lineWidth = 0.045;
  ctx.stroke();
}

function drawTail(ctx: CanvasRenderingContext2D, pose: DinoPose, colors: ResolvedSkin): void {
  // The tail rests to one side so it never collapses into the silhouette.
  const wag = Math.sin(pose.runPhase) * 0.13;
  const lift = pose.airborne ? 0.14 : 0;

  // Curls out to the left and up, like a happy raised tail.
  const baseX = 0;
  const baseY = -(BODY_Y - 0.02);
  const ctrlX = -0.42;
  const ctrlY = -(BODY_Y - 0.06 + wag);
  const tipX = -0.6 + wag * 0.4;
  const tipY = -(BODY_Y + 0.24 + wag * 1.2 + lift);

  const segments = 10;
  for (let i = segments; i >= 0; i--) {
    const t = i / segments;
    const mt = 1 - t;
    const px = mt * mt * baseX + 2 * mt * t * ctrlX + t * t * tipX;
    const py = mt * mt * baseY + 2 * mt * t * ctrlY + t * t * tipY;
    fillCircle(ctx, px, py, lerp(0.21, 0.075, t), t > 0.45 ? colors.bodyDark : colors.body);

    // A few plates riding along the tail.
    if (i === 4 || i === 6 || i === 8) {
      const size = lerp(0.1, 0.055, t);
      fillPolygon(
        ctx,
        [
          [px - size, py + size * 0.4],
          [px - size * 0.3, py - size * 1.3],
          [px + size * 0.6, py],
        ],
        colors.spike,
      );
    }
  }
}

function drawLegs(ctx: CanvasRenderingContext2D, pose: DinoPose, colors: ResolvedSkin): void {
  for (const side of [-1, 1]) {
    const phase = pose.runPhase + (side > 0 ? Math.PI : 0);
    let footX: number;
    let footY: number;

    if (pose.airborne) {
      // Legs tuck up and slightly apart mid-jump.
      footX = side * 0.26;
      footY = -0.3;
    } else if (pose.duck > 0.5) {
      // Sliding: legs stretch out behind.
      footX = side * 0.34;
      footY = -0.04;
    } else {
      footX = side * 0.17 + Math.sin(phase) * 0.19;
      footY = -Math.max(0, Math.sin(phase)) * 0.22;
    }

    const hipX = side * 0.16;
    const hipY = -LEG_TOP;

    ctx.strokeStyle = side < 0 ? colors.bodyDark : colors.body;
    ctx.lineWidth = 0.18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.quadraticCurveTo(hipX + (footX - hipX) * 0.35, hipY + 0.18, footX, footY);
    ctx.stroke();

    // Three-toed foot.
    fillEllipse(ctx, footX + side * 0.05, footY, 0.15, 0.075, colors.bodyDark);
    fillEllipse(ctx, footX + side * 0.12, footY - 0.01, 0.055, 0.045, colors.bodyLight);
  }
}

function drawBody(ctx: CanvasRenderingContext2D, bob: number, colors: ResolvedSkin): void {
  const cy = -BODY_Y - bob;

  ctx.beginPath();
  ctx.ellipse(0, cy, BODY_RX, BODY_RY, 0, 0, Math.PI * 2);
  ctx.fillStyle = colors.body;
  ctx.fill();
  outline(ctx, colors);

  // Shaded left flank and a lit rim on the right read as roundness.
  ctx.save();
  ctx.globalAlpha = 0.5;
  fillEllipse(ctx, -BODY_RX * 0.45, cy + 0.02, BODY_RX * 0.5, BODY_RY * 0.85, colors.bodyDark);
  ctx.globalAlpha = 0.45;
  fillEllipse(ctx, BODY_RX * 0.42, cy - 0.07, BODY_RX * 0.36, BODY_RY * 0.6, colors.bodyLight);
  ctx.restore();

  // Rump patch in the belly colour.
  fillEllipse(ctx, 0, cy + BODY_RY * 0.55, 0.19, 0.11, colors.belly);
}

function drawArms(
  ctx: CanvasRenderingContext2D,
  pose: DinoPose,
  bob: number,
  colors: ResolvedSkin,
): void {
  for (const side of [-1, 1]) {
    const phase = pose.runPhase + (side > 0 ? 0 : Math.PI);
    const swing = pose.airborne ? -0.14 : Math.sin(phase) * 0.08;
    const shoulderX = side * 0.28;
    const shoulderY = -BODY_Y - 0.08 - bob;
    const handX = side * 0.46;
    const handY = shoulderY + 0.13 + swing;

    ctx.strokeStyle = side < 0 ? colors.bodyDark : colors.body;
    ctx.lineWidth = 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(handX, handY);
    ctx.stroke();
    fillCircle(ctx, handX, handY, 0.07, colors.bodyLight);
  }
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  pose: DinoPose,
  bob: number,
  turnDir: number,
  colors: ResolvedSkin,
): void {
  const cx = turnDir * 0.06;
  const cy = -HEAD_Y - bob * 1.4;

  // Neck, drawn first so the body and head overlap its ends.
  ctx.strokeStyle = colors.bodyDark;
  ctx.lineWidth = 0.19;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -NECK_BOTTOM);
  ctx.lineTo(cx, cy + HEAD_RY * 0.7);
  ctx.stroke();

  // Snout sits behind the skull so the head reads as a three-quarter turn. It
  // has to reach well past the head radius to stay visible.
  const snoutX = cx + turnDir * 0.41;
  ctx.beginPath();
  ctx.ellipse(snoutX, cy + 0.04, 0.23, 0.165, 0, 0, Math.PI * 2);
  ctx.fillStyle = colors.bodyLight;
  ctx.fill();
  outline(ctx, colors);
  fillCircle(ctx, snoutX + turnDir * 0.14, cy - 0.02, 0.036, colors.bodyDark);
  // Little smile.
  ctx.strokeStyle = colors.bodyDark;
  ctx.lineWidth = 0.034;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(snoutX, cy + 0.07, 0.1, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(cx, cy, HEAD_RX, HEAD_RY, 0, 0, Math.PI * 2);
  ctx.fillStyle = colors.body;
  ctx.fill();
  outline(ctx, colors);

  ctx.save();
  ctx.globalAlpha = 0.35;
  fillEllipse(ctx, cx - turnDir * 0.16, cy + 0.03, 0.17, HEAD_RY * 0.85, colors.bodyDark);
  ctx.restore();

  // Two horn bumps on top.
  fillCircle(ctx, cx - 0.13, cy - HEAD_RY * 0.86, 0.075, colors.spike);
  fillCircle(ctx, cx + 0.13, cy - HEAD_RY * 0.86, 0.075, colors.spike);

  // The big eye on the side the head is turned towards.
  const eyeX = cx + turnDir * 0.15;
  const eyeY = cy - 0.03;
  const blink = Math.sin(pose.time * 1.7) > 0.985 ? 0.15 : 1;
  fillEllipse(ctx, eyeX, eyeY, 0.135, 0.15, '#ffffff');
  fillEllipse(ctx, eyeX + turnDir * 0.04, eyeY + 0.01, 0.075, 0.085 * blink, colors.pupil);
  fillCircle(ctx, eyeX + turnDir * 0.07, eyeY - 0.045, 0.032, '#ffffff');

  // Blush below the eye.
  ctx.save();
  ctx.globalAlpha = 0.55;
  fillEllipse(ctx, eyeX + turnDir * 0.03, eyeY + 0.17, 0.085, 0.05, colors.blush);
  ctx.restore();
}
