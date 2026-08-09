/**
 * Central tuning values. World units are metres; the camera looks down the
 * positive z axis, y points up from the path surface, x is lateral.
 */

export const VIEW = { W: 960, H: 600 };

/** Perspective focal length in pixels. */
export const FOCAL = 540;
/** Vertical position of the horizon as a fraction of the view height. */
export const HORIZON = VIEW.H * 0.4;
/** Camera height above the path surface. */
export const EYE_HEIGHT = 2.6;

/** Lateral spacing between lane centres. */
export const LANE_WIDTH = 2.2;
/** Lane index -1 / 0 / 1 mapped to world x. */
export const LANES = [-1, 0, 1];
/** Half width of the visible path, used for the ground quad and scenery. */
export const PATH_HALF_WIDTH = LANE_WIDTH * 1.5 + 0.5;

/** Distance of the player from the camera. Everything else moves past it. */
export const PLAYER_Z = 7;
/** Distance at which new entities appear. */
export const SPAWN_Z = 150;
/**
 * Entities are removed once they get this close. They are long past the player
 * by then, and anything nearer would be blown up to absurd size by the
 * perspective divide.
 */
export const DESPAWN_Z = 3;

export const GRAVITY = 34;
export const JUMP_VELOCITY = 11;
/** Extra upward velocity granted by the spring power-up's second jump. */
export const DOUBLE_JUMP_VELOCITY = 9.5;
export const DUCK_DURATION = 0.62;
export const LANE_CHANGE_DURATION = 0.15;

export const START_SPEED = 14;
export const MAX_SPEED = 44;
/** Speed gained per second of running. */
export const SPEED_ACCEL = 0.3;
/** Multiplier applied while the boost power-up is active. */
export const BOOST_MULTIPLIER = 1.55;

export const PLAYER_HEIGHT = 1.55;
export const PLAYER_DUCK_HEIGHT = 0.8;
export const PLAYER_HALF_WIDTH = 0.42;
/** Half depth of the player's collision box along z. */
export const PLAYER_HALF_DEPTH = 0.5;

export const POWERUP_DURATION = {
  magnet: 8,
  shield: 9,
  boost: 6,
  spring: 12,
};

/** Radius within which the magnet pulls eggs towards the player. */
export const MAGNET_RADIUS = 26;

export const EGG_SCORE = 12;
/** Score awarded per metre travelled. */
export const DISTANCE_SCORE = 2;
