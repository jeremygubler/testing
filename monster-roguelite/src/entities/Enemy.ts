import Phaser from 'phaser';
import { BOSS, ELITE } from '../config/GameConfig';
import type { MonsterSpecies } from '../data/monsters';
import { TYPE_COLORS } from '../data/types';

/** Was der Gegner in diesem Frame tun möchte — GameScene setzt es um. */
export interface EnemyIntent {
  kind: 'nichts' | 'schuss' | 'nahkampf';
  angle: number;
}

/** Bevorzugte Kampfdistanz je Angriffsmuster. */
const PREFERRED_RANGE: Record<string, number> = {
  melee: 26,
  single: 230,
  spread3: 200,
  burst3: 240,
  homing: 280,
  lob: 210,
};

/**
 * Ein Gegner-Monster.
 *
 * Die KI ist absichtlich simpel und lesbar: Wunschdistanz halten, seitlich
 * ausweichen, auf Cooldown feuern. Der Schwierigkeitsgrad kommt aus der
 * Etagen-Skalierung und der Gegneranzahl, nicht aus KI-Tricks.
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  species: MonsterSpecies;
  hp: number;
  maxHp: number;
  readonly isBoss: boolean;
  readonly isElite: boolean;
  /** Goldener Ring, der Elites auf einen Blick kenntlich macht. */
  private auraRing: Phaser.GameObjects.Image | null = null;
  /** Etagen-Skalierung für den Schaden. */
  damageScale: number;
  /** Aufblinken, wenn fangbar. */
  catchable = false;

  /** Aktuelle Boss-Phase (1-basiert). Bei Nicht-Bossen immer 1. */
  phase = 1;
  /** Zeitpunkt der nächsten Nova. */
  nextNovaAt = 0;
  /** Läuft gerade eine Nova-Vorwarnung? Dann Zeitpunkt der Auslösung. */
  novaFiresAt = 0;

  private nextShotAt = 0;
  private burstLeft = 0;
  private nextBurstAt = 0;
  private burstAngle = 0;
  /** Ausweichrichtung, wird gelegentlich gewürfelt. */
  private strafeSign = 1;
  private nextStrafeFlip = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    species: MonsterSpecies,
    maxHp: number,
    damageScale: number,
    isBoss: boolean,
    isElite = false,
  ) {
    super(scene, x, y, isBoss ? 'orb_big' : 'orb');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.species = species;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.isBoss = isBoss;
    this.isElite = isElite;
    this.damageScale = damageScale;

    const size = isBoss ? 58 : isElite ? 38 : 26;
    this.setTint(TYPE_COLORS[species.type]);
    this.setDisplaySize(size, size);
    this.setDepth(15);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(isBoss ? 24 : 14, 0, 0);
    body.setAllowGravity(false);

    if (isElite) {
      this.auraRing = scene.add
        .image(x, y, 'ring')
        .setTint(0xfbbf24)
        .setDisplaySize(size + 14, size + 14)
        .setDepth(14);
      scene.tweens.add({
        targets: this.auraRing,
        alpha: { from: 0.45, to: 1 },
        duration: 620,
        yoyo: true,
        repeat: -1,
      });
    }
    // Bosse lassen sich kaum wegschieben.
    body.setDrag(isBoss ? 900 : 300);

    // Gegner starten mit versetztem Cooldown, damit nicht alle gleichzeitig feuern.
    this.nextShotAt = scene.time.now + 700 + Math.random() * 1100;
  }

  get radius(): number {
    return this.isBoss ? 29 : this.isElite ? 19 : 13;
  }

  /** Aura an die Position nachführen (aus GameScene pro Frame gerufen). */
  syncAura(): void {
    this.auraRing?.setPosition(this.x, this.y);
  }

  /**
   * Phase aus dem HP-Anteil ableiten. Gibt die neue Phase zurück, wenn sich
   * etwas geändert hat — sonst null.
   */
  updatePhase(): number | null {
    if (!this.isBoss) return null;
    const ratio = this.hpRatio;
    let next = 1;
    for (const threshold of BOSS.phaseThresholds) {
      if (ratio <= threshold) next++;
    }
    if (next === this.phase) return null;
    this.phase = next;
    return next;
  }

  /** Angriffsgeschwindigkeit inkl. Phasen-Beschleunigung. */
  get effectiveAttackSpeed(): number {
    const factor = this.isBoss
      ? (BOSS.attackSpeedPerPhase[this.phase - 1] ?? 1)
      : 1;
    return this.species.attackSpeed * factor;
  }

  override destroy(fromScene?: boolean): void {
    this.auraRing?.destroy();
    this.auraRing = null;
    super.destroy(fromScene);
  }

  /**
   * Bewegung + Angriffsabsicht für diesen Frame.
   * `targetX/Y` ist das aktuelle Ziel (Trainer oder Begleitmonster).
   */
  think(time: number, targetX: number, targetY: number, attackSpeed: number): EnemyIntent {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
    const angle = Math.atan2(targetY - this.y, targetX - this.x);
    const want = PREFERRED_RANGE[this.species.pattern] ?? 200;

    // --- Bewegung ---------------------------------------------------------
    const speed =
      this.species.moveSpeed *
      (this.isElite ? ELITE.speedMultiplier : 1) *
      (this.isBoss ? (BOSS.moveSpeedPerPhase[this.phase - 1] ?? 1) : 1);
    if (time > this.nextStrafeFlip) {
      this.strafeSign = Math.random() < 0.5 ? -1 : 1;
      this.nextStrafeFlip = time + 900 + Math.random() * 1400;
    }

    let vx = 0;
    let vy = 0;
    if (dist > want * 1.15) {
      // Zu weit weg: annähern.
      vx = Math.cos(angle) * speed;
      vy = Math.sin(angle) * speed;
    } else if (dist < want * 0.7 && this.species.pattern !== 'melee') {
      // Zu nah: Abstand herstellen (Nahkämpfer bleiben dran).
      vx = -Math.cos(angle) * speed * 0.8;
      vy = -Math.sin(angle) * speed * 0.8;
    } else {
      // Auf Wunschdistanz: seitlich kreisen, schwerer zu treffen.
      vx = Math.cos(angle + (Math.PI / 2) * this.strafeSign) * speed * 0.6;
      vy = Math.sin(angle + (Math.PI / 2) * this.strafeSign) * speed * 0.6;
    }
    this.setVelocity(vx, vy);

    // --- Angriff ----------------------------------------------------------
    const burst = this.tickBurst(time);
    if (burst !== null) return { kind: 'schuss', angle: burst };

    if (time < this.nextShotAt || this.burstLeft > 0) return { kind: 'nichts', angle };

    const inRange = dist <= want * 1.4;
    if (!inRange) return { kind: 'nichts', angle };

    this.nextShotAt = time + 1000 / Math.max(0.1, attackSpeed);

    if (this.species.pattern === 'melee') {
      return { kind: dist <= 40 ? 'nahkampf' : 'nichts', angle };
    }
    if (this.species.pattern === 'burst3') {
      this.beginBurst(3, angle, time);
      const first = this.tickBurst(time);
      return first !== null ? { kind: 'schuss', angle: first } : { kind: 'nichts', angle };
    }
    return { kind: 'schuss', angle };
  }

  private beginBurst(count: number, angle: number, time: number): void {
    this.burstLeft = count;
    this.burstAngle = angle;
    this.nextBurstAt = time;
  }

  private tickBurst(time: number): number | null {
    if (this.burstLeft <= 0 || time < this.nextBurstAt) return null;
    this.burstLeft--;
    this.nextBurstAt = time + 130;
    return this.burstAngle;
  }

  takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this.scene.tweens.add({
      targets: this,
      alpha: { from: 0.35, to: 1 },
      duration: 140,
      ease: 'Sine.easeOut',
    });
  }

  get hpRatio(): number {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }
}
