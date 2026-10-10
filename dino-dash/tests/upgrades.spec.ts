import { expect, test } from '@playwright/test';
import {
  boot,
  clearWorld,
  liveSave,
  placeObstacle,
  placePowerUp,
  readSave,
  requireRun,
  resolveObstacles,
  setSpeed,
  snapshot,
  startRun,
  tapView,
} from './helpers';

const MENU_UPGRADES = { x: 720, y: 347 };

/** Centre of the buy button on the nth upgrade row. */
function buyButton(index: number) {
  return { x: 96 + (960 - 192) - 190 + 84, y: 128 + index * 94 + 18 + 24 };
}

const SAVE = {
  highScore: 5000,
  bestDistance: 900,
  eggs: 500,
  eggsAllTime: 900,
  bestEggsInRun: 40,
  runs: 5,
  unlockedSkins: ['classic'],
  selectedSkin: 'classic',
  achievements: ['first_run'],
  muted: true,
};

test.describe('power-up upgrades', () => {
  test('buying a level spends eggs and records it', async ({ page }) => {
    await boot(page, SAVE);
    await page.waitForTimeout(400);
    await tapView(page, MENU_UPGRADES.x, MENU_UPGRADES.y);
    await page.waitForTimeout(400);

    // First row is the magnet; level 1 costs 200.
    await tapView(page, buyButton(0).x, buyButton(0).y);

    await expect.poll(async () => (await readSave(page))?.upgrades?.magnet).toBe(1);
    expect((await readSave(page))!.eggs).toBe(300);
  });

  test('an upgrade you cannot afford is refused', async ({ page }) => {
    await boot(page, { ...SAVE, eggs: 50 });
    await page.waitForTimeout(400);
    await tapView(page, MENU_UPGRADES.x, MENU_UPGRADES.y);
    await page.waitForTimeout(400);

    await tapView(page, buyButton(0).x, buyButton(0).y);
    await page.waitForTimeout(400);

    // A refused purchase writes nothing, so check what the game holds.
    const save = await liveSave(page);
    expect(save.upgrades.magnet).toBe(0);
    expect(save.eggs).toBe(50);
  });

  test('a maxed-out upgrade cannot be bought again', async ({ page }) => {
    await boot(page, {
      ...SAVE,
      eggs: 5000,
      upgrades: { magnet: 3, shield: 0, boost: 0, spring: 0 },
    });
    await page.waitForTimeout(400);
    await tapView(page, MENU_UPGRADES.x, MENU_UPGRADES.y);
    await page.waitForTimeout(400);

    await tapView(page, buyButton(0).x, buyButton(0).y);
    await page.waitForTimeout(400);

    const save = await liveSave(page);
    expect(save.upgrades.magnet).toBe(3);
    expect(save.eggs).toBe(5000);
  });

  test('an upgraded power-up lasts longer in play', async ({ page }) => {
    await boot(page, {
      ...SAVE,
      upgrades: { magnet: 0, shield: 2, boost: 0, spring: 0 },
    });
    await startRun(page);
    await clearWorld(page);
    await setSpeed(page, 16);

    await placePowerUp(page, 'shield', 0, 0.6);
    await expect
      .poll(async () => (await requireRun(page)).timers.shield, { timeout: 5000 })
      .toBeGreaterThan(0);

    // Base duration is 9 s; two levels add 2.5 s each.
    expect((await requireRun(page)).timers.shield).toBeGreaterThan(12);
  });
});

test.describe('best runs list', () => {
  test('a finished run is added, keeping the highest first', async ({ page }) => {
    await boot(page, {
      ...SAVE,
      scores: [{ score: 999999, distance: 5000, eggs: 400, date: '2026-01-01' }],
    });
    await startRun(page);
    await clearWorld(page);
    await setSpeed(page, 16);

    await placeObstacle(page, 'rock', 0, 1.2);
    await resolveObstacles(page);
    await expect.poll(async () => (await snapshot(page))?.state, { timeout: 4000 }).toBe('over');

    const scores = (await readSave(page))!.scores;
    expect(scores.length).toBe(2);
    expect(scores[0].score).toBe(999999);
    expect(scores[1].score).toBeGreaterThan(0);
  });

  test('the list never grows past five entries', async ({ page }) => {
    const filler = Array.from({ length: 5 }, (_, i) => ({
      score: 100000 + i,
      distance: 100,
      eggs: 10,
      date: '2026-01-01',
    }));
    await boot(page, { ...SAVE, scores: filler });
    await startRun(page);
    await clearWorld(page);
    await setSpeed(page, 16);

    await placeObstacle(page, 'rock', 0, 1.2);
    await resolveObstacles(page);
    await expect.poll(async () => (await snapshot(page))?.state, { timeout: 4000 }).toBe('over');

    expect((await readSave(page))!.scores.length).toBe(5);
  });
});

test.describe('achievements during a run', () => {
  test('an egg milestone is awarded before the run ends', async ({ page }) => {
    await boot(page, { ...SAVE, achievements: [] });
    await startRun(page);
    await clearWorld(page);
    await setSpeed(page, 16);

    await page.evaluate(() => {
      window.dinoDash.scene.eggCount = 55;
    });

    // Saved while the run is still going, not at the game over screen.
    await expect
      .poll(async () => (await readSave(page))?.achievements ?? [], { timeout: 3000 })
      .toContain('eggs50');
    expect((await snapshot(page))!.state).toBe('running');
  });

  test('a distance milestone is awarded mid-run', async ({ page }) => {
    await boot(page, { ...SAVE, achievements: [] });
    await startRun(page);
    await clearWorld(page);

    await page.evaluate(() => {
      window.dinoDash.scene.distance = 1050;
    });

    await expect
      .poll(async () => (await readSave(page))?.achievements ?? [], { timeout: 3000 })
      .toContain('dist1000');
    expect((await snapshot(page))!.state).toBe('running');
  });

  test('an achievement is not awarded twice', async ({ page }) => {
    await boot(page, { ...SAVE, achievements: [] });
    await startRun(page);
    await clearWorld(page);

    await page.evaluate(() => {
      window.dinoDash.scene.eggCount = 55;
    });
    await expect
      .poll(async () => (await readSave(page))?.achievements ?? [], { timeout: 3000 })
      .toContain('eggs50');

    await page.waitForTimeout(700);
    const ids = (await readSave(page))!.achievements;
    expect(ids.filter((id) => id === 'eggs50')).toHaveLength(1);
  });
});

test.describe('biomes', () => {
  test('the palette changes as the run gets longer', async ({ page }) => {
    await boot(page, SAVE);
    await startRun(page);
    await clearWorld(page);

    const skyAt = async (distance: number) => {
      await page.evaluate((d) => {
        window.dinoDash.scene.distance = d;
      }, distance);
      await page.waitForTimeout(250);
      // Sample the top-left corner, which is always open sky.
      return page.evaluate(() => {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d')!;
        const d = ctx.getImageData(4, 4, 1, 1).data;
        return `${d[0]},${d[1]},${d[2]}`;
      });
    };

    const day = await skyAt(100);
    const night = await skyAt(1600);
    expect(night).not.toBe(day);

    // Night is markedly darker than day.
    const brightness = (rgb: string) =>
      rgb.split(',').reduce((sum, v) => sum + Number(v), 0) / 3;
    expect(brightness(night)).toBeLessThan(brightness(day) - 60);
  });

  test('menus stay on the daytime palette', async ({ page }) => {
    await boot(page, { ...SAVE, bestDistance: 9000 });
    await page.waitForTimeout(600);
    const sky = await page.evaluate(() => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d')!;
      const d = ctx.getImageData(4, 4, 1, 1).data;
      return (d[0] + d[1] + d[2]) / 3;
    });
    expect(sky).toBeGreaterThan(150);
  });
});

test.describe('losing focus', () => {
  test('a run pauses itself when the window is blurred', async ({ page }) => {
    await boot(page, SAVE);
    await startRun(page);
    await clearWorld(page);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect.poll(async () => (await snapshot(page))?.state).toBe('paused');

    const frozen = await requireRun(page);
    await page.waitForTimeout(500);
    expect((await requireRun(page)).distance).toBe(frozen.distance);
  });
});
