/**
 * Shape of the dev-only handle that `src/main.ts` publishes under
 * `import.meta.env.DEV`. It is deliberately loose: the tests reach into live
 * scene internals to stage deterministic situations, and mirroring the real
 * types here would only duplicate them.
 */
type Loose = Record<string, any>;

interface DinoDashScene extends Loose {
  state?: string;
  distance: number;
  score: number;
  eggCount: number;
  speed: number;
  shieldSaves: number;
  timers: Record<string, number>;
  player: Loose;
  spawner: Loose;
  obstacles: Loose[];
  eggs: Loose[];
  powerUps: Loose[];
}

declare global {
  interface Window {
    dinoDash: {
      scene: DinoDashScene;
      save: Loose;
      time: number;
    };
  }
}

export {};
