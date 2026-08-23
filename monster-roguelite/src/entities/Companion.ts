import Phaser from 'phaser';
import { COMPANION } from '../config/GameConfig';
import type { MonsterSpecies } from '../data/monsters';
import { TYPE_COLORS } from '../data/types';

/**
 * Das aktive Begleitmonster.
 *
 * Verhalten: folgt dem Trainer auf Distanz und greift eigenständig den
 * nächstgelegenen Gegner in Reichweite an. Der Spieler steuert es nicht direkt —
 * die taktische Entscheidung ist die Wahl des Monsters, nicht sein Mikromanagement.
 */
export class Companion extends Phaser.Physics.Arcade.Sprite {
  species: MonsterSpecies;
  hp: number;
  maxHp: number;
  private nextShotAt = 0;
  /** Für Salven (`burst3`): verbleibende Schüsse und nächster Zeitpunkt. */
  private burstLeft = 0;
  private nextBurstAt = 0;
  private burstAngle = 0;
  private ring: Phaser.GameObjects.Image;
  /** Zeitpunkt, bis zu dem das Monster unverwundbar ist. */
  private invulnUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, species: MonsterSpecies, hp: number, maxHp: number) {
    super(scene, x, y, 'orb');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.species = species;
    this.hp = hp;
    this.maxHp = maxHp;

    this.setTint(TYPE_COLORS[species.type]);
    this.setDisplaySize(COMPANION.radius * 2.2, COMPANION.radius * 2.2);
    this.setDepth(19);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(14, 0, 0);
    body.setAllowGravity(false);

    // Weisser Ring markiert das Monster als "meins" — Gegner haben keinen.
    this.ring = scene.add
      .image(x, y, 'ring')
      .setTint(0xffffff)
      .setAlpha(0.75)
      .setDisplaySize(COMPANION.radius * 2.9, COMPANION.radius * 2.9)
      .setDepth(18);
  }

  /** Art wechseln, ohne das Objekt neu zu erzeugen. */
  swapTo(species: MonsterSpecies, hp: number, maxHp: number): void {
    this.species = species;
    this.hp = hp;
    this.maxHp = maxHp;
    this.setTint(TYPE_COLORS[species.type]);
    this.burstLeft = 0;
    this.nextShotAt = this.scene.time.now + 200;
    this.scene.tweens.add({
      targets: [this, this.ring],
      scaleX: { from: 0.4, to: this.scaleX },
      scaleY: { from: 0.4, to: this.scaleY },
      duration: 220,
      ease: 'Back.easeOut',
    });
  }

  /**
   * Positioniert sich relativ zum Trainer.
   *
   * Ohne Gegner läuft es einfach hinterher. Mit Gegner stellt es sich
   * zwischen Trainer und Bedrohung — das ist nicht nur thematisch richtig
   * (das Monster kämpft, der Trainer nicht), sondern verhindert auch, dass
   * der Trainer die Projektile abfängt, die eigentlich dem Monster gelten.
   */
  follow(
    px: number,
    py: number,
    speed: number,
    threat: { x: number; y: number } | null,
  ): void {
    let tx = px;
    let ty = py;
    if (threat) {
      const a = Math.atan2(threat.y - py, threat.x - px);
      tx = px + Math.cos(a) * COMPANION.screenDistance;
      ty = py + Math.sin(a) * COMPANION.screenDistance;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);
    if (dist < (threat ? 14 : COMPANION.followDistance)) {
      this.setVelocity(this.body!.velocity.x * 0.85, this.body!.velocity.y * 0.85);
      return;
    }
    const angle = Math.atan2(ty - this.y, tx - this.x);
    // Weiter weg = schneller aufschliessen, damit es nie zurückfällt.
    const urgency = Phaser.Math.Clamp(dist / 200, 0.5, 1.8);
    this.setVelocity(Math.cos(angle) * speed * urgency, Math.sin(angle) * speed * urgency);
  }

  syncRing(): void {
    this.ring.setPosition(this.x, this.y);
    this.ring.setVisible(this.visible);
  }

  readyToShoot(time: number): boolean {
    return time >= this.nextShotAt && this.burstLeft === 0;
  }

  registerShot(time: number, fireRate: number): void {
    this.nextShotAt = time + 1000 / Math.max(0.1, fireRate);
  }

  /** Startet eine Salve; `tickBurst` liefert danach die Folgeschüsse. */
  beginBurst(count: number, angle: number, time: number): void {
    this.burstLeft = count;
    this.burstAngle = angle;
    this.nextBurstAt = time;
  }

  /** Gibt den Winkel zurück, wenn jetzt ein Salvenschuss fällig ist. */
  tickBurst(time: number): number | null {
    if (this.burstLeft <= 0 || time < this.nextBurstAt) return null;
    this.burstLeft--;
    this.nextBurstAt = time + 110;
    return this.burstAngle;
  }

  /** Gibt zurück, ob der Schaden angekommen ist (false = Unverwundbarkeit). */
  takeDamage(amount: number): boolean {
    if (this.scene.time.now < this.invulnUntil) return false;
    this.invulnUntil = this.scene.time.now + COMPANION.iframes;
    this.hp = Math.max(0, this.hp - amount);
    this.scene.tweens.add({ targets: this, alpha: { from: 0.3, to: 1 }, duration: 180 });
    return true;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  override destroy(fromScene?: boolean): void {
    this.ring.destroy();
    super.destroy(fromScene);
  }
}
