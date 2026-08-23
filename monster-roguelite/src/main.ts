import Phaser from 'phaser';
import { COLORS, VIEW_H, VIEW_W } from './config/GameConfig';
import { BootScene } from './scenes/BootScene';
import { GameOverScene } from './scenes/GameOverScene';
import { GameScene } from './scenes/GameScene';
import { HubScene } from './scenes/HubScene';
import { HudScene } from './scenes/HudScene';

/**
 * Einstiegspunkt. Hier wird ausschliesslich Phaser konfiguriert — Spiellogik
 * gehört bewusst nicht hierher.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: COLORS.bg,
  pixelArt: false,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, HubScene, GameScene, HudScene, GameOverScene],
};

const game = new Phaser.Game(config);

// Debug-Zugriff für automatisierte Browser-Tests (siehe tools/smoke.mjs).
// Im Produktionsbuild von Vite wird der Zweig herausoptimiert.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
