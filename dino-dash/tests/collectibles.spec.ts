import { expect, test } from '@playwright/test';
import {
  boot,
  clearWorld,
  placeEgg,
  placeObstacle,
  placePowerUp,
  requireRun,
  resolveObstacles,
  setSpeed,
  startRun,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await boot(page);
  await startRun(page);
  await clearWorld(page);
  await setSpeed(page, 16);
});

test.describe('eggs', () => {
  test('running through eggs collects them and scores points', async ({ page }) => {
    const before = await requireRun(page);
    for (let i = 0; i < 5; i++) await placeEgg(page, 0, 0.55, 0.6 + i * 0.15);

    await expect.poll(async () => (await requireRun(page)).eggs, { timeout: 6000 }).toBe(5);
    const after = await requireRun(page);
    // Each egg is worth points on top of the distance score.
    expect(after.score - before.score).toBeGreaterThan(5 * 12);
  });

  test('eggs in another lane are missed', async ({ page }) => {
    await placeEgg(page, 1, 0.55, 0.6);
    await page.waitForTimeout(1500);
    expect((await requireRun(page)).eggs).toBe(0);
  });

  test('eggs placed high need a jump', async ({ page }) => {
    await placeEgg(page, 0, 1.6, 0.9);
    await page.waitForTimeout(300);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await requireRun(page)).eggs, { timeout: 5000 }).toBe(1);
  });
});

test.describe('power-ups', () => {
  for (const [kind, duration] of [
    ['magnet', 8],
    ['shield', 9],
    ['boost', 6],
    ['spring', 12],
  ] as const) {
    test(`${kind} activates for ${duration} seconds`, async ({ page }) => {
      await placePowerUp(page, kind, 0, 0.6);
      await expect
        .poll(async () => (await requireRun(page)).timers[kind], { timeout: 5000 })
        .toBeGreaterThan(0);

      const timers = (await requireRun(page)).timers;
      expect(timers[kind]).toBeLessThanOrEqual(duration);
      expect(timers[kind]).toBeGreaterThan(duration - 2);
    });
  }

  test('the magnet pulls eggs across from a neighbouring lane', async ({ page }) => {
    await page.evaluate(() => {
      window.dinoDash.scene.timers.magnet = 8;
    });
    await placeEgg(page, 1, 0.55, 1.1);

    await expect.poll(async () => (await requireRun(page)).eggs, { timeout: 6000 }).toBe(1);
  });

  test('without the magnet the same egg stays out of reach', async ({ page }) => {
    await placeEgg(page, 1, 0.55, 1.1);
    await page.waitForTimeout(2200);
    expect((await requireRun(page)).eggs).toBe(0);
  });

  test('the spring grants a double jump', async ({ page }) => {
    await page.evaluate(() => {
      window.dinoDash.scene.timers.spring = 12;
    });

    await page.keyboard.press('Space');
    await expect.poll(async () => (await requireRun(page)).jumpsUsed).toBe(1);

    await page.waitForTimeout(150);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await requireRun(page)).jumpsUsed).toBe(2);

    // No third jump, even with the spring active.
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    expect((await requireRun(page)).jumpsUsed).toBe(2);
  });

  test('the shield absorbs one hit and is used up', async ({ page }) => {
    await page.evaluate(() => {
      window.dinoDash.scene.timers.shield = 9;
    });
    await placeObstacle(page, 'dino', 0, 1.2);

    expect(await resolveObstacles(page)).toBe('survived');
    const after = await requireRun(page);
    expect(after.shieldSaves).toBe(1);
    expect(after.timers.shield).toBe(0);
  });

  test('a second hit after the shield is gone ends the run', async ({ page }) => {
    await page.evaluate(() => {
      window.dinoDash.scene.timers.shield = 9;
    });
    await placeObstacle(page, 'dino', 0, 1.2);
    expect(await resolveObstacles(page)).toBe('survived');

    // Wait out the brief invulnerability that follows a shield break.
    await page.waitForTimeout(900);
    await placeObstacle(page, 'dino', 0, 1.2);
    expect(await resolveObstacles(page)).toBe('crashed');
  });

  test('the boost speeds the run up', async ({ page }) => {
    const before = await requireRun(page);
    await page.waitForTimeout(700);
    const baseline = (await requireRun(page)).distance - before.distance;

    await page.evaluate(() => {
      window.dinoDash.scene.timers.boost = 6;
    });
    const boostStart = await requireRun(page);
    await page.waitForTimeout(700);
    const boosted = (await requireRun(page)).distance - boostStart.distance;

    expect(boosted).toBeGreaterThan(baseline * 1.3);
  });
});
