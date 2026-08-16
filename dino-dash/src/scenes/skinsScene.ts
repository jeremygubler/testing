import { VIEW } from '../core/config';
import type { Action, Scene } from '../core/types';
import { drawDino } from '../assets/dino';
import { SKINS, type Skin } from '../assets/skins';
import type { Game } from '../game';
import { drawBackground } from '../render/background';
import { drawText, fillRoundRect } from '../render/draw';
import { drawEggIcon, formatNumber } from '../render/hud';
import { drawPath } from '../render/path';
import { drawButton, drawPanel, hitButton, INK, type Button } from '../render/ui';
import { audio } from '../systems/audio';
import { backButton, drawScrim, MENU_BIOME, MenuScene } from './menuScene';

const COLUMNS = 4;
const CELL_W = 196;
const CELL_H = 178;
const GRID_X = 62;
const GRID_Y = 116;
const GAP = 12;

export class SkinsScene implements Scene {
  private buttons: Button[] = [];
  private message = '';
  private messageTimer = 0;

  constructor(private game: Game) {}

  enter(): void {
    this.buttons = [backButton()];
  }

  onAction(action: Action): void {
    if (action === 'back' || action === 'confirm') this.goBack();
  }

  onTap(x: number, y: number): void {
    const button = hitButton(this.buttons, x, y);
    if (button?.id === 'back') {
      audio.play('button');
      this.goBack();
      return;
    }

    const index = this.cellAt(x, y);
    if (index === null) return;
    this.selectSkin(SKINS[index]);
  }

  private goBack(): void {
    this.game.setScene(new MenuScene(this.game));
  }

  private cellAt(x: number, y: number): number | null {
    for (let i = 0; i < SKINS.length; i++) {
      const { cx, cy } = this.cellOrigin(i);
      if (x >= cx && x <= cx + CELL_W && y >= cy && y <= cy + CELL_H) return i;
    }
    return null;
  }

  private cellOrigin(index: number) {
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    return {
      cx: GRID_X + column * (CELL_W + GAP),
      cy: GRID_Y + row * (CELL_H + GAP),
    };
  }

  private selectSkin(skin: Skin): void {
    const save = this.game.save;

    if (save.unlockedSkins.includes(skin.id)) {
      save.selectedSkin = skin.id;
      audio.play('button');
      this.flash(`${skin.name} ausgewählt!`);
      this.game.persist();
      return;
    }

    if (save.eggs < skin.cost) {
      audio.play('hit');
      this.flash(`Noch ${formatNumber(skin.cost - save.eggs)} Eier nötig`);
      return;
    }

    save.eggs -= skin.cost;
    save.unlockedSkins.push(skin.id);
    save.selectedSkin = skin.id;
    audio.play('unlock');
    this.flash(`${skin.name} freigeschaltet!`);
    this.game.persist();
    // Unlocking the last dino completes an achievement; award it here rather
    // than making the player finish a run to hear about it.
    this.game.awardIdleAchievements();
  }

  private flash(text: string): void {
    this.message = text;
    this.messageTimer = 2.2;
  }

  update(dt: number): void {
    if (this.messageTimer > 0) this.messageTimer -= dt;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    drawBackground(ctx, this.game.time * 6, this.game.time, MENU_BIOME);
    drawPath(ctx, this.game.time * 6, MENU_BIOME);
    drawScrim(ctx);

    drawText(ctx, 'Wähle deinen Dino', VIEW.W / 2, 56, {
      size: 38,
      color: '#ffffff',
      outline: '#4a3559',
      outlineWidth: 7,
    });

    this.drawBalance(ctx);
    SKINS.forEach((skin, index) => this.drawCell(ctx, skin, index));

    for (const button of this.buttons) drawButton(ctx, button);

    if (this.messageTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.messageTimer / 0.4);
      drawText(ctx, this.message, VIEW.W / 2, VIEW.H - 44, {
        size: 21,
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
    fillRoundRect(ctx, x, 34, w, 44, 22, 'rgba(255, 250, 242, 0.92)');
    drawEggIcon(ctx, x + 28, 56, 13);
    drawText(ctx, formatNumber(this.game.save.eggs), x + 50, 57, {
      size: 22,
      align: 'left',
      color: '#e0a92e',
    });
  }

  private drawCell(ctx: CanvasRenderingContext2D, skin: Skin, index: number): void {
    const { cx, cy } = this.cellOrigin(index);
    const save = this.game.save;
    const unlocked = save.unlockedSkins.includes(skin.id);
    const selected = save.selectedSkin === skin.id;
    const affordable = save.eggs >= skin.cost;

    drawPanel(ctx, cx, cy, CELL_W, CELL_H, 20);

    if (selected) {
      ctx.save();
      ctx.strokeStyle = '#6fcf97';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(cx + 2, cy + 2, CELL_W - 4, CELL_H - 4, 20);
      ctx.stroke();
      ctx.restore();
    }

    // Preview dino, greyed out while still locked.
    ctx.save();
    if (!unlocked) ctx.globalAlpha = 0.32;
    drawDino(ctx, cx + CELL_W / 2, cy + 106, 62, {
      runPhase: this.game.time * 5 + index,
      duck: 0,
      airborne: false,
      lean: Math.sin(this.game.time * 1.1 + index) * 0.2,
      spin: 0,
      time: this.game.time + index * 0.7,
    }, skin);
    ctx.restore();

    drawText(ctx, skin.name, cx + CELL_W / 2, cy + 128, { size: 18, color: INK });

    if (selected) {
      drawText(ctx, 'Ausgewählt', cx + CELL_W / 2, cy + 154, { size: 14, color: '#5aa877' });
    } else if (unlocked) {
      drawText(ctx, 'Tippen zum Wählen', cx + CELL_W / 2, cy + 154, {
        size: 13,
        color: '#8a7a9a',
        weight: 'normal',
      });
    } else {
      drawEggIcon(ctx, cx + CELL_W / 2 - 26, cy + 153, 10);
      drawText(ctx, formatNumber(skin.cost), cx + CELL_W / 2 - 8, cy + 154, {
        size: 16,
        align: 'left',
        color: affordable ? '#e0a92e' : '#b3a8bf',
      });
    }
  }
}
