import Phaser from 'phaser';
import { COLORS, TRAINER } from '../config/GameConfig';

/**
 * Der Trainer. Bewegt sich per WASD, zielt/schiesst mit der Maus.
 * Kämpft schwach — die eigentliche Feuerkraft ist das Begleitmonster.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  hp: number;
  maxHp: number;
  /** Zeitpunkt, bis zu dem der Trainer unverwundbar ist. */
  invulnUntil = 0;
  private nextShotAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, maxHp: number) {
    super(scene, x, y, 'trainer');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.maxHp = maxHp;
    this.hp = maxHp;

    this.setTint(COLORS.trainer);
    this.setDepth(20);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(TRAINER.radius, this.width / 2 - TRAINER.radius, this.height / 2 - TRAINER.radius + 3);
    body.setCollideWorldBounds(false);
    body.setAllowGravity(false);
  }

  /** Bewegung aus normalisiertem Richtungsvektor. */
  move(dx: number, dy: number, speed: number): void {
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      this.setVelocity(0, 0);
      return;
    }
    this.setVelocity((dx / len) * speed, (dy / len) * speed);
  }

  canShoot(time: number): boolean {
    return time >= this.nextShotAt;
  }

  registerShot(time: number, fireRate: number): void {
    this.nextShotAt = time + 1000 / Math.max(0.1, fireRate);
  }

  /** Gibt zurück, ob der Schaden tatsächlich angekommen ist. */
  takeDamage(amount: number, time: number): boolean {
    if (time < this.invulnUntil) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnUntil = time + TRAINER.iframes;
    // Kurzes Aufblinken als Feedback für die Unverwundbarkeit.
    this.scene.tweens.add({
      targets: this,
      alpha: { from: 0.25, to: 1 },
      duration: TRAINER.iframes,
      ease: 'Sine.easeOut',
    });
    return true;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  get isInvulnerable(): boolean {
    return this.scene.time.now < this.invulnUntil;
  }
}
