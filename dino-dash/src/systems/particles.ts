import { randRange } from '../core/math';
import { fillCircle } from '../render/draw';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  star: boolean;
}

/**
 * Screen-space particle pool for dust, sparkles and impact bursts. Keeping
 * particles in 2D avoids re-projecting them every frame.
 */
export class Particles {
  private items: Particle[] = [];

  clear(): void {
    this.items.length = 0;
  }

  private add(p: Particle): void {
    // Hard cap keeps the draw cost bounded during power-up frenzies.
    if (this.items.length > 320) this.items.shift();
    this.items.push(p);
  }

  /** Puffs of dirt kicked up by footfalls and landings. */
  dust(x: number, y: number, amount: number, scale = 1): void {
    for (let i = 0; i < amount; i++) {
      this.add({
        x: x + randRange(-8, 8) * scale,
        y: y + randRange(-3, 3) * scale,
        vx: randRange(-40, 40) * scale,
        vy: randRange(-70, -15) * scale,
        life: randRange(0.3, 0.6),
        maxLife: 0.6,
        size: randRange(3, 7) * scale,
        color: '#e5d3b3',
        gravity: 190,
        star: false,
      });
    }
  }

  sparkle(x: number, y: number, amount: number, color: string, spread = 90): void {
    for (let i = 0; i < amount; i++) {
      const angle = randRange(0, Math.PI * 2);
      const speed = randRange(spread * 0.3, spread);
      this.add({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life: randRange(0.35, 0.7),
        maxLife: 0.7,
        size: randRange(2.5, 5.5),
        color,
        gravity: 60,
        star: true,
      });
    }
  }

  burst(x: number, y: number, amount: number, color: string): void {
    for (let i = 0; i < amount; i++) {
      const angle = randRange(0, Math.PI * 2);
      const speed = randRange(60, 240);
      this.add({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: randRange(0.4, 0.9),
        maxLife: 0.9,
        size: randRange(3, 8),
        color,
        gravity: 280,
        star: false,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const p of this.items) {
      const alpha = Math.min(1, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      if (p.star) drawStar(ctx, p.x, p.y, p.size * alpha, p.color);
      else fillCircle(ctx, p.x, p.y, p.size * alpha, p.color);
    }
    ctx.restore();
  }
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const radius = i % 2 === 0 ? size : size * 0.42;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
