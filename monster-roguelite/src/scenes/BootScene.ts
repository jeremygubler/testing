import Phaser from 'phaser';
import { sfx } from '../audio/Sfx';
import { TILE } from '../config/GameConfig';
import { loadMeta } from '../meta/MetaSave';

/**
 * Erzeugt alle Platzhalter-Texturen prozedural — das Projekt kommt bewusst
 * ohne Asset-Dateien aus. Alle Texturen sind weiss und werden zur Laufzeit
 * eingefärbt (`setTint`), damit eine Textur für alle Elementartypen reicht.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.makeCircle('dot', 8);
    this.makeCircle('orb', 14);
    this.makeCircle('orb_big', 24);
    this.makeRing('ring', 16, 3);
    this.makeSquare('square', TILE);
    this.makeTrainer();
    this.makeChest();
    this.makeBall();
    this.makeSpark();
  }

  create(): void {
    // Phasers WebAudio-Context übernehmen, statt einen zweiten aufzumachen.
    const manager = this.sound as Partial<Phaser.Sound.WebAudioSoundManager>;
    sfx.init(manager.context ?? null);
    sfx.setMuted(loadMeta().muted);

    this.scene.start('Hub');
  }

  // --- Generatoren -------------------------------------------------------

  private makeCircle(key: string, radius: number): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(radius, radius, radius);
    g.generateTexture(key, radius * 2, radius * 2);
    g.destroy();
  }

  private makeRing(key: string, radius: number, thickness: number): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(thickness, 0xffffff, 1);
    g.strokeCircle(radius, radius, radius - thickness / 2);
    g.generateTexture(key, radius * 2, radius * 2);
    g.destroy();
  }

  private makeSquare(key: string, size: number): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, size, size);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  /** Trainer: abgerundeter Körper mit heller Kappe — hebt sich von Monstern ab. */
  private makeTrainer(): void {
    const w = 24;
    const h = 28;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(2, 8, w - 4, h - 8, 5);
    g.fillCircle(w / 2, 8, 7);
    g.generateTexture('trainer', w, h);
    g.destroy();
  }

  private makeChest(): void {
    const w = 28;
    const h = 22;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 6, w, h - 6, 3);
    g.fillRoundedRect(1, 0, w - 2, 9, 4);
    g.fillStyle(0x000000, 0.35);
    g.fillRect(w / 2 - 2, 4, 4, 10);
    g.generateTexture('chest', w, h);
    g.destroy();
  }

  /** Fangball: obere Hälfte voll, untere Hälfte transparent-angedeutet. */
  private makeBall(): void {
    const r = 9;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(r, r, r);
    g.fillStyle(0x000000, 0.45);
    g.fillRect(0, r - 1, r * 2, r + 1);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(r, r, 3);
    g.generateTexture('ball', r * 2, r * 2);
    g.destroy();
  }

  /** Kleiner Vierzack für Treffer-/Fang-Partikel. */
  private makeSpark(): void {
    const s = 10;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(s / 2, 0, s, s / 2, 0, s / 2);
    g.fillTriangle(s / 2, s, s, s / 2, 0, s / 2);
    g.generateTexture('spark', s, s);
    g.destroy();
  }
}
