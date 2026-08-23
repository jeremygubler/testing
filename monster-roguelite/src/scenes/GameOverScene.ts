import Phaser from 'phaser';
import { COLORS, VIEW_H, VIEW_W } from '../config/GameConfig';
import type { RunStats } from '../core/RunState';
import { getSpecies } from '../data/monsters';
import type { Relic } from '../data/relics';
import { TYPE_COLORS } from '../data/types';
import { loadMeta } from '../meta/MetaSave';
import { Button, FONT, heading } from '../ui/Widgets';

export interface GameOverData {
  stats: RunStats;
  floor: number;
  earned: number;
  relics: { relic: Relic; stacks: number }[];
  team: string[];
}

/**
 * Abschlussbildschirm mit Run-Statistik. Der Meta-Save wurde bereits in
 * `GameScene.endRun()` geschrieben — hier wird nur noch angezeigt.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: GameOverData): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.cameras.main.fadeIn(400, 0, 0, 0);

    const meta = loadMeta();
    const duration = Math.max(1, Math.round((Date.now() - data.stats.startedAt) / 1000));

    this.add
      .text(VIEW_W / 2, 52, 'RUN BEENDET', {
        fontFamily: FONT,
        fontSize: '38px',
        color: '#f87171',
      })
      .setOrigin(0.5);

    this.add
      .text(VIEW_W / 2, 88, `Gefallen auf Etage ${data.floor}`, {
        fontFamily: FONT,
        fontSize: '15px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    // --- Statistiken -------------------------------------------------------
    heading(this, 90, 132, 'RUN-STATISTIK', 340);
    const rows: [string, string][] = [
      ['Etagen abgeschlossen', String(data.stats.floorsCleared)],
      ['Räume geräumt', String(data.stats.roomsCleared)],
      ['Gegner besiegt', String(data.stats.kills)],
      ['Bosse besiegt', String(data.stats.bossesDefeated)],
      ['Monster gefangen', String(data.stats.catches)],
      ['Relikte eingesammelt', String(data.stats.relicsFound)],
      ['Schaden verursacht', String(Math.round(data.stats.damageDealt))],
      ['Dauer', `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`],
    ];
    rows.forEach(([label, value], i) => {
      const y = 168 + i * 24;
      this.add.text(90, y, label, { fontFamily: FONT, fontSize: '13px', color: COLORS.textDim });
      this.add
        .text(430, y, value, { fontFamily: FONT, fontSize: '13px', color: COLORS.text })
        .setOrigin(1, 0);
    });

    // --- Beute -------------------------------------------------------------
    heading(this, 530, 132, 'RELIKTE DIESES RUNS', 340);
    if (data.relics.length === 0) {
      this.add.text(530, 168, 'Keine — dieses Mal blieb die Truhe zu.', {
        fontFamily: FONT,
        fontSize: '12px',
        color: COLORS.textDim,
      });
    }
    data.relics.slice(0, 8).forEach((entry, i) => {
      const y = 168 + i * 24;
      this.add.image(538, y + 8, 'orb').setTint(entry.relic.color).setDisplaySize(14, 14);
      this.add.text(552, y, `${entry.relic.name}${entry.stacks > 1 ? ` ×${entry.stacks}` : ''}`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#' + entry.relic.color.toString(16).padStart(6, '0'),
      });
    });
    if (data.relics.length > 8) {
      this.add.text(552, 168 + 8 * 24, `… und ${data.relics.length - 8} weitere`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: COLORS.textDim,
      });
    }

    // --- Team --------------------------------------------------------------
    heading(this, 90, 386, 'TEAM AM ENDE', VIEW_W - 180);
    data.team.forEach((id, i) => {
      const species = getSpecies(id);
      const x = 96 + i * 190;
      this.add.image(x + 10, 434, 'orb').setTint(TYPE_COLORS[species.type]).setDisplaySize(22, 22);
      this.add.text(x + 28, 424, species.name, {
        fontFamily: FONT,
        fontSize: '14px',
        color: COLORS.text,
      });
    });

    // --- Belohnung ---------------------------------------------------------
    this.add
      .text(VIEW_W / 2, 486, `✦ ${data.earned} Ätherstaub gesichert`, {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#fbbf24',
      })
      .setOrigin(0.5);
    this.add
      .text(VIEW_W / 2, 512, `Gesamtguthaben: ${meta.currency}`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    new Button(
      this,
      VIEW_W / 2,
      VIEW_H - 44,
      'ZURÜCK INS BASISLAGER',
      { width: 280, height: 40, fill: 0x232a42, hover: 0x36406a, fontSize: '16px' },
      () => this.scene.start('Hub'),
    );

    // Enter/Leertaste als Abkürzung.
    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('Hub'));
    this.input.keyboard?.once('keydown-SPACE', () => this.scene.start('Hub'));
  }
}
