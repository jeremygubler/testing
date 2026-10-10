import { MAX_UPGRADE_LEVEL } from '../systems/storage';
import { powerUpDuration, UPGRADE_COST, VIEW } from '../core/config';
import type { Action, PowerUpKind, Scene } from '../core/types';
import { drawPowerUpBadge, POWERUP_COLOR, POWERUP_LABEL } from '../entities/powerup';
import type { Game } from '../game';
import { drawBackground } from '../render/background';
import { drawText, fillRoundRect } from '../render/draw';
import { drawEggIcon, formatNumber } from '../render/hud';
import { drawPath } from '../render/path';
import { drawButton, drawPanel, hitButton, INK, type Button } from '../render/ui';
import { audio } from '../systems/audio';
import { backButton, drawScrim, MENU_BIOME, MenuScene } from './menuScene';

const KINDS: PowerUpKind[] = ['magnet', 'shield', 'boost', 'spring'];

const DESCRIPTION: Record<PowerUpKind, string> = {
  magnet: 'Zieht Eier aus der Umgebung an',
  shield: 'Überlebt einen Treffer',
  boost: 'Mehr Tempo und mehr Punkte',
  spring: 'Erlaubt einen zweiten Sprung',
};

const ROW_X = 96;
const ROW_W = VIEW.W - ROW_X * 2;
const ROW_H = 84;
const ROW_Y = 128;
const ROW_GAP = 10;

/** Spends eggs to extend how long each power-up lasts. */
export class UpgradesScene implements Scene {
  private buttons: Button[] = [];
  private message = '';
  private messageTimer = 0;

  constructor(private game: Game) {}

  enter(): void {
    this.rebuild();
  }

  private rebuild(): void {
    const save = this.game.save;
    this.buttons = [backButton()];

    KINDS.forEach((kind, index) => {
      const level = save.upgrades[kind];
      const maxed = level >= MAX_UPGRADE_LEVEL;
      const cost = maxed ? 0 : UPGRADE_COST[level];
      this.buttons.push({
        id: `buy:${kind}`,
        x: ROW_X + ROW_W - 190,
        y: ROW_Y + index * (ROW_H + ROW_GAP) + 18,
        w: 168,
        h: 48,
        label: maxed ? 'Maximal' : `${formatNumber(cost)} Eier`,
        color: maxed ? '#b8a6d9' : '#6fcf97',
        disabled: maxed,
      });
    });
  }

  onAction(action: Action): void {
    if (action === 'back' || action === 'confirm') this.goBack();
  }

  onTap(x: number, y: number): void {
    const button = hitButton(this.buttons, x, y);
    if (!button) return;

    if (button.id === 'back') {
      audio.play('button');
      this.goBack();
      return;
    }
    this.buy(button.id.split(':')[1] as PowerUpKind);
  }

  private buy(kind: PowerUpKind): void {
    const save = this.game.save;
    const level = save.upgrades[kind];
    if (level >= MAX_UPGRADE_LEVEL) return;

    const cost = UPGRADE_COST[level];
    if (save.eggs < cost) {
      audio.play('hit');
      this.flash(`Noch ${formatNumber(cost - save.eggs)} Eier nötig`);
      return;
    }

    save.eggs -= cost;
    save.upgrades[kind] = level + 1;
    audio.play('unlock');
    this.flash(`${POWERUP_LABEL[kind]} auf Stufe ${level + 1}!`);
    this.game.persist();
    this.rebuild();
  }

  private flash(text: string): void {
    this.message = text;
    this.messageTimer = 2.2;
  }

  private goBack(): void {
    this.game.setScene(new MenuScene(this.game));
  }

  update(dt: number): void {
    if (this.messageTimer > 0) this.messageTimer -= dt;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    drawBackground(ctx, this.game.time * 6, this.game.time, MENU_BIOME);
    drawPath(ctx, this.game.time * 6, MENU_BIOME);
    drawScrim(ctx);

    drawText(ctx, 'Power-Ups verbessern', VIEW.W / 2, 52, {
      size: 36,
      color: '#ffffff',
      outline: '#4a3559',
      outlineWidth: 7,
    });
    this.drawBalance(ctx);

    KINDS.forEach((kind, index) => this.drawRow(ctx, kind, index));
    for (const button of this.buttons) drawButton(ctx, button);

    if (this.messageTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.messageTimer / 0.4);
      drawText(ctx, this.message, VIEW.W / 2, VIEW.H - 40, {
        size: 20,
        color: '#ffffff',
        outline: '#4a3559',
        outlineWidth: 5,
      });
      ctx.restore();
    }
  }

  private drawBalance(ctx: CanvasRenderingContext2D): void {
    const w = 150;
    const x = VIEW.W - w - 40;
    fillRoundRect(ctx, x, 30, w, 44, 22, 'rgba(255, 250, 242, 0.92)');
    drawEggIcon(ctx, x + 28, 52, 13);
    drawText(ctx, formatNumber(this.game.save.eggs), x + 50, 53, {
      size: 22,
      align: 'left',
      color: '#e0a92e',
    });
  }

  private drawRow(ctx: CanvasRenderingContext2D, kind: PowerUpKind, index: number): void {
    const y = ROW_Y + index * (ROW_H + ROW_GAP);
    const level = this.game.save.upgrades[kind];
    const color = POWERUP_COLOR[kind];

    drawPanel(ctx, ROW_X, y, ROW_W, ROW_H, 20);
    drawPowerUpBadge(ctx, kind, ROW_X + 48, y + ROW_H / 2, 28);

    drawText(ctx, POWERUP_LABEL[kind], ROW_X + 90, y + 26, {
      size: 21,
      align: 'left',
      color: INK,
    });
    drawText(ctx, DESCRIPTION[kind], ROW_X + 90, y + 50, {
      size: 14,
      align: 'left',
      color: '#8a7a9a',
      weight: 'normal',
    });

    // Current duration, and what the next level would make it.
    const current = powerUpDuration(kind, level);
    const next = powerUpDuration(kind, level + 1);
    const durationText =
      level >= MAX_UPGRADE_LEVEL
        ? `${current.toFixed(0)} s`
        : `${current.toFixed(0)} s  →  ${next.toFixed(0)} s`;
    drawText(ctx, durationText, ROW_X + 90, y + 70, {
      size: 14,
      align: 'left',
      color: color,
    });

    // Level pips, kept clear of the buy button that starts 190px from the edge.
    for (let i = 0; i < MAX_UPGRADE_LEVEL; i++) {
      const px = ROW_X + ROW_W - 258 + i * 20;
      fillRoundRect(ctx, px, y + ROW_H / 2 - 7, 14, 14, 7, i < level ? color : '#ded7e6');
    }
  }
}
