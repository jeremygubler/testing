import Phaser from 'phaser';
import { COLORS, VIEW_H, VIEW_W } from './config/GameConfig';
import { Rng } from './core/Rng';
import { DEFAULT_RELIC_IDS } from './data/relics';
import { generateFloor } from './world/FloorGenerator';
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
  const w = window as unknown as Record<string, unknown>;
  w.__game = game;
  // Der Etagen-Generator ist auch ohne laufendes Spiel prüfbar: der Bot lässt
  // ihn über viele Seeds laufen und misst die Verteilung der Raumtypen und
  // Elite-Gegner. Auf Spielglück zu warten wäre kein Nachweis.
  w.__debug = { generateFloor, Rng, DEFAULT_RELIC_IDS };
}
