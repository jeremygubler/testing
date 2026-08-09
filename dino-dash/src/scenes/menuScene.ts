import { VIEW } from '../core/config';
import type { Action, Scene } from '../core/types';
import { drawDino } from '../assets/dino';
import { getSkin } from '../assets/skins';
import type { Game } from '../game';
import { drawBackground } from '../render/background';
import { drawText, fillCircle, fillRoundRect } from '../render/draw';
import { drawEggIcon, formatNumber } from '../render/hud';
import { drawPath } from '../render/path';
import { drawButton, drawPanel, hitButton, INK, type Button } from '../render/ui';
import { audio } from '../systems/audio';
import { AchievementsScene } from './achievementsScene';
import { GameScene } from './gameScene';
import { SkinsScene } from './skinsScene';

const MUTE_BUTTON = { x: VIEW.W - 58, y: 22, r: 24 };

export class MenuScene implements Scene {
  private buttons: Button[] = [];
  /** Keeps the backdrop scrolling gently behind the menu. */
  private scroll = 0;
  private bounce = 0;

  constructor(private game: Game) {}

  enter(): void {
    this.buildButtons();
  }

  private buildButtons(): void {
    const x = 552;
    const w = 336;
    this.buttons = [
      { id: 'play', x, y: 224, w, h: 68, label: 'Spielen', color: '#6fcf97' },
      { id: 'skins', x, y: 306, w, h: 52, label: 'Dinos', color: '#ff9fb0' },
      { id: 'achievements', x, y: 370, w, h: 52, label: 'Erfolge', color: '#b8a6d9' },
    ];
  }

  onAction(action: Action): void {
    if (action === 'confirm' || action === 'jump') this.start();
  }

  onTap(x: number, y: number): void {
    const dx = x - MUTE_BUTTON.x;
    const dy = y - MUTE_BUTTON.y;
    if (dx * dx + dy * dy < MUTE_BUTTON.r * MUTE_BUTTON.r) {
      this.game.save.muted = !this.game.save.muted;
      audio.setMuted(this.game.save.muted);
      this.game.persist();
      audio.play('button');
      return;
    }

    const button = hitButton(this.buttons, x, y);
    if (!button) return;
    audio.play('button');

    if (button.id === 'play') this.start();
    else if (button.id === 'skins') this.game.setScene(new SkinsScene(this.game));
    else if (button.id === 'achievements') this.game.setScene(new AchievementsScene(this.game));
  }

  private start(): void {
    this.game.setScene(new GameScene(this.game));
  }

  update(dt: number): void {
    this.scroll += dt * 9;
    this.bounce += dt * 6;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    drawBackground(ctx, this.scroll, this.game.time);
    drawPath(ctx, this.scroll);

    this.drawTitle(ctx);
    this.drawMascot(ctx);
    for (const button of this.buttons) drawButton(ctx, button);
    this.drawStats(ctx);
    this.drawMuteButton(ctx);
  }

  private drawTitle(ctx: CanvasRenderingContext2D): void {
    const wobble = Math.sin(this.game.time * 1.6) * 4;
    ctx.save();
    ctx.translate(VIEW.W / 2, 104 + wobble);
    drawText(ctx, 'DINO DASH', 0, 0, {
      size: 74,
      color: '#ffd766',
      outline: '#4a3559',
      outlineWidth: 11,
    });
    drawText(ctx, 'Renn, kleiner Dino, renn!', 0, 52, {
      size: 20,
      color: '#ffffff',
      outline: '#4a3559',
      outlineWidth: 5,
    });
    ctx.restore();
  }

  private drawMascot(ctx: CanvasRenderingContext2D): void {
    const skin = getSkin(this.game.save.selectedSkin);
    const hop = Math.max(0, Math.sin(this.bounce)) * 16;
    drawDino(ctx, 286, 476 - hop, 132, {
      runPhase: this.bounce * 1.6,
      duck: 0,
      airborne: hop > 6,
      lean: Math.sin(this.game.time * 0.9) * 0.25,
      spin: 0,
      time: this.game.time,
    }, skin, 476);
  }

  private drawStats(ctx: CanvasRenderingContext2D): void {
    const save = this.game.save;
    const x = 552;
    const w = 336;
    const y = 442;
    const h = 118;
    drawPanel(ctx, x, y, w, h, 20);

    drawText(ctx, 'Rekord', x + 24, y + 30, { size: 15, align: 'left', color: '#8a7a9a', weight: 'normal' });
    drawText(ctx, formatNumber(save.highScore), x + w - 24, y + 30, {
      size: 20,
      align: 'right',
      color: INK,
    });

    drawText(ctx, 'Beste Strecke', x + 24, y + 60, { size: 15, align: 'left', color: '#8a7a9a', weight: 'normal' });
    drawText(ctx, `${formatNumber(save.bestDistance)} m`, x + w - 24, y + 60, {
      size: 20,
      align: 'right',
      color: INK,
    });

    drawEggIcon(ctx, x + 30, y + 90, 11);
    drawText(ctx, 'Eier', x + 48, y + 90, { size: 15, align: 'left', color: '#8a7a9a', weight: 'normal' });
    drawText(ctx, formatNumber(save.eggs), x + w - 24, y + 90, {
      size: 20,
      align: 'right',
      color: '#e0a92e',
    });
  }

  private drawMuteButton(ctx: CanvasRenderingContext2D): void {
    fillCircle(ctx, MUTE_BUTTON.x, MUTE_BUTTON.y + 12, MUTE_BUTTON.r, 'rgba(255, 250, 242, 0.9)');
    drawText(ctx, this.game.save.muted ? '🔇' : '🔊', MUTE_BUTTON.x, MUTE_BUTTON.y + 12, {
      size: 22,
    });
  }
}

/** Shared helper so the sub-menus get a consistent back button. */
export function backButton(): Button {
  return { id: 'back', x: 32, y: VIEW.H - 66, w: 150, h: 46, label: '← Zurück', color: '#b8a6d9' };
}

/** Translucent scrim used behind the sub-menu panels. */
export function drawScrim(ctx: CanvasRenderingContext2D): void {
  fillRoundRect(ctx, 0, 0, VIEW.W, VIEW.H, 0, 'rgba(45, 27, 61, 0.45)');
}
