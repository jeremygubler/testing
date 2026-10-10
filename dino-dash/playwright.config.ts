import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

/**
 * The suite drives the real game in a browser. It runs against the **dev**
 * server on purpose: `src/main.ts` only publishes the `window.dinoDash` handle
 * under `import.meta.env.DEV`, and the tests use it to inspect and stage game
 * state deterministically.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 30_000,

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1000, height: 700 } },
    },
  ],

  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
