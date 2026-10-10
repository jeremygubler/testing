import { expect, type Page } from '@playwright/test';

export const SAVE_KEY = 'dino-dash-save-v1';

/** Internal view resolution the game always renders at. */
export const VIEW = { W: 960, H: 600 };
/** Fixed depth of the player; everything else moves towards it. */
export const PLAYER_Z = 7;
export const LANE_WIDTH = 2.2;

export interface SaveData {
  highScore: number;
  bestDistance: number;
  eggs: number;
  eggsAllTime: number;
  bestEggsInRun: number;
  runs: number;
  unlockedSkins: string[];
  selectedSkin: string;
  achievements: string[];
  muted: boolean;
}

export interface RunSnapshot {
  state: 'running' | 'paused' | 'dying' | 'over';
  distance: number;
  score: number;
  eggs: number;
  speed: number;
  timers: { magnet: number; shield: number; boost: number; spring: number };
  lane: number;
  worldX: number;
  y: number;
  height: number;
  ducking: boolean;
  airborne: boolean;
  jumpsUsed: number;
  obstacles: number;
  shieldSaves: number;
}

/**
 * Collision geometry the tests stage by hand. These mirror `SPECS` in
 * `src/entities/obstacle.ts`; stating them here keeps each test explicit about
 * the shape it expects the player to have to deal with.
 */
export const OBSTACLE_SHAPES = {
  /** Ends below jump height: jumpable, not duckable. */
  rock: { halfWidth: 0.72, halfDepth: 0.7, yMin: 0, yMax: 1.15 },
  /** Low: easily jumpable. */
  log: { halfWidth: 0.95, halfDepth: 0.5, yMin: 0, yMax: 0.72 },
  /** Starts above duck height: duckable, not jumpable. */
  branch: { halfWidth: 1.05, halfDepth: 0.42, yMin: 1.02, yMax: 3.2 },
  /** Taller than any jump: only a lane change gets past it. */
  dino: { halfWidth: 0.78, halfDepth: 0.7, yMin: 0, yMax: 2.6 },
} as const;

export type ObstacleKind = keyof typeof OBSTACLE_SHAPES;

/** Loads the game with a known save file and waits for the dev handle. */
export async function boot(page: Page, save?: Partial<SaveData>): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ({ key, value }) => {
      localStorage.clear();
      if (value) localStorage.setItem(key, value);
    },
    { key: SAVE_KEY, value: save ? JSON.stringify(save) : null },
  );
  await page.reload();

  await expect
    .poll(() => page.evaluate(() => Boolean(window.dinoDash)), {
      message: 'window.dinoDash is missing — tests must run against the dev server',
    })
    .toBe(true);
}

export async function startRun(page: Page): Promise<void> {
  await page.keyboard.press('Enter');
  await expect.poll(() => runState(page)).toBe('running');
}

async function runState(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scene = window.dinoDash.scene;
    return typeof scene?.state === 'string' ? scene.state : 'menu';
  });
}

/** Snapshot of the live run, or null when a menu scene is showing. */
export async function snapshot(page: Page): Promise<RunSnapshot | null> {
  return page.evaluate(() => {
    const s = window.dinoDash.scene;
    if (!s || typeof s.state !== 'string' || !s.player) return null;
    return {
      state: s.state,
      distance: s.distance,
      score: s.score,
      eggs: s.eggCount,
      speed: s.speed,
      timers: { ...s.timers },
      lane: s.player.lane,
      worldX: s.player.worldX,
      y: s.player.y,
      height: s.player.height,
      ducking: s.player.ducking,
      airborne: s.player.airborne,
      jumpsUsed: s.player.jumpsUsed,
      obstacles: s.obstacles.length,
      shieldSaves: s.shieldSaves,
    };
  });
}

/** Reads a snapshot and fails the test if no run is active. */
export async function requireRun(page: Page): Promise<RunSnapshot> {
  const snap = await snapshot(page);
  expect(snap, 'expected a run to be in progress').not.toBeNull();
  return snap as RunSnapshot;
}

/**
 * Empties the path and stops the spawner, so a test only faces the obstacles
 * it places itself.
 */
export async function clearWorld(page: Page): Promise<void> {
  await page.evaluate(() => {
    const s = window.dinoDash.scene;
    s.spawner.untilPattern = Number.MAX_SAFE_INTEGER;
    s.spawner.untilEggs = Number.MAX_SAFE_INTEGER;
    s.spawner.untilPowerUp = Number.MAX_SAFE_INTEGER;
    s.obstacles.length = 0;
    s.eggs.length = 0;
    s.powerUps.length = 0;
  });
}

/** Pins the run speed so lead distances stay predictable. */
export async function setSpeed(page: Page, speed: number): Promise<void> {
  await page.evaluate((value) => {
    window.dinoDash.scene.speed = value;
  }, speed);
}

/**
 * Places an obstacle `leadSeconds` of travel ahead of the player, which is how
 * far away it is in reaction-time terms rather than raw metres.
 */
export async function placeObstacle(
  page: Page,
  kind: ObstacleKind,
  lane: number,
  leadSeconds: number,
): Promise<void> {
  const shape = OBSTACLE_SHAPES[kind];
  await page.evaluate(
    ({ kind, lane, leadSeconds, shape, playerZ, laneWidth }) => {
      const s = window.dinoDash.scene;
      s.obstacles.push({
        kind,
        worldX: lane * laneWidth,
        halfWidth: shape.halfWidth,
        halfDepth: shape.halfDepth,
        yMin: shape.yMin,
        yMax: shape.yMax,
        z: playerZ + shape.halfDepth + s.speed * leadSeconds,
        dead: false,
        seed: 0.5,
      });
    },
    { kind, lane, leadSeconds, shape, playerZ: PLAYER_Z, laneWidth: LANE_WIDTH },
  );
}

export async function placeEgg(page: Page, lane: number, y: number, leadSeconds: number): Promise<void> {
  await page.evaluate(
    ({ lane, y, leadSeconds, playerZ, laneWidth }) => {
      const s = window.dinoDash.scene;
      s.eggs.push({
        worldX: lane * laneWidth,
        y,
        z: playerZ + s.speed * leadSeconds,
        dead: false,
        magnetized: false,
        seed: 0.5,
      });
    },
    { lane, y, leadSeconds, playerZ: PLAYER_Z, laneWidth: LANE_WIDTH },
  );
}

export async function placePowerUp(
  page: Page,
  kind: 'magnet' | 'shield' | 'boost' | 'spring',
  lane: number,
  leadSeconds: number,
): Promise<void> {
  await page.evaluate(
    ({ kind, lane, leadSeconds, playerZ, laneWidth }) => {
      const s = window.dinoDash.scene;
      s.powerUps.push({
        kind,
        worldX: lane * laneWidth,
        y: 0.95,
        z: playerZ + s.speed * leadSeconds,
        dead: false,
        seed: 0.5,
      });
    },
    { kind, lane, leadSeconds, playerZ: PLAYER_Z, laneWidth: LANE_WIDTH },
  );
}

/**
 * Waits until every staged obstacle has gone past (or the run ended) and
 * reports which happened.
 */
export async function resolveObstacles(page: Page, timeout = 8000): Promise<'survived' | 'crashed'> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const s = window.dinoDash.scene;
          if (s.state !== 'running') return 'crashed';
          return s.obstacles.length === 0 ? 'survived' : 'pending';
        }),
      { timeout },
    )
    .not.toBe('pending');

  return page.evaluate(() => (window.dinoDash.scene.state === 'running' ? 'survived' : 'crashed'));
}

/**
 * The save as the game currently holds it in memory, with defaults filled in.
 * Use this when an action is expected to change nothing: a refused purchase
 * writes no file, so localStorage would still hold the raw seeded JSON.
 */
export async function liveSave(page: Page): Promise<SaveData> {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.dinoDash.save)) as SaveData);
}

export async function readSave(page: Page): Promise<SaveData | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  }, SAVE_KEY);
}

export interface FrameSample {
  worldX: number;
  y: number;
  vy: number;
  lane: number;
  ducking: boolean;
  airborne: boolean;
}

/**
 * Presses a key inside the page and samples the player once per animation
 * frame. Transitions like a lane change last only ~0.15 s, which a round trip
 * through the test runner can easily overshoot; sampling in-page observes them
 * reliably.
 */
export async function sampleAfterKey(
  page: Page,
  code: string,
  frames: number,
): Promise<FrameSample[]> {
  return page.evaluate(
    async ({ code, frames }) => {
      const player = window.dinoDash.scene.player;
      const samples: FrameSample[] = [];
      window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      for (let i = 0; i < frames; i++) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        samples.push({
          worldX: player.worldX,
          y: player.y,
          vy: player.vy,
          lane: player.lane,
          ducking: player.ducking,
          airborne: player.airborne,
        });
      }
      return samples;
    },
    { code, frames },
  );
}

/** Translates internal view coordinates into a click on the canvas. */
export async function tapView(page: Page, x: number, y: number): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  expect(box, 'canvas should be visible').not.toBeNull();
  const { x: left, y: top, width, height } = box!;
  await page.mouse.click(left + (x / VIEW.W) * width, top + (y / VIEW.H) * height);
}

/**
 * Drags across the canvas to trigger a swipe. The game listens for pointer
 * events, so a mouse drag exercises exactly the same handler a touch swipe does.
 */
export async function swipe(page: Page, direction: 'left' | 'right' | 'up' | 'down'): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  expect(box, 'canvas should be visible').not.toBeNull();
  const centreX = box!.x + box!.width / 2;
  const centreY = box!.y + box!.height / 2;
  const distance = 90;
  const deltas = {
    left: [-distance, 0],
    right: [distance, 0],
    up: [0, -distance],
    down: [0, distance],
  }[direction];

  await page.mouse.move(centreX, centreY);
  await page.mouse.down();
  await page.mouse.move(centreX + deltas[0] / 2, centreY + deltas[1] / 2, { steps: 3 });
  await page.mouse.move(centreX + deltas[0], centreY + deltas[1], { steps: 3 });
  await page.mouse.up();
}
