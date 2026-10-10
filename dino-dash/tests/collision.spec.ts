import { expect, test } from '@playwright/test';
import {
  boot,
  clearWorld,
  placeObstacle,
  requireRun,
  resolveObstacles,
  setSpeed,
  snapshot,
  startRun,
} from './helpers';

/**
 * Each obstacle is defined by its vertical extent, and that alone decides which
 * move gets past it. These tests stage one obstacle at a time on an otherwise
 * empty path and check that the intended move is the one that works.
 */
test.beforeEach(async ({ page }) => {
  await boot(page);
  await startRun(page);
  await clearWorld(page);
  await setSpeed(page, 16);
});

test.describe('obstacles that must be jumped', () => {
  test('running into a rock ends the run', async ({ page }) => {
    await placeObstacle(page, 'rock', 0, 1.2);
    expect(await resolveObstacles(page)).toBe('crashed');
  });

  test('jumping clears a rock', async ({ page }) => {
    await placeObstacle(page, 'rock', 0, 0.34);
    await page.keyboard.press('Space');
    expect(await resolveObstacles(page)).toBe('survived');
  });

  test('a rock in another lane is harmless', async ({ page }) => {
    await placeObstacle(page, 'rock', 1, 1.2);
    expect(await resolveObstacles(page)).toBe('survived');
  });

  test('ducking does not get you under a rock', async ({ page }) => {
    await placeObstacle(page, 'rock', 0, 0.3);
    await page.keyboard.press('ArrowDown');
    expect(await resolveObstacles(page)).toBe('crashed');
  });
});

test.describe('obstacles that must be ducked', () => {
  test('standing up into a low branch ends the run', async ({ page }) => {
    await placeObstacle(page, 'branch', 0, 1.2);
    expect(await resolveObstacles(page)).toBe('crashed');
  });

  test('ducking passes under a branch', async ({ page }) => {
    await placeObstacle(page, 'branch', 0, 0.3);
    await page.keyboard.press('ArrowDown');
    expect(await resolveObstacles(page)).toBe('survived');
  });

  test('jumping into a branch ends the run', async ({ page }) => {
    await placeObstacle(page, 'branch', 0, 0.34);
    await page.keyboard.press('Space');
    expect(await resolveObstacles(page)).toBe('crashed');
  });
});

test.describe('obstacles that must be dodged', () => {
  test('a rival dino is too tall to jump', async ({ page }) => {
    await placeObstacle(page, 'dino', 0, 0.34);
    await page.keyboard.press('Space');
    expect(await resolveObstacles(page)).toBe('crashed');
  });

  test('changing lane gets past a rival dino', async ({ page }) => {
    await placeObstacle(page, 'dino', 0, 1.2);
    await page.keyboard.press('ArrowLeft');
    expect(await resolveObstacles(page)).toBe('survived');
  });

  test('two blocked lanes still leave one way through', async ({ page }) => {
    await placeObstacle(page, 'dino', 0, 1.4);
    await placeObstacle(page, 'rock', 1, 1.4);
    await page.keyboard.press('ArrowLeft');
    expect(await resolveObstacles(page)).toBe('survived');
  });
});

test.describe('game over', () => {
  test('a crash settles into the game over state and records the run', async ({ page }) => {
    await placeObstacle(page, 'rock', 0, 1.2);
    expect(await resolveObstacles(page)).toBe('crashed');

    // A short death animation plays before the panel appears.
    await expect.poll(async () => (await snapshot(page))?.state, { timeout: 4000 }).toBe('over');

    const final = await requireRun(page);
    expect(final.distance).toBeGreaterThan(0);
  });

  test('restarting resets the run', async ({ page }) => {
    await placeObstacle(page, 'rock', 0, 1.2);
    await resolveObstacles(page);
    await expect.poll(async () => (await snapshot(page))?.state, { timeout: 4000 }).toBe('over');

    const crashed = await requireRun(page);
    expect(crashed.distance).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await expect.poll(async () => (await snapshot(page))?.state).toBe('running');

    const restarted = await requireRun(page);
    expect(restarted.distance).toBeLessThan(crashed.distance);
    expect(restarted.eggs).toBe(0);
    expect(restarted.lane).toBe(0);
  });
});
