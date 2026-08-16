import {
  BOOST_MULTIPLIER,
  DESPAWN_Z,
  DISTANCE_SCORE,
  EGG_SCORE,
  MAGNET_RADIUS,
  MAX_SPEED,
  PLAYER_Z,
  powerUpDuration,
  SPEED_ACCEL,
  START_SPEED,
  VIEW,
} from '../core/config';
import { clamp, lerp, randRange } from '../core/math';
import { motionScale } from '../core/motion';
import type { Action, PowerUpKind, Scene } from '../core/types';
import { getSkin } from '../assets/skins';
import { drawEgg, type Egg } from '../entities/egg';
import { drawObstacle, type Obstacle } from '../entities/obstacle';
import { Player } from '../entities/player';
import { drawPowerUp, POWERUP_COLOR, POWERUP_LABEL, type PowerUp } from '../entities/powerup';
import type { Game } from '../game';
import { drawBackground } from '../render/background';
import { biomeAt, biomeIndexAt, BIOMES } from '../render/biome';
import { project } from '../render/camera';
import { drawText, fillCircle } from '../render/draw';
import { drawEggIcon, drawHud, formatNumber, type ActiveTimer } from '../render/hud';
import { drawPath } from '../render/path';
import { drawButton, drawPanel, hitButton, INK, type Button } from '../render/ui';
import { audio } from '../systems/audio';
import { recordScore } from '../systems/storage';
import { hitsObstacle, touchesEgg, touchesPowerUp } from '../systems/collision';
import { Particles } from '../systems/particles';
import { Spawner } from '../systems/spawner';
// Scene modules reference each other only from inside methods, so the ES module
// cycle resolves before any navigation happens.
import { MenuScene } from './menuScene';

type RunState = 'running' | 'paused' | 'dying' | 'over';

interface Renderable {
  z: number;
  draw: () => void;
}

const POWERUP_KINDS: PowerUpKind[] = ['magnet', 'shield', 'boost', 'spring'];

export class GameScene implements Scene {
  private player = new Player();
  private obstacles: Obstacle[] = [];
  private eggs: Egg[] = [];
  private powerUps: PowerUp[] = [];
  private spawner = new Spawner();
  private particles = new Particles();

  private speed = START_SPEED;
  private distance = 0;
  private score = 0;
  private eggCount = 0;
  private state: RunState = 'running';
  private timers: Record<PowerUpKind, number> = { magnet: 0, shield: 0, boost: 0, spring: 0 };
  /** Full duration of each active power-up, so the HUD bar drains correctly. */
  private durations: Record<PowerUpKind, number> = { magnet: 1, shield: 1, boost: 1, spring: 1 };

  private eggsWhileMagnet = 0;
  private shieldSaves = 0;
  private topSpeed = START_SPEED;

  private invulnerable = 0;
  private deathTimer = 0;
  private shake = 0;
  private lastStepPhase = 0;
  private wasAirborne = false;
  private isNewRecord = false;
  /** Which biome the player was in last frame, to announce changes. */
  private biomeIndex = 0;
  private buttons: Button[] = [];

  constructor(private game: Game) {}

  enter(): void {
    this.player.reset();
    this.obstacles = [];
    this.eggs = [];
    this.powerUps = [];
    this.spawner.reset();
    this.particles.clear();
    this.speed = START_SPEED;
    this.distance = 0;
    this.score = 0;
    this.eggCount = 0;
    this.state = 'running';
    this.timers = { magnet: 0, shield: 0, boost: 0, spring: 0 };
    this.durations = { magnet: 1, shield: 1, boost: 1, spring: 1 };
    this.eggsWhileMagnet = 0;
    this.shieldSaves = 0;
    this.topSpeed = START_SPEED;
    this.invulnerable = 0;
    this.deathTimer = 0;
    this.shake = 0;
    this.lastStepPhase = 0;
    this.wasAirborne = false;
    this.isNewRecord = false;
    this.biomeIndex = 0;
  }

  onAction(action: Action): void {
    if (this.state === 'over') {
      if (action === 'back') this.goToMenu();
      else if (action === 'confirm' || action === 'jump') this.restart();
      return;
    }

    if (action === 'pause' || action === 'back') {
      this.state = this.state === 'paused' ? 'running' : 'paused';
      audio.play('button');
      return;
    }
    if (this.state !== 'running') return;

    switch (action) {
      case 'left':
      case 'right':
        this.player.moveLane(action === 'left' ? -1 : 1);
        break;
      case 'jump': {
        const kind = this.player.jump(this.timers.spring > 0);
        if (kind === 'single') {
          audio.play('jump');
          const feet = this.playerScreenPosition();
          this.particles.dust(feet.x, feet.y, 7, feet.scale / 60);
        } else if (kind === 'double') {
          audio.play('doubleJump');
          const feet = this.playerScreenPosition();
          this.particles.sparkle(feet.x, feet.y - 10, 14, '#9d7bf0', 130);
        }
        break;
      }
      case 'duck':
        if (this.player.duck()) audio.play('duck');
        break;
    }
  }

  onBlur(): void {
    if (this.state === 'running') this.state = 'paused';
  }

  onTap(x: number, y: number): void {
    const button = hitButton(this.buttons, x, y);
    if (!button) {
      if (this.state === 'over') this.restart();
      return;
    }
    audio.play('button');
    if (button.id === 'again') this.restart();
    else if (button.id === 'menu') this.goToMenu();
    else if (button.id === 'resume') this.state = 'running';
  }

  update(dt: number): void {
    this.particles.update(dt);

    if (this.state === 'paused' || this.state === 'over') return;

    if (this.state === 'dying') {
      this.deathTimer -= dt;
      this.speed = Math.max(0, this.speed - dt * 42);
      this.moveWorld(this.speed * dt);
      this.player.update(dt, this.speed);
      if (this.deathTimer <= 0) this.finishRun();
      return;
    }

    this.speed = Math.min(MAX_SPEED, this.speed + SPEED_ACCEL * dt);
    this.topSpeed = Math.max(this.topSpeed, this.speed);

    const effectiveSpeed = this.speed * (this.timers.boost > 0 ? BOOST_MULTIPLIER : 1);
    const travelled = effectiveSpeed * dt;
    this.distance += travelled;
    this.score += travelled * DISTANCE_SCORE * (this.timers.boost > 0 ? 1.5 : 1);

    this.moveWorld(travelled);
    this.player.update(dt, this.speed);
    this.spawner.update(travelled, this.speed, {
      obstacles: this.obstacles,
      eggs: this.eggs,
      powerUps: this.powerUps,
    });

    this.tickTimers(dt);
    if (this.timers.magnet > 0) this.applyMagnet(dt);
    this.handlePickups();
    this.handleObstacles();
    this.emitRunningParticles();
    // Checked every frame so a milestone is celebrated as it happens rather
    // than being held back until the run is over.
    this.game.awardAchievements(this.achievementContext(false));
    this.announceBiomeChange();

    if (this.invulnerable > 0) this.invulnerable -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.4);
  }

  /** Names each new stretch of the route as the player reaches it. */
  private announceBiomeChange(): void {
    const index = biomeIndexAt(this.distance);
    if (index === this.biomeIndex) return;
    this.biomeIndex = index;
    this.game.toast('🌍', BIOMES[index].name, 'Neuer Streckenabschnitt');
  }

  private moveWorld(travelled: number): void {
    for (const obstacle of this.obstacles) obstacle.z -= travelled;
    for (const egg of this.eggs) egg.z -= travelled;
    for (const powerUp of this.powerUps) powerUp.z -= travelled;

    this.obstacles = this.obstacles.filter((o) => o.z + o.halfDepth > DESPAWN_Z && !o.dead);
    this.eggs = this.eggs.filter((e) => e.z > DESPAWN_Z && !e.dead);
    this.powerUps = this.powerUps.filter((p) => p.z > DESPAWN_Z && !p.dead);
  }

  private tickTimers(dt: number): void {
    for (const kind of POWERUP_KINDS) {
      if (this.timers[kind] <= 0) continue;
      this.timers[kind] = Math.max(0, this.timers[kind] - dt);
    }
  }

  /** Pulls nearby eggs towards the dino while the magnet is active. */
  private applyMagnet(dt: number): void {
    const centreY = this.player.y + this.player.height / 2;
    for (const egg of this.eggs) {
      const dz = egg.z - PLAYER_Z;
      if (dz > 0 && dz < MAGNET_RADIUS) egg.magnetized = true;
      if (!egg.magnetized) continue;

      const pull = Math.min(1, dt * 7);
      egg.worldX = lerp(egg.worldX, this.player.worldX, pull);
      egg.y = lerp(egg.y, centreY, pull);
      // Extra closing speed along z so eggs actually reach the player.
      egg.z -= dz * Math.min(1, dt * 3.5);
    }
  }

  private handlePickups(): void {
    for (const egg of this.eggs) {
      if (egg.dead || !touchesEgg(this.player, egg)) continue;
      egg.dead = true;
      this.eggCount++;
      this.score += EGG_SCORE;
      if (this.timers.magnet > 0) this.eggsWhileMagnet++;
      audio.play('egg');
      const p = project(egg.worldX, egg.y, egg.z);
      this.particles.sparkle(p.x, p.y, 7, '#ffd766', 110);
    }

    for (const powerUp of this.powerUps) {
      if (powerUp.dead || !touchesPowerUp(this.player, powerUp)) continue;
      powerUp.dead = true;
      this.activatePowerUp(powerUp.kind);
    }
  }

  private activatePowerUp(kind: PowerUpKind): void {
    // Upgrades bought with eggs extend how long the effect lasts.
    const duration = powerUpDuration(kind, this.game.save.upgrades[kind]);
    this.timers[kind] = duration;
    this.durations[kind] = duration;
    audio.play('powerup');
    const feet = this.playerScreenPosition();
    this.particles.sparkle(feet.x, feet.y - feet.scale * 0.8, 22, POWERUP_COLOR[kind], 170);
    this.game.toast('✨', POWERUP_LABEL[kind], `${duration.toFixed(0)} Sekunden aktiv`);
  }

  private handleObstacles(): void {
    if (this.invulnerable > 0) return;

    for (const obstacle of this.obstacles) {
      if (obstacle.dead || !hitsObstacle(this.player, obstacle)) continue;

      if (this.timers.shield > 0) {
        // The shield absorbs the hit and clears the obstacle out of the way.
        this.timers.shield = 0;
        this.shieldSaves++;
        this.invulnerable = 0.7;
        obstacle.dead = true;
        this.shake = 0.5;
        audio.play('shieldBreak');
        const p = project(obstacle.worldX, 0.7, obstacle.z);
        this.particles.burst(p.x, p.y, 26, '#5ec8f2');
        return;
      }

      this.crash(obstacle);
      return;
    }
  }

  private crash(obstacle: Obstacle): void {
    this.state = 'dying';
    this.deathTimer = 0.85;
    this.player.crashed = true;
    this.player.vy = 7;
    this.shake = 1;
    audio.play('hit');
    const p = project(obstacle.worldX, 0.8, obstacle.z);
    this.particles.burst(p.x, p.y, 30, '#ffb35c');
    this.particles.dust(p.x, p.y + 20, 16, 1.6);
  }

  private emitRunningParticles(): void {
    const feet = this.playerScreenPosition();

    // One puff per footfall.
    if (!this.player.airborne) {
      const step = Math.floor(this.player.runPhase / Math.PI);
      if (step !== this.lastStepPhase) {
        this.lastStepPhase = step;
        this.particles.dust(feet.x, feet.y, 2, feet.scale / 70);
      }
    }

    if (this.wasAirborne && !this.player.airborne) {
      this.particles.dust(feet.x, feet.y, 9, feet.scale / 60);
    }
    this.wasAirborne = this.player.airborne;

    if (this.player.ducking) {
      this.particles.dust(feet.x + randRange(-10, 10), feet.y, 1, feet.scale / 80);
    }

    if (this.timers.boost > 0) {
      this.particles.sparkle(
        feet.x + randRange(-30, 30),
        feet.y - randRange(0, feet.scale),
        1,
        '#ffa94d',
        60,
      );
    }
  }

  private playerScreenPosition() {
    return project(this.player.worldX, this.player.y, PLAYER_Z);
  }

  /** Snapshot of the run in the shape the achievement rules expect. */
  private achievementContext(runFinished: boolean) {
    return {
      eggs: this.eggCount,
      distance: this.distance,
      score: this.score,
      eggsWhileMagnet: this.eggsWhileMagnet,
      shieldSaves: this.shieldSaves,
      topSpeed: this.topSpeed,
      // Lifetime total including the eggs of the run in progress.
      eggsAllTime: this.game.save.eggsAllTime + this.eggCount,
      runFinished,
    };
  }

  private finishRun(): void {
    this.state = 'over';
    const save = this.game.save;
    const finalScore = Math.floor(this.score);

    save.runs++;
    save.eggs += this.eggCount;
    save.eggsAllTime += this.eggCount;
    save.bestEggsInRun = Math.max(save.bestEggsInRun, this.eggCount);
    this.isNewRecord = finalScore > save.highScore;
    save.highScore = Math.max(save.highScore, finalScore);
    save.bestDistance = Math.max(save.bestDistance, Math.floor(this.distance));
    recordScore(save, finalScore, Math.floor(this.distance), this.eggCount);

    this.game.persist();
    audio.play('gameOver');
    // Catches the achievements that can only be judged once a run is over.
    this.game.awardAchievements(this.achievementContext(true));
  }

  private restart(): void {
    this.enter();
  }

  private goToMenu(): void {
    this.game.setScene(new MenuScene(this.game));
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    if (this.shake > 0) {
      const magnitude = this.shake * 12 * motionScale();
      ctx.translate(randRange(-magnitude, magnitude), randRange(-magnitude, magnitude));
    }

    const palette = biomeAt(this.distance);
    drawBackground(ctx, this.distance, this.game.time, palette);
    drawPath(ctx, this.distance, palette);
    this.drawWorld(ctx);
    this.particles.draw(ctx);
    ctx.restore();

    if (this.timers.boost > 0) this.drawBoostVignette(ctx);

    drawHud(
      ctx,
      {
        score: this.score,
        distance: this.distance,
        eggs: this.eggCount,
        highScore: this.game.save.highScore,
        speed: clamp((this.speed - START_SPEED) / (MAX_SPEED - START_SPEED), 0, 1),
        timers: this.activeTimers(),
        newRecord: this.score > this.game.save.highScore && this.game.save.highScore > 0,
      },
      this.game.time,
    );

    this.buttons = [];
    if (this.state === 'paused') this.drawPauseOverlay(ctx);
    else if (this.state === 'over') this.drawGameOverOverlay(ctx);
    else this.drawControlHint(ctx);
  }

  private activeTimers(): ActiveTimer[] {
    return POWERUP_KINDS.filter((kind) => this.timers[kind] > 0).map((kind) => ({
      kind,
      remaining: this.timers[kind],
      duration: this.durations[kind],
    }));
  }

  /** Draws every world object back to front so nearer things overlap. */
  private drawWorld(ctx: CanvasRenderingContext2D): void {
    const items: Renderable[] = [];

    for (const obstacle of this.obstacles) {
      items.push({ z: obstacle.z, draw: () => drawObstacle(ctx, obstacle, this.game.time) });
    }
    for (const egg of this.eggs) {
      items.push({ z: egg.z, draw: () => drawEgg(ctx, egg, this.game.time) });
    }
    for (const powerUp of this.powerUps) {
      items.push({ z: powerUp.z, draw: () => drawPowerUp(ctx, powerUp, this.game.time) });
    }
    items.push({ z: PLAYER_Z, draw: () => this.drawPlayer(ctx) });

    items.sort((a, b) => b.z - a.z);
    for (const item of items) item.draw();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const p = this.playerScreenPosition();
    const groundY = project(this.player.worldX, 0, PLAYER_Z).y;
    const skin = getSkin(this.game.save.selectedSkin);

    if (this.timers.magnet > 0) this.drawMagnetField(ctx, p.x, p.y, p.scale);

    // Flicker during post-shield invulnerability.
    const flicker = this.invulnerable > 0 && Math.floor(this.game.time * 18) % 2 === 0;
    ctx.save();
    if (flicker) ctx.globalAlpha = 0.5;
    this.player.draw(ctx, p.x, p.y, p.scale, skin, this.game.time, groundY);
    ctx.restore();

    if (this.timers.shield > 0) this.drawShieldBubble(ctx, p.x, p.y, p.scale);
  }

  private drawShieldBubble(
    ctx: CanvasRenderingContext2D,
    x: number,
    groundY: number,
    scale: number,
  ): void {
    const cy = groundY - scale * 0.8;
    const radius = scale * 1.15;
    const pulse = 0.5 + Math.sin(this.game.time * 5) * 0.5;
    const fading = this.timers.shield < 2 && Math.floor(this.game.time * 10) % 2 === 0;

    ctx.save();
    ctx.globalAlpha = fading ? 0.18 : 0.3 + pulse * 0.12;
    fillCircle(ctx, x, cy, radius, '#5ec8f2');
    ctx.globalAlpha = fading ? 0.4 : 0.85;
    ctx.strokeStyle = '#a8e6ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawMagnetField(
    ctx: CanvasRenderingContext2D,
    x: number,
    groundY: number,
    scale: number,
  ): void {
    const cy = groundY - scale * 0.8;
    ctx.save();
    ctx.strokeStyle = '#ff6f91';
    for (let i = 0; i < 3; i++) {
      const phase = (this.game.time * 1.2 + i / 3) % 1;
      ctx.globalAlpha = (1 - phase) * 0.4;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, cy, scale * (0.9 + phase * 1.9), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawBoostVignette(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    const gradient = ctx.createRadialGradient(
      VIEW.W / 2,
      VIEW.H / 2,
      VIEW.H * 0.3,
      VIEW.W / 2,
      VIEW.H / 2,
      VIEW.W * 0.66,
    );
    gradient.addColorStop(0, 'rgba(255, 169, 77, 0)');
    gradient.addColorStop(1, 'rgba(255, 140, 60, 0.35)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);

    // Streaks rushing past the edges of the screen.
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const t = (this.game.time * 2.2 + i * 0.1) % 1;
      const side = i % 2 === 0 ? -1 : 1;
      const x = VIEW.W / 2 + side * (VIEW.W * 0.18 + t * VIEW.W * 0.42);
      const y = VIEW.H * 0.3 + ((i * 53) % 100) / 100 * VIEW.H * 0.55;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + side * 46 * t, y + 12 * t);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawControlHint(ctx: CanvasRenderingContext2D): void {
    if (this.distance > 90) return;
    const alpha = clamp(1 - (this.distance - 55) / 35, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    drawText(ctx, '← → Spur wechseln · Leertaste springen · ↓ ducken', VIEW.W / 2, VIEW.H - 34, {
      size: 18,
      color: '#ffffff',
      outline: 'rgba(74, 53, 89, 0.55)',
      outlineWidth: 4,
    });
    ctx.restore();
  }

  private drawPauseOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(45, 27, 61, 0.55)';
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);

    const w = 380;
    const h = 240;
    const x = (VIEW.W - w) / 2;
    const y = (VIEW.H - h) / 2;
    drawPanel(ctx, x, y, w, h);
    drawText(ctx, 'Pause', VIEW.W / 2, y + 54, { size: 38, color: INK });
    drawText(ctx, 'P oder Esc zum Fortsetzen', VIEW.W / 2, y + 92, {
      size: 15,
      color: '#8a7a9a',
      weight: 'normal',
    });

    this.buttons = [
      { id: 'resume', x: x + 40, y: y + 120, w: w - 80, h: 50, label: 'Weiter', color: '#6fcf97' },
      { id: 'menu', x: x + 40, y: y + 180, w: w - 80, h: 44, label: 'Hauptmenü', color: '#b8a6d9' },
    ];
    for (const button of this.buttons) drawButton(ctx, button);
  }

  private drawGameOverOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(45, 27, 61, 0.6)';
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);

    const w = 440;
    const h = 380;
    const x = (VIEW.W - w) / 2;
    const y = (VIEW.H - h) / 2;
    drawPanel(ctx, x, y, w, h);

    drawText(ctx, 'Autsch!', VIEW.W / 2, y + 52, { size: 40, color: INK });

    if (this.isNewRecord) {
      const pulse = 0.75 + Math.sin(this.game.time * 6) * 0.25;
      ctx.save();
      ctx.globalAlpha = pulse;
      drawText(ctx, '🏆  NEUER REKORD!', VIEW.W / 2, y + 90, { size: 20, color: '#ff7f9c' });
      ctx.restore();
    } else {
      drawText(ctx, `Rekord: ${formatNumber(this.game.save.highScore)}`, VIEW.W / 2, y + 90, {
        size: 16,
        color: '#8a7a9a',
        weight: 'normal',
      });
    }

    drawText(ctx, formatNumber(Math.floor(this.score)), VIEW.W / 2, y + 138, {
      size: 52,
      color: '#ff9f68',
      outline: '#ffffff',
      outlineWidth: 5,
    });
    drawText(ctx, 'Punkte', VIEW.W / 2, y + 172, { size: 15, color: '#8a7a9a', weight: 'normal' });

    // Distance and eggs side by side.
    const statY = y + 214;
    drawText(ctx, `${Math.floor(this.distance)} m`, x + w * 0.32, statY, { size: 26, color: INK });
    drawText(ctx, 'Strecke', x + w * 0.32, statY + 26, {
      size: 13,
      color: '#8a7a9a',
      weight: 'normal',
    });

    drawEggIcon(ctx, x + w * 0.6, statY - 2, 12);
    drawText(ctx, `${this.eggCount}`, x + w * 0.68, statY, { size: 26, align: 'left', color: INK });
    drawText(ctx, 'Eier gesammelt', x + w * 0.66, statY + 26, {
      size: 13,
      color: '#8a7a9a',
      weight: 'normal',
    });

    this.buttons = [
      {
        id: 'again',
        x: x + 40,
        y: y + 268,
        w: w - 80,
        h: 54,
        label: 'Nochmal!',
        color: '#6fcf97',
      },
      {
        id: 'menu',
        x: x + 40,
        y: y + 330,
        w: w - 80,
        h: 40,
        label: 'Hauptmenü',
        color: '#b8a6d9',
      },
    ];
    for (const button of this.buttons) drawButton(ctx, button);
  }
}
