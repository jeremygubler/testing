import { VIEW } from './core/config';
import { Input } from './core/input';
import type { Scene } from './core/types';
import { SKINS } from './assets/skins';
import { drawText, fillRoundRect } from './render/draw';
import { evaluateAchievements, type AchievementContext } from './systems/achievements';
import { audio } from './systems/audio';
import { loadSave, writeSave, type SaveData } from './systems/storage';

interface Toast {
  icon: string;
  title: string;
  subtitle: string;
  life: number;
}

const TOAST_DURATION = 3.4;

/**
 * Application shell: owns the canvas, the frame loop, the save file and the
 * active scene. Scenes stay small because everything shared lives here.
 */
export class Game {
  readonly ctx: CanvasRenderingContext2D;
  readonly input: Input;
  save: SaveData;
  /** Seconds since start, used for all idle animation. */
  time = 0;

  private scene: Scene | null = null;
  private pendingScene: Scene | null = null;
  private toasts: Toast[] = [];
  private lastFrame = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is not available');
    this.ctx = context;
    this.input = new Input(canvas);
    this.save = loadSave();
    audio.setMuted(this.save.muted);

    // Losing focus should never cost a run.
    const blur = () => this.scene?.onBlur?.();
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) blur();
    });
  }

  start(scene: Scene): void {
    this.setScene(scene);
    this.lastFrame = performance.now();
    requestAnimationFrame(this.frame);
  }

  /** Scene swaps are deferred to the end of the frame to avoid re-entrancy. */
  setScene(scene: Scene): void {
    if (!this.scene) {
      this.scene = scene;
      scene.enter?.();
      return;
    }
    this.pendingScene = scene;
  }

  persist(): void {
    writeSave(this.save);
  }

  toast(icon: string, title: string, subtitle: string): void {
    this.toasts.push({ icon, title, subtitle, life: TOAST_DURATION });
  }

  /**
   * Awards any achievement whose condition now holds. Called every frame
   * during a run so milestones pop the moment they happen, and again when a
   * run ends for the ones that can only be judged then.
   */
  awardAchievements(context: Omit<AchievementContext, 'totalSkins' | 'unlockedSkins'>): void {
    const earned = evaluateAchievements(
      {
        ...context,
        unlockedSkins: this.save.unlockedSkins.length,
        totalSkins: SKINS.length,
      },
      this.save.achievements,
    );
    if (earned.length === 0) return;

    for (const achievement of earned) {
      this.save.achievements.push(achievement.id);
      this.toast(achievement.icon, achievement.name, achievement.description);
    }
    audio.play('achievement');
    this.persist();
  }

  /**
   * Re-checks the achievements that depend on the save file rather than on a
   * run, so unlocking the last dino is celebrated right there in the shop.
   */
  awardIdleAchievements(): void {
    this.awardAchievements({
      eggs: 0,
      distance: 0,
      score: 0,
      eggsWhileMagnet: 0,
      shieldSaves: 0,
      topSpeed: 0,
      eggsAllTime: this.save.eggsAllTime,
      runFinished: false,
    });
  }

  private frame = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.time += dt;

    const actions = this.input.drainActions();
    const taps = this.input.drainTaps();
    if (actions.length > 0 || taps.length > 0) audio.unlock();

    const scene = this.scene;
    if (scene) {
      for (const action of actions) scene.onAction?.(action);
      for (const tap of taps) scene.onTap?.(tap.x, tap.y);
      scene.update(dt);
      scene.draw(this.ctx);
    }

    this.updateToasts(dt);
    this.drawToasts(this.ctx);

    if (this.pendingScene) {
      this.scene?.exit?.();
      this.scene = this.pendingScene;
      this.pendingScene = null;
      this.scene.enter?.();
    }

    requestAnimationFrame(this.frame);
  };

  private updateToasts(dt: number): void {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= dt;
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1);
    }
  }

  private drawToasts(ctx: CanvasRenderingContext2D): void {
    this.toasts.forEach((toast, index) => {
      const age = TOAST_DURATION - toast.life;
      // Slide in quickly, hold, then fade out.
      const slide = Math.min(1, age / 0.28);
      const fade = Math.min(1, toast.life / 0.5);
      const w = 330;
      const h = 66;
      const x = (VIEW.W - w) / 2;
      const y = -h + slide * (26 + index * (h + 10) + h);

      ctx.save();
      ctx.globalAlpha = fade;
      ctx.shadowColor = 'rgba(59, 42, 74, 0.3)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;
      fillRoundRect(ctx, x, y, w, h, 18, '#fffaf2');
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = fade;
      fillRoundRect(ctx, x + 10, y + 10, 46, 46, 14, '#ffe3a8');
      drawText(ctx, toast.icon, x + 33, y + 34, { size: 26 });
      drawText(ctx, toast.title, x + 70, y + 26, {
        size: 19,
        align: 'left',
        color: '#4a3559',
      });
      drawText(ctx, toast.subtitle, x + 70, y + 47, {
        size: 14,
        align: 'left',
        color: '#8a7a9a',
        weight: 'normal',
      });
      ctx.restore();
    });
  }
}
