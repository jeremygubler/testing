import { expect, test } from '@playwright/test';
import {
  boot,
  clearWorld,
  placeObstacle,
  readSave,
  resolveObstacles,
  setSpeed,
  snapshot,
  startRun,
  tapView,
} from './helpers';

/** Menu button positions in internal view coordinates. */
const MENU = {
  play: { x: 720, y: 258 },
  skins: { x: 720, y: 332 },
  achievements: { x: 720, y: 396 },
  mute: { x: 902, y: 34 },
  back: { x: 107, y: 557 },
};

/** Centre of a cell in the 4-column skin grid. */
function skinCell(index: number) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return { x: 62 + column * 208 + 98, y: 116 + row * 190 + 89 };
}

test.describe('saving progress', () => {
  test('finishing a run stores the score and the eggs', async ({ page }) => {
    await boot(page);
    await startRun(page);
    await clearWorld(page);
    await setSpeed(page, 16);

    await placeObstacle(page, 'rock', 0, 1.6);
    await resolveObstacles(page);
    await expect.poll(async () => (await snapshot(page))?.state, { timeout: 4000 }).toBe('over');

    const save = await readSave(page);
    expect(save).not.toBeNull();
    expect(save!.runs).toBe(1);
    expect(save!.highScore).toBeGreaterThan(0);
    expect(save!.bestDistance).toBeGreaterThan(0);
    expect(save!.achievements).toContain('first_run');
  });

  test('the record survives a reload and only improves', async ({ page }) => {
    await boot(page, {
      highScore: 5000,
      bestDistance: 900,
      eggs: 40,
      eggsAllTime: 40,
      bestEggsInRun: 12,
      runs: 3,
      unlockedSkins: ['classic'],
      selectedSkin: 'classic',
      achievements: ['first_run'],
      muted: false,
    });

    await startRun(page);
    await clearWorld(page);
    await setSpeed(page, 16);
    await placeObstacle(page, 'rock', 0, 1.2);
    await resolveObstacles(page);
    await expect.poll(async () => (await snapshot(page))?.state, { timeout: 4000 }).toBe('over');

    const save = await readSave(page);
    // A short run must not overwrite a better record.
    expect(save!.highScore).toBe(5000);
    expect(save!.bestDistance).toBe(900);
    expect(save!.runs).toBe(4);
  });

  test('muting persists across a reload', async ({ page }) => {
    await boot(page);
    await page.waitForTimeout(400);

    await tapView(page, MENU.mute.x, MENU.mute.y);
    await expect.poll(async () => (await readSave(page))?.muted).toBe(true);

    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(window.dinoDash))).toBe(true);
    expect(await page.evaluate(() => window.dinoDash.save.muted)).toBe(true);
  });
});

test.describe('unlocking dino skins', () => {
  const richSave = {
    highScore: 9000,
    bestDistance: 1200,
    eggs: 400,
    eggsAllTime: 1200,
    bestEggsInRun: 90,
    runs: 8,
    unlockedSkins: ['classic'],
    selectedSkin: 'classic',
    achievements: ['first_run'],
    muted: true,
  };

  test('buying a skin spends eggs and selects it', async ({ page }) => {
    await boot(page, richSave);
    await page.waitForTimeout(400);
    await tapView(page, MENU.skins.x, MENU.skins.y);
    await page.waitForTimeout(400);

    // Index 3 is Sonnenschein at 300 eggs.
    await tapView(page, skinCell(3).x, skinCell(3).y);

    await expect.poll(async () => (await readSave(page))?.selectedSkin).toBe('sunny');
    const save = await readSave(page);
    expect(save!.eggs).toBe(100);
    expect(save!.unlockedSkins).toContain('sunny');
  });

  test('a skin you cannot afford stays locked', async ({ page }) => {
    await boot(page, { ...richSave, eggs: 50 });
    await page.waitForTimeout(400);
    await tapView(page, MENU.skins.x, MENU.skins.y);
    await page.waitForTimeout(400);

    // Index 6 is Regenbogen at 1500 eggs.
    await tapView(page, skinCell(6).x, skinCell(6).y);
    await page.waitForTimeout(400);

    const save = await readSave(page);
    expect(save!.eggs).toBe(50);
    expect(save!.unlockedSkins).not.toContain('rainbow');
    expect(save!.selectedSkin).toBe('classic');
  });

  test('an already unlocked skin can be selected for free', async ({ page }) => {
    await boot(page, { ...richSave, unlockedSkins: ['classic', 'berry'], selectedSkin: 'classic' });
    await page.waitForTimeout(400);
    await tapView(page, MENU.skins.x, MENU.skins.y);
    await page.waitForTimeout(400);

    await tapView(page, skinCell(1).x, skinCell(1).y);

    await expect.poll(async () => (await readSave(page))?.selectedSkin).toBe('berry');
    expect((await readSave(page))!.eggs).toBe(400);
  });
});

test.describe('menu navigation', () => {
  test('opens the sub-menus and comes back', async ({ page }) => {
    await boot(page);
    await page.waitForTimeout(400);

    const sceneName = () => page.evaluate(() => window.dinoDash.scene.constructor.name);

    await tapView(page, MENU.skins.x, MENU.skins.y);
    await expect.poll(sceneName).toBe('SkinsScene');
    await tapView(page, MENU.back.x, MENU.back.y);
    await expect.poll(sceneName).toBe('MenuScene');

    await tapView(page, MENU.achievements.x, MENU.achievements.y);
    await expect.poll(sceneName).toBe('AchievementsScene');
    await tapView(page, MENU.back.x, MENU.back.y);
    await expect.poll(sceneName).toBe('MenuScene');

    await tapView(page, MENU.play.x, MENU.play.y);
    await expect.poll(sceneName).toBe('GameScene');
  });
});

test.describe('achievements', () => {
  test('collecting 50 eggs in one run unlocks the egg achievement', async ({ page }) => {
    await boot(page);
    await startRun(page);
    await clearWorld(page);
    await setSpeed(page, 16);

    // Credit the eggs directly, then end the run so it gets evaluated.
    await page.evaluate(() => {
      window.dinoDash.scene.eggCount = 52;
    });
    await placeObstacle(page, 'rock', 0, 1.2);
    await resolveObstacles(page);
    await expect.poll(async () => (await snapshot(page))?.state, { timeout: 4000 }).toBe('over');

    const save = await readSave(page);
    expect(save!.achievements).toContain('eggs50');
    expect(save!.bestEggsInRun).toBe(52);
    expect(save!.eggs).toBe(52);
  });

  test('an achievement is only awarded once', async ({ page }) => {
    await boot(page, {
      highScore: 100,
      bestDistance: 10,
      eggs: 0,
      eggsAllTime: 0,
      bestEggsInRun: 0,
      runs: 1,
      unlockedSkins: ['classic'],
      selectedSkin: 'classic',
      achievements: ['first_run'],
      muted: true,
    });

    await startRun(page);
    await clearWorld(page);
    await setSpeed(page, 16);
    await placeObstacle(page, 'rock', 0, 1.2);
    await resolveObstacles(page);
    await expect.poll(async () => (await snapshot(page))?.state, { timeout: 4000 }).toBe('over');

    const save = await readSave(page);
    expect(save!.achievements.filter((id) => id === 'first_run')).toHaveLength(1);
  });
});
