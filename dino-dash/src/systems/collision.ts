import { PLAYER_HALF_DEPTH, PLAYER_Z } from '../core/config';
import { rangesOverlap } from '../core/math';
import { EGG_RADIUS, type Egg } from '../entities/egg';
import type { Obstacle } from '../entities/obstacle';
import type { Player } from '../entities/player';
import { POWERUP_RADIUS, type PowerUp } from '../entities/powerup';

/**
 * Axis-aligned overlap in all three world axes. Using the player's
 * interpolated x means a lane change is judged on where the dino actually is,
 * not on which lane it is nominally heading for.
 */
export function hitsObstacle(player: Player, obstacle: Obstacle): boolean {
  const px = player.worldX;
  const hw = player.halfWidth;

  if (!rangesOverlap(px - hw, px + hw, obstacle.worldX - obstacle.halfWidth, obstacle.worldX + obstacle.halfWidth)) {
    return false;
  }
  if (
    !rangesOverlap(
      PLAYER_Z - PLAYER_HALF_DEPTH,
      PLAYER_Z + PLAYER_HALF_DEPTH,
      obstacle.z - obstacle.halfDepth,
      obstacle.z + obstacle.halfDepth,
    )
  ) {
    return false;
  }
  return rangesOverlap(player.y, player.y + player.height, obstacle.yMin, obstacle.yMax);
}

/** Pickups use a forgiving radius check so collecting feels generous. */
export function touchesEgg(player: Player, egg: Egg): boolean {
  return touchesPickup(player, egg.worldX, egg.y + EGG_RADIUS, egg.z, EGG_RADIUS);
}

export function touchesPowerUp(player: Player, powerUp: PowerUp): boolean {
  return touchesPickup(player, powerUp.worldX, powerUp.y, powerUp.z, POWERUP_RADIUS);
}

function touchesPickup(
  player: Player,
  x: number,
  y: number,
  z: number,
  radius: number,
): boolean {
  const centreY = player.y + player.height / 2;
  return (
    Math.abs(x - player.worldX) < player.halfWidth + radius + 0.35 &&
    Math.abs(z - PLAYER_Z) < PLAYER_HALF_DEPTH + radius + 0.7 &&
    Math.abs(y - centreY) < player.height / 2 + radius + 0.5
  );
}
