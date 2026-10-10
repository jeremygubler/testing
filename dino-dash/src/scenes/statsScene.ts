import { VIEW } from '../core/config';
import type { Action, Scene } from '../core/types';
import { SKINS } from '../assets/skins';
import type { Game } from '../game';
import { drawBackground } from '../render/background';
import { drawText, fillRoundRect } from '../render/draw';
import { drawEggIcon, formatNumber } from '../render/hud';
import { drawPath } from '../render/path';
import { drawButton, drawPanel, hitButton, INK, type Button } from '../render/ui';
import { ACHIEVEMENTS } from '../systems/achievements';
import { audio } from '../systems/audio';
import { backButton, drawScrim, MENU_BIOME, MenuScene } from './menuScene';

/** Career totals and the best runs so far. */
export class StatsScene implements Scene {
  private buttons: Button[] = [];

  constructor(private game: Game) {}

  enter(): void {
    this.buttons = [backButton()];
  }

  onAction(action: Action): void {
    if (action === 'back' || action === 'confirm') this.goBack();
  }

  onTap(x: number, y: number): void {
    if (hitButton(this.buttons, x, y)?.id === 'back') {
      audio.play('button');
      this.goBack();
    }
  }

  private goBack(): void {
    this.game.setScene(new MenuScene(this.game));
  }

  update(): void {
    // Static screen; nothing to advance.
  }

  draw(ctx: CanvasRenderingContext2D): void {
    drawBackground(ctx, this.game.time * 6, this.game.time, MENU_BIOME);
    drawPath(ctx, this.game.time * 6, MENU_BIOME);
    drawScrim(ctx);

    drawText(ctx, 'Statistik', VIEW.W / 2, 50, {
      size: 36,
      color: '#ffffff',
      outline: '#4a3559',
      outlineWidth: 7,
    });

    this.drawTotals(ctx);
    this.drawBestRuns(ctx);
    for (const button of this.buttons) drawButton(ctx, button);
  }

  private drawTotals(ctx: CanvasRenderingContext2D): void {
    const save = this.game.save;
    const x = 58;
    const w = 400;
    const y = 96;
    const h = 336;
    drawPanel(ctx, x, y, w, h, 20);

    const rows: [string, string][] = [
      ['Läufe gespielt', formatNumber(save.runs)],
      ['Rekordpunktzahl', formatNumber(save.highScore)],
      ['Beste Strecke', `${formatNumber(save.bestDistance)} m`],
      ['Meiste Eier in einem Lauf', formatNumber(save.bestEggsInRun)],
      ['Eier insgesamt', formatNumber(save.eggsAllTime)],
      ['Dinos freigeschaltet', `${save.unlockedSkins.length} / ${SKINS.length}`],
      ['Erfolge', `${save.achievements.length} / ${ACHIEVEMENTS.length}`],
    ];

    rows.forEach(([label, value], index) => {
      const rowY = y + 38 + index * 32;
      drawText(ctx, label, x + 24, rowY, {
        size: 15,
        align: 'left',
        color: '#8a7a9a',
        weight: 'normal',
      });
      drawText(ctx, value, x + w - 24, rowY, { size: 18, align: 'right', color: INK });
    });

    // Egg balance highlighted at the bottom.
    const balanceY = y + h - 42;
    fillRoundRect(ctx, x + 20, balanceY - 18, w - 40, 40, 12, '#fff3d6');
    drawEggIcon(ctx, x + 44, balanceY + 2, 12);
    drawText(ctx, 'Eier zum Ausgeben', x + 64, balanceY + 3, {
      size: 15,
      align: 'left',
      color: '#8a7a9a',
      weight: 'normal',
    });
    drawText(ctx, formatNumber(save.eggs), x + w - 44, balanceY + 3, {
      size: 20,
      align: 'right',
      color: '#e0a92e',
    });
  }

  private drawBestRuns(ctx: CanvasRenderingContext2D): void {
    const scores = this.game.save.scores;
    const x = 486;
    const w = 416;
    const y = 96;
    const h = 336;
    drawPanel(ctx, x, y, w, h, 20);

    drawText(ctx, 'Beste Läufe', x + w / 2, y + 30, { size: 20, color: INK });

    if (scores.length === 0) {
      drawText(ctx, 'Noch keine Läufe beendet.', x + w / 2, y + h / 2, {
        size: 15,
        color: '#8a7a9a',
        weight: 'normal',
      });
      return;
    }

    scores.forEach((entry, index) => {
      const rowY = y + 62 + index * 46;
      fillRoundRect(ctx, x + 16, rowY - 16, w - 32, 40, 12, index === 0 ? '#fff3d6' : '#f4f0f7');

      drawText(ctx, `${index + 1}.`, x + 34, rowY + 3, { size: 15, color: '#8a7a9a' });
      drawText(ctx, formatNumber(entry.score), x + 58, rowY + 3, {
        size: 19,
        align: 'left',
        color: INK,
      });
      drawText(ctx, `${formatNumber(entry.distance)} m`, x + 250, rowY + 3, {
        size: 14,
        align: 'right',
        color: '#8a7a9a',
        weight: 'normal',
      });
      drawEggIcon(ctx, x + 268, rowY + 2, 9);
      drawText(ctx, formatNumber(entry.eggs), x + 282, rowY + 3, {
        size: 14,
        align: 'left',
        color: '#e0a92e',
        weight: 'normal',
      });
      drawText(ctx, entry.date, x + w - 18, rowY + 3, {
        size: 12,
        align: 'right',
        color: '#b3a8bf',
        weight: 'normal',
      });
    });
  }
}
