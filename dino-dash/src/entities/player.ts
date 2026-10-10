import {
  DOUBLE_JUMP_VELOCITY,
  DUCK_DURATION,
  GRAVITY,
  JUMP_VELOCITY,
  LANE_CHANGE_DURATION,
  LANE_WIDTH,
  PLAYER_DUCK_HEIGHT,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
} from '../core/config';
import { clamp, easeInOut } from '../core/math';
import { drawDino, type DinoPose } from '../assets/dino';
import type { Skin } from '../assets/skins';

export class Player {
  lane = 0;
  private fromLane = 0;
  private laneProgress = 1;
  /** Height above the path in world units. */
  y = 0;
  vy = 0;
  jumpsUsed = 0;
  duckTimer = 0;
  runPhase = 0;
  spin = 0;
  crashed = false;

  reset(): void {
    this.lane = 0;
    this.fromLane = 0;
    this.laneProgress = 1;
    this.y = 0;
    this.vy = 0;
    this.jumpsUsed = 0;
    this.duckTimer = 0;
    this.runPhase = 0;
    this.spin = 0;
    this.crashed = false;
  }

  get airborne(): boolean {
    return this.y > 0.001;
  }

  get ducking(): boolean {
    return this.duckTimer > 0 && !this.airborne;
  }

  /** 0 while upright, 1 while fully crouched, eased at both ends. */
  get duckAmount(): number {
    if (!this.ducking) return 0;
    const elapsed = DUCK_DURATION - this.duckTimer;
    const fadeIn = clamp(elapsed / 0.09, 0, 1);
    const fadeOut = clamp(this.duckTimer / 0.12, 0, 1);
    return Math.min(fadeIn, fadeOut);
  }

  get height(): number {
    return this.ducking ? PLAYER_DUCK_HEIGHT : PLAYER_HEIGHT;
  }

  /** Interpolated lateral position, so collisions are fair mid-switch. */
  get worldX(): number {
    const t = easeInOut(clamp(this.laneProgress, 0, 1));
    return (this.fromLane + (this.lane - this.fromLane) * t) * LANE_WIDTH;
  }

  /** -1..1, used to lean the dino into a lane change. */
  get lean(): number {
    if (this.laneProgress >= 1) return 0;
    const direction = Math.sign(this.lane - this.fromLane);
    return direction * Math.sin(this.laneProgress * Math.PI);
  }

  get halfWidth(): number {
    return PLAYER_HALF_WIDTH;
  }

  moveLane(direction: number): boolean {
    const target = clamp(this.lane + direction, -1, 1);
    if (target === this.lane) return false;
    this.fromLane = this.lane;
    this.lane = target;
    this.laneProgress = 0;
    return true;
  }

  /**
   * Starts a jump. Returns the kind of jump performed, or null when the
   * player is already out of jumps.
   */
  jump(springActive: boolean): 'single' | 'double' | null {
    if (!this.airborne && this.jumpsUsed === 0) {
      this.vy = JUMP_VELOCITY;
      this.jumpsUsed = 1;
      this.duckTimer = 0;
      return 'single';
    }
    if (springActive && this.jumpsUsed === 1) {
      this.vy = DOUBLE_JUMP_VELOCITY;
      this.jumpsUsed = 2;
      return 'double';
    }
    return null;
  }

  duck(): boolean {
    if (this.airborne) {
      // Slam back down so ducking feels responsive from the air.
      this.vy = Math.min(this.vy, -14);
      this.duckTimer = DUCK_DURATION;
      return false;
    }
    const wasDucking = this.duckTimer > 0;
    this.duckTimer = DUCK_DURATION;
    return !wasDucking;
  }

  update(dt: number, speed: number): void {
    if (this.laneProgress < 1) {
      this.laneProgress = Math.min(1, this.laneProgress + dt / LANE_CHANGE_DURATION);
    }

    if (this.airborne || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.jumpsUsed = 0;
      }
    }

    if (this.duckTimer > 0) this.duckTimer = Math.max(0, this.duckTimer - dt);

    // The run cycle speeds up with the world.
    if (!this.airborne) this.runPhase += dt * speed * 0.85;

    if (this.crashed) this.spin += dt * 6;
  }

  pose(time: number): DinoPose {
    return {
      runPhase: this.runPhase,
      duck: this.duckAmount,
      airborne: this.airborne,
      lean: this.lean,
      spin: this.spin,
      time,
    };
  }

  draw(
    ctx: CanvasRenderingContext2D,
    screenX: number,
    feetY: number,
    scale: number,
    skin: Skin,
    time: number,
    shadowY: number,
  ): void {
    drawDino(ctx, screenX, feetY, scale, this.pose(time), skin, shadowY);
  }
}
