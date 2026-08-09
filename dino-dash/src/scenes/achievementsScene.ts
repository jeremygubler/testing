import { VIEW } from '../core/config';
import type { Action, Scene } from '../core/types';
import type { Game } from '../game';
import { drawBackground } from '../render/background';
import { drawText, fillRoundRect } from '../render/draw';
import { drawPath } from '../render/path';
import { drawButton, drawPanel, hitButton, INK, type Button } from '../render/ui';
import { ACHIEVEMENTS, type Achievement } from '../systems/achievements';
import { audio } from '../systems/audio';
import { backButton, drawScrim, MenuScene } from './menuScene';

const COLUMNS = 2;
const ROW_W = 410;
const ROW_H = 76;
const GRID_X = 58;
const GRID_Y = 108;
const GAP_X = 24;
const GAP_Y = 10;

export class AchievementsScene implements Scene {
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
    drawBackground(ctx, this.game.time * 6, this.game.time);
    drawPath(ctx, this.game.time * 6);
    drawScrim(ctx);

    const unlocked = this.game.save.achievements.length;
    drawText(ctx, 'Erfolge', VIEW.W / 2, 48, {
      size: 38,
      color: '#ffffff',
      outline: '#4a3559',
      outlineWidth: 7,
    });
    drawText(ctx, `${unlocked} von ${ACHIEVEMENTS.length} freigeschaltet`, VIEW.W / 2, 80, {
      size: 16,
      color: '#ffe3a8',
      outline: '#4a3559',
      outlineWidth: 4,
    });

    ACHIEVEMENTS.forEach((achievement, index) => this.drawRow(ctx, achievement, index));
    for (const button of this.buttons) drawButton(ctx, button);
  }

  private drawRow(ctx: CanvasRenderingContext2D, achievement: Achievement, index: number): void {
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const x = GRID_X + column * (ROW_W + GAP_X);
    const y = GRID_Y + row * (ROW_H + GAP_Y);
    const earned = this.game.save.achievements.includes(achievement.id);

    drawPanel(ctx, x, y, ROW_W, ROW_H, 18);

    ctx.save();
    if (!earned) ctx.globalAlpha = 0.45;
    fillRoundRect(ctx, x + 12, y + 14, 48, 48, 14, earned ? '#ffe3a8' : '#ded7e6');
    drawText(ctx, earned ? achievement.icon : '🔒', x + 36, y + 38, { size: 24 });

    drawText(ctx, achievement.name, x + 74, y + 28, {
      size: 18,
      align: 'left',
      color: earned ? INK : '#8a7a9a',
    });
    drawText(ctx, achievement.description, x + 74, y + 51, {
      size: 13,
      align: 'left',
      color: '#8a7a9a',
      weight: 'normal',
    });
    ctx.restore();
  }
}
