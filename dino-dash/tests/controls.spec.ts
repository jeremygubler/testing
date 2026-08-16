import { expect, test } from '@playwright/test';
import { boot, clearWorld, requireRun, sampleAfterKey, snapshot, startRun, swipe } from './helpers';

test.beforeEach(async ({ page }) => {
  await boot(page);
  await startRun(page);
  await clearWorld(page);
});

test.describe('lane switching', () => {
  test('arrow keys move between the three lanes', async ({ page }) => {
    expect((await requireRun(page)).lane).toBe(0);

    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await requireRun(page)).lane).toBe(-1);

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await requireRun(page)).lane).toBe(1);
  });

  test('lanes clamp at the edges of the path', async ({ page }) => {
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await requireRun(page)).lane).toBe(1);

    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await requireRun(page)).lane).toBe(-1);
  });

  test('the lateral position eases across rather than snapping', async ({ page }) => {
    // The switch takes ~0.15 s, so the intermediate positions are sampled
    // frame by frame inside the page rather than polled from the test runner.
    const samples = await sampleAfterKey(page, 'ArrowRight', 20);

    const between = samples.filter((s) => s.worldX > 0.05 && s.worldX < 2.15);
    expect(between.length, 'expected positions between the two lane centres').toBeGreaterThan(1);

    // Movement only ever goes towards the target lane.
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].worldX).toBeGreaterThanOrEqual(samples[i - 1].worldX - 1e-6);
    }
    expect(samples[samples.length - 1].worldX).toBeCloseTo(2.2, 1);
  });
});

test.describe('jumping', () => {
  test('space lifts the dino and gravity brings it back', async ({ page }) => {
    await page.keyboard.press('Space');
    await expect.poll(async () => (await requireRun(page)).airborne).toBe(true);

    const peak = await page.evaluate(async () => {
      let highest = 0;
      for (let i = 0; i < 40; i++) {
        highest = Math.max(highest, window.dinoDash.scene.player.y);
        await new Promise((r) => setTimeout(r, 20));
      }
      return highest;
    });
    // High enough to clear a rock (1.15 world units), not absurdly high.
    expect(peak).toBeGreaterThan(1.4);
    expect(peak).toBeLessThan(2.2);

    await expect.poll(async () => (await requireRun(page)).airborne, { timeout: 4000 }).toBe(false);
  });

  test('there is no second jump without the spring power-up', async ({ page }) => {
    await page.keyboard.press('Space');
    await expect.poll(async () => (await requireRun(page)).jumpsUsed).toBe(1);

    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    expect((await requireRun(page)).jumpsUsed).toBe(1);
  });
});

test.describe('ducking', () => {
  test('the down key shortens the dino, then it stands back up', async ({ page }) => {
    const standing = await requireRun(page);

    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await requireRun(page)).ducking).toBe(true);
    expect((await requireRun(page)).height).toBeLessThan(standing.height);

    await expect.poll(async () => (await requireRun(page)).ducking, { timeout: 3000 }).toBe(false);
  });

  test('ducking in mid-air slams the dino back down', async ({ page }) => {
    const rising = await sampleAfterKey(page, 'Space', 4);
    expect(rising.some((s) => s.vy > 0), 'the dino should be on the way up').toBe(true);

    // The slam forces a strong downward velocity instead of letting the arc
    // play out, so the dino lands far sooner than a free fall would allow.
    const slamming = await sampleAfterKey(page, 'ArrowDown', 8);
    expect(Math.min(...slamming.map((s) => s.vy))).toBeLessThanOrEqual(-14);
    expect(slamming[slamming.length - 1].airborne).toBe(false);
  });
});

test.describe('swipe gestures', () => {
  // The game handles pointer events, so a drag drives the same code path a
  // touch swipe does.
  test('swiping sideways changes lane', async ({ page }) => {
    await swipe(page, 'right');
    await expect.poll(async () => (await requireRun(page)).lane).toBe(1);

    await swipe(page, 'left');
    await swipe(page, 'left');
    await expect.poll(async () => (await requireRun(page)).lane).toBe(-1);
  });

  test('swiping up jumps and swiping down ducks', async ({ page }) => {
    await swipe(page, 'up');
    await expect.poll(async () => (await requireRun(page)).airborne).toBe(true);
    await expect.poll(async () => (await requireRun(page)).airborne, { timeout: 4000 }).toBe(false);

    await swipe(page, 'down');
    await expect.poll(async () => (await requireRun(page)).ducking).toBe(true);
  });
});

test.describe('pause', () => {
  test('P freezes the run and resumes it', async ({ page }) => {
    await page.keyboard.press('KeyP');
    await expect.poll(async () => (await requireRun(page)).state).toBe('paused');

    const frozen = await requireRun(page);
    await page.waitForTimeout(600);
    expect((await requireRun(page)).distance).toBe(frozen.distance);

    await page.keyboard.press('KeyP');
    await expect.poll(async () => (await requireRun(page)).state).toBe('running');
    await expect.poll(async () => (await requireRun(page)).distance).toBeGreaterThan(frozen.distance);
  });

  test('input is ignored while paused', async ({ page }) => {
    await page.keyboard.press('KeyP');
    await expect.poll(async () => (await snapshot(page))?.state).toBe('paused');

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    expect((await requireRun(page)).lane).toBe(0);
  });
});
