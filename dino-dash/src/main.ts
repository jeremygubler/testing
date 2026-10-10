import { VIEW } from './core/config';
import { Game } from './game';
import { MenuScene } from './scenes/menuScene';

const app = document.getElementById('app');
if (!app) throw new Error('#app container is missing');

const canvas = document.createElement('canvas');
canvas.style.borderRadius = '12px';
canvas.style.touchAction = 'none';
app.appendChild(canvas);

/**
 * The game always renders at a fixed internal resolution and is scaled to fit
 * the window, so layout maths never has to account for the viewport size.
 */
function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(VIEW.W * dpr);
  canvas.height = Math.round(VIEW.H * dpr);

  const fit = Math.min(window.innerWidth / VIEW.W, window.innerHeight / VIEW.H);
  canvas.style.width = `${VIEW.W * fit}px`;
  canvas.style.height = `${VIEW.H * fit}px`;

  // Resizing the backing store clears the transform, so reapply the DPR scale.
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

const game = new Game(canvas);
game.start(new MenuScene(game));

if (import.meta.env.DEV) {
  // Dev-only handle for driving the game from the browser console or an
  // automated playtest. Stripped from production builds.
  (window as unknown as { dinoDash: Game }).dinoDash = game;
}
