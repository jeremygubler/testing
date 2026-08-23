import Phaser from 'phaser';
import type { ElementType } from '../data/types';
import { TYPE_COLORS } from '../data/types';

export type Faction = 'spieler' | 'gegner';

export interface ProjectileOptions {
  x: number;
  y: number;
  /** Flugrichtung in Radiant. */
  angle: number;
  speed: number;
  damage: number;
  faction: Faction;
  element: ElementType;
  /** Verbleibende Wand-Abpraller. */
  bounces?: number;
  /** Wie viele Gegner zusätzlich durchdrungen werden. */
  pierce?: number;
  /** Kollisionsradius. */
  radius?: number;
  /** Zielsuchend: dreht sich pro Sekunde um max. `homingRate` Radiant. */
  homing?: boolean;
  homingRate?: number;
  /** Flächenschaden beim Aufschlag (Radius in px, 0 = kein AoE). */
  aoe?: number;
  /** Lebensdauer in ms. */
  lifespan?: number;
}

/**
 * Ein Projektil. Wird über eine Phaser-Gruppe recycelt, damit bei hoher
 * Feuerrate (Schnellfeuer-Chip stapelt gerne) keine GC-Spitzen entstehen.
 */
export class Projectile extends Phaser.Physics.Arcade.Sprite {
  damage = 0;
  faction: Faction = 'spieler';
  element: ElementType = 'normal';
  bouncesLeft = 0;
  pierceLeft = 0;
  aoe = 0;
  homing = false;
  homingRate = 3.2;
  /** Gegner, die dieses Projektil bereits getroffen hat (gegen Doppelschaden). */
  readonly hitTargets = new Set<Phaser.GameObjects.GameObject>();

  private expiresAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'dot');
  }

  /** Setzt das Projektil zurück und schiesst es los. */
  launch(opts: ProjectileOptions): void {
    const radius = opts.radius ?? 6;
    this.hitTargets.clear();
    this.damage = opts.damage;
    this.faction = opts.faction;
    this.element = opts.element;
    this.bouncesLeft = opts.bounces ?? 0;
    this.pierceLeft = opts.pierce ?? 0;
    this.aoe = opts.aoe ?? 0;
    this.homing = opts.homing ?? false;
    this.homingRate = opts.homingRate ?? 3.2;
    this.expiresAt = this.scene.time.now + (opts.lifespan ?? 2600);

    this.enableBody(true, opts.x, opts.y, true, true);
    this.setActive(true).setVisible(true);
    // Eigene Geschosse sind Kreise, gegnerische Rauten. Ohne diesen
    // Formunterschied sind grosse Gegner-Projektile (z. B. Bogenwürfe) auf den
    // ersten Blick nicht von Gegnern zu unterscheiden.
    this.setTexture(opts.faction === 'gegner' ? 'spark' : 'dot');
    this.setDisplaySize(radius * 2, radius * 2);
    this.setTint(TYPE_COLORS[opts.element]);

    const body = this.body as Phaser.Physics.Arcade.Body;
    // Trefferradius aus der Quelltextur ableiten, nicht hart verdrahten.
    body.setCircle(this.width / 2, 0, 0);
    body.setAllowGravity(false);
    body.setBounce(1, 1);
    body.onWorldBounds = false;
    this.scene.physics.velocityFromRotation(opts.angle, opts.speed, body.velocity);
    this.setRotation(opts.angle);
  }

  /** Wandtreffer: abprallen oder verschwinden. */
  onWallHit(): void {
    if (this.bouncesLeft > 0) {
      this.bouncesLeft--;
      // Nach dem Abprall dürfen bereits getroffene Gegner erneut getroffen werden.
      this.hitTargets.clear();
      const body = this.body as Phaser.Physics.Arcade.Body;
      this.setRotation(Math.atan2(body.velocity.y, body.velocity.x));
      return;
    }
    this.kill();
  }

  kill(): void {
    if (!this.active) return;
    this.disableBody(true, true);
    this.hitTargets.clear();
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (time >= this.expiresAt) {
      this.kill();
      return;
    }
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) this.setRotation(Math.atan2(body.velocity.y, body.velocity.x));

  }

  /** Sanftes Einlenken auf ein Ziel (nur bei `homing`). */
  steerTowards(tx: number, ty: number, deltaSec: number): void {
    if (!this.homing || !this.body) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const speed = body.velocity.length();
    const current = Math.atan2(body.velocity.y, body.velocity.x);
    const desired = Math.atan2(ty - this.y, tx - this.x);
    const diff = Phaser.Math.Angle.Wrap(desired - current);
    const step = Phaser.Math.Clamp(diff, -this.homingRate * deltaSec, this.homingRate * deltaSec);
    this.scene.physics.velocityFromRotation(current + step, speed, body.velocity);
  }
}
