import { LANES, LANE_WIDTH, MAX_SPEED, SPAWN_Z, START_SPEED } from '../core/config';
import { chance, clamp, lerp, pick, randInt, randRange } from '../core/math';
import type { PowerUpKind } from '../core/types';
import { createEgg, type Egg } from '../entities/egg';
import { createObstacle, type Obstacle, type ObstacleKind } from '../entities/obstacle';
import { createPowerUp, type PowerUp } from '../entities/powerup';

export interface World {
  obstacles: Obstacle[];
  eggs: Egg[];
  powerUps: PowerUp[];
}

const POWERUP_KINDS: PowerUpKind[] = ['magnet', 'shield', 'boost', 'spring'];

/**
 * Places obstacle patterns, egg trails and power-ups ahead of the player.
 *
 * Spacing is expressed in *seconds of reaction time* rather than metres: as the
 * run speeds up the gaps grow in world space, so the game gets harder by
 * demanding quicker reactions instead of becoming physically impossible.
 */
export class Spawner {
  private untilPattern = 40;
  private untilEggs = 24;
  private untilPowerUp = 260;

  reset(): void {
    this.untilPattern = 40;
    this.untilEggs = 24;
    this.untilPowerUp = randRange(220, 320);
  }

  /** `travelled` is the distance covered since the previous frame. */
  update(travelled: number, speed: number, world: World): void {
    const difficulty = clamp((speed - START_SPEED) / (MAX_SPEED - START_SPEED), 0, 1);

    this.untilPattern -= travelled;
    this.untilEggs -= travelled;
    this.untilPowerUp -= travelled;

    if (this.untilPattern <= 0) {
      const freeLanes = this.spawnPattern(difficulty, world);
      const reactionTime = lerp(1.75, 1.05, difficulty);
      this.untilPattern = speed * reactionTime + randRange(0, speed * 0.35);
      if (chance(0.65)) this.spawnRewardEggs(freeLanes, world);
    }

    if (this.untilEggs <= 0) {
      this.spawnEggTrail(world);
      this.untilEggs = randRange(38, 76);
    }

    if (this.untilPowerUp <= 0) {
      this.spawnPowerUp(world);
      this.untilPowerUp = randRange(340, 560);
    }
  }

  /** Spawns one obstacle group and returns the lanes left passable. */
  private spawnPattern(difficulty: number, world: World): number[] {
    const z = SPAWN_Z;
    const patterns = this.availablePatterns(difficulty);
    const pattern = pick(patterns);

    switch (pattern) {
      case 'single': {
        const lane = pick(LANES);
        const kind = this.pickSingleKind(difficulty);
        world.obstacles.push(createObstacle(kind, lane, lane, z));
        // Low obstacles can still be cleared in their own lane.
        const passableInPlace = kind === 'log' || kind === 'branch';
        return passableInPlace ? [...LANES] : LANES.filter((l) => l !== lane);
      }

      case 'jumpAll': {
        world.obstacles.push(createObstacle('log', -1, 1, z));
        return [...LANES];
      }

      case 'duckAll': {
        world.obstacles.push(createObstacle('branch', -1, 1, z));
        return [...LANES];
      }

      case 'twoBlock': {
        const free = pick(LANES);
        for (const lane of LANES) {
          if (lane === free) continue;
          world.obstacles.push(createObstacle(chance(0.5) ? 'rock' : 'dino', lane, lane, z));
        }
        return [free];
      }

      case 'lavaPair': {
        const start = chance(0.5) ? -1 : 0;
        world.obstacles.push(createObstacle('lava', start, start + 1, z));
        return LANES.filter((l) => l < start || l > start + 1);
      }

      case 'mixed': {
        const free = pick(LANES);
        const others = LANES.filter((l) => l !== free);
        world.obstacles.push(createObstacle('dino', others[0], others[0], z));
        world.obstacles.push(createObstacle('rock', others[1], others[1], z));
        return [free];
      }

      case 'jumpThenDuck': {
        world.obstacles.push(createObstacle('log', -1, 1, z));
        world.obstacles.push(createObstacle('branch', -1, 1, z + 26));
        return [...LANES];
      }

      case 'duckIntoGap': {
        // Two lanes walled off, and the only way through is under a branch.
        const free = pick(LANES);
        for (const lane of LANES) {
          if (lane === free) continue;
          world.obstacles.push(createObstacle('rock', lane, lane, z));
        }
        world.obstacles.push(createObstacle('branch', free, free, z + 18));
        return [free];
      }

      default:
        return [...LANES];
    }
  }

  private availablePatterns(difficulty: number): string[] {
    const patterns = ['single', 'single', 'jumpAll', 'duckAll'];
    if (difficulty > 0.15) patterns.push('twoBlock', 'lavaPair');
    if (difficulty > 0.4) patterns.push('mixed', 'jumpThenDuck');
    if (difficulty > 0.65) patterns.push('duckIntoGap', 'twoBlock', 'mixed');
    return patterns;
  }

  private pickSingleKind(difficulty: number): ObstacleKind {
    const kinds: ObstacleKind[] = ['rock', 'log', 'branch'];
    if (difficulty > 0.25) kinds.push('dino');
    if (difficulty > 0.5) kinds.push('lava', 'rock');
    return pick(kinds);
  }

  /** A short payoff trail just past an obstacle group. */
  private spawnRewardEggs(freeLanes: number[], world: World): void {
    if (freeLanes.length === 0) return;
    const lane = pick(freeLanes);
    const count = randInt(4, 7);
    const startZ = SPAWN_Z + 9;
    const arc = chance(0.4);

    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const y = arc ? Math.sin(t * Math.PI) * 1.5 + 0.35 : 0.55;
      const z = startZ + i * 2.2;
      if (this.laneClear(world, lane, z, 1.6)) world.eggs.push(createEgg(lane, y, z));
    }
  }

  /** Filler eggs between obstacle groups, sometimes weaving between lanes. */
  private spawnEggTrail(world: World): void {
    const count = randInt(5, 9);
    const weave = chance(0.35);
    let lane = pick(LANES);
    const startZ = SPAWN_Z + randRange(4, 16);

    for (let i = 0; i < count; i++) {
      const z = startZ + i * 2.3;
      if (weave && i > 0 && i % 3 === 0) {
        lane = clamp(lane + (chance(0.5) ? 1 : -1), -1, 1);
      }
      if (this.laneClear(world, lane, z, 1.8)) {
        world.eggs.push(createEgg(lane, 0.55, z));
      }
    }
  }

  private spawnPowerUp(world: World): void {
    const kind = pick(POWERUP_KINDS);
    const candidates = LANES.filter((lane) => this.laneClear(world, lane, SPAWN_Z + 14, 3));
    if (candidates.length === 0) return;
    world.powerUps.push(createPowerUp(kind, pick(candidates), SPAWN_Z + 14));
  }

  /** True when nothing solid occupies this spot, so pickups stay reachable. */
  private laneClear(world: World, lane: number, z: number, margin: number): boolean {
    const x = lane * LANE_WIDTH;
    return !world.obstacles.some(
      (o) =>
        Math.abs(x - o.worldX) < o.halfWidth + 0.5 &&
        Math.abs(z - o.z) < o.halfDepth + margin,
    );
  }
}
