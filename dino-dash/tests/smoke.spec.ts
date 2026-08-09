import { expect, test } from '@playwright/test';
import { boot, requireRun, startRun } from './helpers';

test.describe('smoke', () => {
  test('loads the menu without console or page errors', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console: ${message.text()}`);
    });

    await boot(page);
    await page.waitForTimeout(1200);

    await expect(page.locator('canvas')).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('renders at the fixed internal resolution and scales to fit', async ({ page }) => {
    await boot(page);
    const canvas = page.locator('canvas');
    const size = await canvas.evaluate((el: HTMLCanvasElement) => ({
      bufferWidth: el.width,
      bufferHeight: el.height,
      ratio: el.clientWidth / el.clientHeight,
    }));

    // The backing store is 960x600 times the device pixel ratio.
    expect(size.bufferWidth / size.bufferHeight).toBeCloseTo(960 / 600, 2);
    // The displayed canvas keeps that aspect ratio.
    expect(size.ratio).toBeCloseTo(960 / 600, 1);
  });

  test('starts a run and keeps advancing', async ({ page }) => {
    await boot(page);
    await startRun(page);

    const early = await requireRun(page);
    await page.waitForTimeout(1500);
    const later = await requireRun(page);

    expect(later.distance).toBeGreaterThan(early.distance);
    expect(later.score).toBeGreaterThan(early.score);
    // Speed ramps up over time.
    expect(later.speed).toBeGreaterThan(early.speed);
  });

  test('the production build does not expose the dev handle', async ({ page }) => {
    // Guards the `import.meta.env.DEV` guard in src/main.ts: the bundled app
    // must not ship a debug hook. Checked against the built output on disk.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const distDir = path.resolve('dist/assets');

    let files: string[];
    try {
      files = await fs.readdir(distDir);
    } catch {
      test.skip(true, 'no dist/ build present — run `npm run build` first');
      return;
    }

    for (const file of files.filter((f) => f.endsWith('.js'))) {
      const source = await fs.readFile(path.join(distDir, file), 'utf8');
      expect(source, `${file} should not contain the dev handle`).not.toContain('dinoDash');
    }
  });
});
