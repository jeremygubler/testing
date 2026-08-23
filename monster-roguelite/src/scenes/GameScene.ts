import Phaser from 'phaser';
import {
  CATCH,
  COLORS,
  COMPANION,
  REWARDS,
  ROOM_COLS,
  ROOM_RECOVERY,
  ROOM_OFFSET_X,
  ROOM_OFFSET_Y,
  ROOM_ROWS,
  TILE,
  TRAINER,
} from '../config/GameConfig';
import { bus } from '../core/EventBus';
import { RunState } from '../core/RunState';
import { pctMul } from '../core/StatBlock';
import { getSpecies } from '../data/monsters';
import { TYPE_COLORS, effectivenessLabel } from '../data/types';
import { Chest } from '../entities/Chest';
import { Companion } from '../entities/Companion';
import { Enemy } from '../entities/Enemy';
import { Projectile, type ProjectileOptions } from '../entities/Projectile';
import { Player } from '../entities/Player';
import { loadMeta, recordDex, saveMeta, type MetaSave } from '../meta/MetaSave';
import { CATCH_FAIL_TEXT, evaluateCatch, rollCatch } from '../systems/CatchSystem';
import { computeDamage, patternDamage, spreadAngles } from '../systems/CombatSystem';
import { rollRelic } from '../systems/RelicSystem';
import { generateFloor, type FloorPlan, type RoomNode } from '../world/FloorGenerator';
import {
  DIR_DELTA,
  OPPOSITE,
  ROOM_CENTER,
  Tile,
  isBlocking,
  tileToWorld,
  worldToTile,
  type Direction,
} from '../world/RoomLayout';

export interface GameSceneData {
  starterId: string;
  seed?: number;
}

/**
 * Kern-Gameplay-Szene: hält Welt, Entities und Kollisionen zusammen.
 *
 * Sie ist bewusst der einzige Ort, der Phaser-Physik kennt. Regeln (Schaden,
 * Fangchance, Relikt-Ziehung, Etagen-Layout) delegiert sie an die reinen
 * Module unter `systems/`, `core/` und `world/`.
 */
export class GameScene extends Phaser.Scene {
  private run!: RunState;
  private meta!: MetaSave;
  private plan!: FloorPlan;

  private player!: Player;
  private companion: Companion | null = null;
  private enemies!: Phaser.Physics.Arcade.Group;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private chest: Chest | null = null;
  private portal: Phaser.GameObjects.Image | null = null;

  private roomGfx!: Phaser.GameObjects.Graphics;
  private barGfx!: Phaser.GameObjects.Graphics;

  private keys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    catch: Phaser.Input.Keyboard.Key;
    cycle: Phaser.Input.Keyboard.Key;
    slots: Phaser.Input.Keyboard.Key[];
  };

  private nextCatchAt = 0;
  /** Eigener Cooldown für den "Erst den Raum räumen!"-Hinweis. */
  private nextChestNagAt = 0;
  private regenCarry = 0;
  private transitioning = false;
  private runOver = false;

  constructor() {
    super('Game');
  }

  // =======================================================================
  // Aufbau
  // =======================================================================

  create(data: GameSceneData): void {
    this.meta = loadMeta();
    this.run = new RunState(data.seed);
    this.run.relicPool = [...this.meta.unlockedRelics];
    this.run.permanentBonus = permanentBonusFrom(this.meta);
    this.run.addToTeam(data.starterId);
    this.run.trainerHp = this.run.trainerMaxHp;

    this.registry.set('run', this.run);
    this.registry.set('meta', this.meta);

    this.transitioning = false;
    this.runOver = false;
    this.nextCatchAt = 0;
    this.nextChestNagAt = 0;
    this.regenCarry = 0;

    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.physics.world.setBounds(
      ROOM_OFFSET_X,
      ROOM_OFFSET_Y,
      ROOM_COLS * TILE,
      ROOM_ROWS * TILE,
    );

    this.roomGfx = this.add.graphics().setDepth(0);
    this.barGfx = this.add.graphics().setDepth(40);

    this.walls = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group({ runChildUpdate: false });
    this.projectiles = this.physics.add.group({
      classType: Projectile,
      maxSize: 500,
      runChildUpdate: true,
    });

    const spawn = tileToWorld(ROOM_CENTER.col, ROOM_CENTER.row);
    this.player = new Player(this, spawn.x, spawn.y, this.run.trainerMaxHp);
    this.player.hp = this.run.trainerHp;

    this.setupInput();
    this.setupColliders();

    this.plan = generateFloor(this.run.rng, this.run.floor);
    this.registry.set('plan', this.plan);
    this.enterRoom(this.plan.startIndex, null);

    this.scene.launch('Hud');
    bus.emit('log', { text: 'Etage 1 — finde den Boss-Raum.', color: '#8ad7ff' });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop('Hud');
    });
  }

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      catch: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      cycle: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      slots: [
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
      ],
    };

    this.keys.catch.on('down', () => this.tryCatch());
    this.keys.cycle.on('down', () => this.switchMonster(this.run.activeIndex + 1));
    this.keys.slots.forEach((key, i) => key.on('down', () => this.switchMonster(i)));
  }

  private setupColliders(): void {
    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.enemies, this.walls);
    this.physics.add.collider(this.enemies, this.enemies);

    this.physics.add.collider(this.projectiles, this.walls, (obj) => {
      (obj as Projectile).onWallHit();
    });

    this.physics.add.overlap(this.projectiles, this.enemies, (a, b) => {
      this.onProjectileHitsEnemy(a as Projectile, b as Enemy);
    });

    // Siehe Hinweis in ensureCompanion(): (sprite, groupMember).
    this.physics.add.overlap(this.projectiles, this.player, (a, b) => {
      this.onProjectileHitsPlayer(b as Projectile, a as Player);
    });

    this.physics.add.overlap(this.player, this.enemies, (_a, b) => {
      this.onContact(b as Enemy);
    });
  }

  // =======================================================================
  // Raum-Handling
  // =======================================================================

  private get room(): RoomNode {
    return this.plan.rooms[this.run.roomIndex]!;
  }

  /** Baut einen Raum auf: Kacheln zeichnen, Kollider setzen, Inhalte spawnen. */
  private enterRoom(index: number, fromDirection: Direction | null): void {
    this.run.roomIndex = index;
    const room = this.room;
    room.visited = true;

    this.clearRoomObjects();
    this.drawRoom(room);
    this.rebuildWalls(room);

    // Trainer an der Gegentür platzieren (oder in der Mitte beim Start).
    if (fromDirection) {
      const door = room.tiles.doors[fromDirection];
      if (door) {
        const inset = DIR_DELTA[fromDirection];
        const pos = tileToWorld(door.col - inset.dx * 2, door.row - inset.dy * 2);
        this.player.setPosition(pos.x, pos.y);
      }
    } else {
      const pos = tileToWorld(ROOM_CENTER.col, ROOM_CENTER.row);
      this.player.setPosition(pos.x, pos.y);
    }
    this.player.setVelocity(0, 0);

    this.ensureCompanion();
    if (this.companion) {
      this.companion.setPosition(this.player.x - 30, this.player.y + 20);
      this.companion.setVelocity(0, 0);
    }

    // Gegner spawnen (nur wenn der Raum noch nicht geräumt wurde).
    if (!room.cleared) {
      for (const spawn of room.enemies) {
        const species = getSpecies(spawn.speciesId);
        const pos = tileToWorld(spawn.col, spawn.row);
        const maxHp = Math.round(species.maxHp * this.run.enemyHpScale * (spawn.isBoss ? 1 : 1));
        const enemy = new Enemy(
          this,
          pos.x,
          pos.y,
          species,
          maxHp,
          this.run.enemyDamageScale,
          spawn.isBoss,
        );
        this.enemies.add(enemy);
      }
      if (room.kind === 'boss') {
        bus.emit('log', { text: `⚠ Boss: ${getSpecies(room.enemies[0]!.speciesId).name}`, color: '#f87171' });
        bus.emit('shake', { intensity: 0.006, duration: 500 });
      }
    }

    if (room.chest && !room.chestOpened) {
      const pos = tileToWorld(room.chest.col, room.chest.row);
      this.chest = new Chest(this, pos.x, pos.y);
      this.physics.add.overlap(this.player, this.chest, () => this.openChest());
    }

    // Boss besiegt → Portal zur nächsten Etage.
    if (room.kind === 'boss' && room.cleared) this.spawnPortal();

    this.transitioning = false;
    bus.emit('room:changed', {
      index,
      total: this.plan.rooms.length,
      kind: room.kind,
    });
    bus.emit('hud:dirty', undefined);
  }

  private clearRoomObjects(): void {
    this.enemies.clear(true, true);
    this.projectiles.getChildren().forEach((p) => (p as Projectile).kill());
    this.chest?.destroy();
    this.chest = null;
    this.portal?.destroy();
    this.portal = null;
  }

  /** Zeichnet Boden, Wände, Hindernisse und Türen des Raums. */
  private drawRoom(room: RoomNode): void {
    const g = this.roomGfx;
    g.clear();

    for (let row = 0; row < ROOM_ROWS; row++) {
      for (let col = 0; col < ROOM_COLS; col++) {
        const tile = room.tiles.grid[row]![col]!;
        const x = ROOM_OFFSET_X + col * TILE;
        const y = ROOM_OFFSET_Y + row * TILE;

        if (tile === Tile.Wall) {
          g.fillStyle(COLORS.wall, 1);
          g.fillRect(x, y, TILE, TILE);
          g.fillStyle(COLORS.wallTop, 1);
          g.fillRect(x, y, TILE, 5);
        } else if (tile === Tile.Obstacle) {
          g.fillStyle(COLORS.obstacle, 1);
          g.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
          g.fillStyle(COLORS.wallTop, 0.5);
          g.fillRect(x + 1, y + 1, TILE - 2, 4);
        } else if (tile === Tile.Door) {
          g.fillStyle(room.cleared ? COLORS.doorOpen : COLORS.door, 1);
          g.fillRect(x, y, TILE, TILE);
        } else {
          // Schachbrettmuster als dezente Orientierungshilfe.
          g.fillStyle((col + row) % 2 === 0 ? COLORS.floor : COLORS.floorAlt, 1);
          g.fillRect(x, y, TILE, TILE);
        }
      }
    }

    // Raumrahmen als Abschluss.
    g.lineStyle(2, 0x0b0d16, 1);
    g.strokeRect(ROOM_OFFSET_X, ROOM_OFFSET_Y, ROOM_COLS * TILE, ROOM_ROWS * TILE);
  }

  /**
   * Erzeugt Kollisionskörper. Zusammenhängende blockierende Kacheln einer
   * Zeile werden zu einem Rechteck verschmolzen — statt 375 Bodies bleiben
   * so typisch unter 40 übrig.
   */
  private rebuildWalls(room: RoomNode): void {
    this.walls.clear(true, true);
    const locked = !room.cleared;

    for (let row = 0; row < ROOM_ROWS; row++) {
      let runStart = -1;
      for (let col = 0; col <= ROOM_COLS; col++) {
        const tile = col < ROOM_COLS ? room.tiles.grid[row]![col] : undefined;
        const blocks = col < ROOM_COLS && isBlocking(tile, locked);
        if (blocks && runStart === -1) runStart = col;
        if (!blocks && runStart !== -1) {
          const width = (col - runStart) * TILE;
          const rect = this.add.rectangle(
            ROOM_OFFSET_X + runStart * TILE + width / 2,
            ROOM_OFFSET_Y + row * TILE + TILE / 2,
            width,
            TILE,
          );
          rect.setVisible(false);
          this.physics.add.existing(rect, true);
          this.walls.add(rect);
          runStart = -1;
        }
      }
    }
  }

  /** Prüft, ob der Raum leergekämpft ist, und öffnet dann die Türen. */
  private checkRoomCleared(): void {
    const room = this.room;
    if (room.cleared) return;
    if (this.enemies.countActive(true) > 0) return;

    room.cleared = true;
    this.run.stats.roomsCleared++;
    const gained = this.run.award(
      room.kind === 'boss' ? REWARDS.perBoss : REWARDS.perRoomCleared,
    );

    if (room.kind === 'boss') {
      this.run.stats.bossesDefeated++;
      bus.emit('log', { text: `Boss besiegt! +${gained} Ätherstaub`, color: '#4ade80' });
      // Boss lässt garantiert ein Relikt fallen.
      this.grantRelic();
      this.spawnPortal();
    } else {
      bus.emit('log', { text: `Raum geräumt (+${gained})`, color: '#4ade80' });
    }

    this.recoverAfterRoom();

    this.drawRoom(room);
    this.rebuildWalls(room);
    bus.emit('hud:dirty', undefined);
  }

  /**
   * Kleine Erholung nach jedem geräumten Raum. Ohne sie ist ein Run nach zwei
   * Kampfräumen rechnerisch vorbei — das Fenster für Relikt-Stapel geht dann
   * nie auf, und genau davon lebt das Genre.
   */
  private recoverAfterRoom(): void {
    this.player.maxHp = this.run.trainerMaxHp;
    this.player.heal(this.player.maxHp * ROOM_RECOVERY.trainer);
    this.run.trainerHp = this.player.hp;

    if (this.companion) {
      this.companion.maxHp = this.run.monsterMaxHp(this.companion.species);
      this.companion.heal(this.companion.maxHp * ROOM_RECOVERY.monster);
      const active = this.run.active;
      if (active) active.hp = this.companion.hp;
    }
  }

  private spawnPortal(): void {
    const pos = tileToWorld(ROOM_CENTER.col, ROOM_CENTER.row);
    this.portal = this.add
      .image(pos.x, pos.y, 'orb_big')
      .setTint(0xa855f7)
      .setDisplaySize(52, 52)
      .setDepth(8);
    this.tweens.add({
      targets: this.portal,
      scale: { from: this.portal.scale * 0.8, to: this.portal.scale * 1.15 },
      alpha: { from: 0.65, to: 1 },
      duration: 700,
      yoyo: true,
      repeat: -1,
    });
    bus.emit('log', { text: 'Portal offen — betritt es für Etage ' + (this.run.floor + 1), color: '#c084fc' });
  }

  /** Wechsel auf die nächste Etage. */
  private nextFloor(): void {
    this.run.floor++;
    this.run.stats.floorsCleared++;
    const gained = this.run.award(REWARDS.perFloorCleared);

    // Kleine Erholung zwischen den Etagen — sonst wird Etage 3+ unspielbar.
    this.player.maxHp = this.run.trainerMaxHp;
    this.player.heal(Math.round(this.player.maxHp * 0.3));
    for (const m of this.run.team) {
      const max = this.run.monsterMaxHp(getSpecies(m.speciesId));
      m.hp = Math.min(max, m.hp + Math.round(max * 0.4));
      // Ohnmächtige Monster kommen mit einem Rest an HP zurück.
      if (m.hp <= 0) m.hp = Math.round(max * 0.25);
    }

    this.plan = generateFloor(this.run.rng, this.run.floor);
    this.registry.set('plan', this.plan);
    bus.emit('floor:cleared', { floor: this.run.floor - 1 });
    bus.emit('log', { text: `Etage ${this.run.floor} (+${gained} Ätherstaub)`, color: '#fbbf24' });
    this.cameras.main.flash(260, 40, 20, 70);
    this.enterRoom(this.plan.startIndex, null);
  }

  // =======================================================================
  // Kampf
  // =======================================================================

  /** Erzeugt ein Projektil aus dem Pool. */
  fire(opts: ProjectileOptions): void {
    const proj = this.projectiles.get(opts.x, opts.y) as Projectile | null;
    if (!proj) return;
    proj.launch(opts);
  }

  /** Übersetzt ein Angriffsmuster in konkrete Projektile. */
  private firePattern(
    pattern: string,
    from: { x: number; y: number },
    angle: number,
    base: {
      damage: number;
      element: ProjectileOptions['element'];
      faction: ProjectileOptions['faction'];
      speed: number;
      bounces: number;
      pierce: number;
    },
  ): void {
    const extra = base.faction === 'spieler' ? this.run.mods.extraProjectiles : 0;
    // Schaden pro Projektil an das Muster anpassen (siehe PATTERN_DAMAGE).
    base = { ...base, damage: Math.max(1, base.damage * patternDamage(pattern)) };

    switch (pattern) {
      case 'spread3': {
        const count = 3 + extra;
        for (const off of spreadAngles(count, Phaser.Math.DegToRad(34 + extra * 6))) {
          this.fire({ ...base, x: from.x, y: from.y, angle: angle + off, radius: 6 });
        }
        break;
      }
      case 'homing': {
        const count = 1 + extra;
        for (const off of spreadAngles(count, Phaser.Math.DegToRad(18))) {
          this.fire({
            ...base,
            x: from.x,
            y: from.y,
            angle: angle + off,
            speed: base.speed * 0.62,
            radius: 8,
            homing: true,
            lifespan: 3400,
          });
        }
        break;
      }
      case 'lob': {
        const count = 1 + extra;
        for (const off of spreadAngles(count, Phaser.Math.DegToRad(22))) {
          this.fire({
            ...base,
            x: from.x,
            y: from.y,
            angle: angle + off,
            speed: base.speed * 0.55,
            radius: 11,
            aoe: 62,
            lifespan: 2200,
          });
        }
        break;
      }
      case 'melee': {
        // Nahkampf ist ein sehr kurzlebiges, dickes Projektil direkt vor dem Angreifer.
        this.fire({
          ...base,
          x: from.x + Math.cos(angle) * 22,
          y: from.y + Math.sin(angle) * 22,
          angle,
          speed: base.speed * 0.35,
          radius: 16,
          lifespan: 190,
          pierce: base.pierce + 2,
        });
        break;
      }
      default: {
        const count = 1 + extra;
        for (const off of spreadAngles(count, Phaser.Math.DegToRad(12 * extra))) {
          this.fire({ ...base, x: from.x, y: from.y, angle: angle + off, radius: 6 });
        }
      }
    }
  }

  private onProjectileHitsEnemy(proj: Projectile, enemy: Enemy): void {
    if (!(proj instanceof Projectile) || !(enemy instanceof Enemy)) return;
    if (!proj.active || !enemy.active) return;
    if (proj.faction !== 'spieler') return;
    if (proj.hitTargets.has(enemy)) return;
    proj.hitTargets.add(enemy);

    const attackerType = proj.element;
    const result = computeDamage({
      base: proj.damage,
      attackerType,
      defenderType: enemy.species.type,
      mods: this.run.mods,
      rng: this.run.rng,
    });

    this.damageEnemy(enemy, result.amount, result.crit, result.typeMult);

    if (proj.aoe > 0) {
      this.explode(proj.x, proj.y, proj.aoe, Math.round(proj.damage * 0.55), attackerType, enemy);
      proj.kill();
      return;
    }

    if (proj.pierceLeft > 0) {
      proj.pierceLeft--;
      return;
    }
    proj.kill();
  }

  /** Flächenschaden um einen Punkt (Lob-Angriffe). */
  private explode(
    x: number,
    y: number,
    radius: number,
    damage: number,
    element: ProjectileOptions['element'],
    exclude: Enemy | null,
  ): void {
    const ring = this.add
      .image(x, y, 'orb_big')
      .setTint(TYPE_COLORS[element])
      .setAlpha(0.5)
      .setDisplaySize(radius * 0.6, radius * 0.6)
      .setDepth(14);
    this.tweens.add({
      targets: ring,
      displayWidth: radius * 2,
      displayHeight: radius * 2,
      alpha: 0,
      duration: 220,
      onComplete: () => ring.destroy(),
    });

    for (const obj of this.enemies.getChildren()) {
      const e = obj as Enemy;
      if (!e.active || e === exclude) continue;
      if (Phaser.Math.Distance.Between(x, y, e.x, e.y) > radius) continue;
      const result = computeDamage({
        base: damage,
        attackerType: element,
        defenderType: e.species.type,
        mods: this.run.mods,
        rng: this.run.rng,
      });
      this.damageEnemy(e, result.amount, result.crit, result.typeMult);
    }
  }

  private damageEnemy(enemy: Enemy, amount: number, crit: boolean, typeMult: number): void {
    enemy.takeDamage(amount);
    this.run.stats.damageDealt += amount;

    this.floater(
      enemy.x,
      enemy.y - 18,
      crit ? `${amount}!` : `${amount}`,
      crit ? 0xfacc15 : typeMult > 1 ? 0x86efac : typeMult < 1 ? 0x94a3b8 : 0xffffff,
      crit,
    );

    const label = effectivenessLabel(typeMult);
    if (label && this.run.rng.chance(0.3)) {
      this.floater(enemy.x, enemy.y - 34, label, typeMult > 1 ? 0x4ade80 : 0x64748b, false);
    }

    // Lebensraub speist Trainer und Monster gleichzeitig.
    const lifesteal = this.run.mods.lifesteal;
    if (lifesteal > 0) {
      const heal = amount * lifesteal;
      this.regenCarry += heal;
    }

    // Ab Fangschwelle sichtbar markieren.
    const wasCatchable = enemy.catchable;
    enemy.catchable = !enemy.isBoss && enemy.hpRatio <= CATCH.hpThreshold && enemy.hp > 0;
    if (enemy.catchable && !wasCatchable) {
      this.floater(enemy.x, enemy.y - 30, 'fangbar (E)', 0xfde047, false);
    }

    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  private killEnemy(enemy: Enemy): void {
    const gained = this.run.award(REWARDS.perKill * (enemy.isBoss ? 4 : 1));
    this.run.stats.kills++;
    recordDex(this.meta, enemy.species.id, 'defeated', this.run.floor);

    this.floater(enemy.x, enemy.y - 26, `+${gained}`, COLORS.gold, false);
    this.burst(enemy.x, enemy.y, TYPE_COLORS[enemy.species.type], enemy.isBoss ? 16 : 7);
    if (enemy.isBoss) bus.emit('shake', { intensity: 0.012, duration: 400 });

    enemy.destroy();
    bus.emit('hud:dirty', undefined);
    this.checkRoomCleared();
  }

  private onProjectileHitsPlayer(proj: Projectile, player: Player): void {
    if (!(proj instanceof Projectile) || !(player instanceof Player)) return;
    if (!proj.active || proj.faction !== 'gegner') return;
    if (player.isInvulnerable) return;

    const damage = Math.max(1, Math.round(proj.damage * TRAINER.damageTaken));
    const applied = player.takeDamage(damage, this.time.now);
    proj.kill();
    if (!applied) return;

    this.floater(player.x, player.y - 22, `-${damage}`, 0xef4444, false);
    this.cameras.main.shake(150, 0.006);
    bus.emit('hud:dirty', undefined);
    if (player.hp <= 0) this.endRun();
  }

  /** Körperkontakt Trainer ↔ Gegner: Kontaktschaden und Dornen. */
  private onContact(enemy: Enemy): void {
    if (!enemy.active || this.player.isInvulnerable) return;

    const result = computeDamage({
      base: enemy.species.attack * 0.6,
      attackerType: enemy.species.type,
      defenderType: 'normal',
      mods: this.run.mods,
      rng: this.run.rng,
      scale: enemy.damageScale,
      ignoreMods: true,
    });

    const damage = Math.max(1, Math.round(result.amount * TRAINER.damageTaken));
    if (this.player.takeDamage(damage, this.time.now)) {
      this.floater(this.player.x, this.player.y - 22, `-${damage}`, 0xef4444, false);
      this.cameras.main.shake(160, 0.007);
      bus.emit('hud:dirty', undefined);

      const thorns = this.run.mods.thorns;
      if (thorns > 0) {
        this.damageEnemy(enemy, Math.round(thorns), false, 1);
      }
      if (this.player.hp <= 0) this.endRun();
    }
  }

  // =======================================================================
  // Begleitmonster
  // =======================================================================

  private ensureCompanion(): void {
    const active = this.run.active;
    if (!active || active.hp <= 0) {
      // Kein einsatzfähiges Monster: Begleiter ausblenden.
      if (this.companion) {
        this.companion.destroy();
        this.companion = null;
      }
      return;
    }
    const species = getSpecies(active.speciesId);
    const maxHp = this.run.monsterMaxHp(species);

    if (!this.companion) {
      this.companion = new Companion(
        this,
        this.player.x - 30,
        this.player.y + 20,
        species,
        active.hp,
        maxHp,
      );
      this.physics.add.collider(this.companion, this.walls);
      // Achtung: bei overlap(group, sprite) ruft Phaser die Callback-Argumente
      // in der Reihenfolge (sprite, groupMember) auf — nicht so, wie sie hier
      // übergeben werden. Deshalb wird das Projektil aus b gelesen.
      this.physics.add.overlap(this.projectiles, this.companion, (a, b) => {
        this.onProjectileHitsCompanion(b as Projectile, a as Companion);
      });
      this.physics.add.overlap(this.companion, this.enemies, () => {
        /* Begleiter blockt Gegner nur physisch, kein Kontaktschaden. */
      });
    } else if (this.companion.species.id !== species.id) {
      this.companion.swapTo(species, active.hp, maxHp);
    } else {
      this.companion.hp = active.hp;
      this.companion.maxHp = maxHp;
    }
  }

  private onProjectileHitsCompanion(proj: Projectile, comp: Companion): void {
    if (!(proj instanceof Projectile) || !(comp instanceof Companion)) return;
    if (!proj.active || proj.faction !== 'gegner') return;

    const result = computeDamage({
      base: proj.damage,
      attackerType: proj.element,
      defenderType: comp.species.type,
      mods: this.run.mods,
      rng: this.run.rng,
      ignoreMods: true,
    });

    proj.kill();
    if (!comp.takeDamage(result.amount)) return;
    this.floater(comp.x, comp.y - 20, `-${result.amount}`, 0xf97316, false);

    const active = this.run.active;
    if (active) active.hp = comp.hp;
    bus.emit('hud:dirty', undefined);

    if (comp.hp <= 0) this.onCompanionFainted();
  }

  private onCompanionFainted(): void {
    const fainted = this.run.activeSpecies;
    bus.emit('log', { text: `${fainted?.name ?? 'Monster'} ist kampfunfähig!`, color: '#f87171' });
    this.companion?.destroy();
    this.companion = null;

    if (this.run.cycleActive(1)) {
      this.ensureCompanion();
      bus.emit('log', { text: `${this.run.activeSpecies?.name} kommt rein!`, color: '#8ad7ff' });
    } else {
      bus.emit('log', { text: 'Kein Monster mehr einsatzfähig — halte durch!', color: '#fbbf24' });
    }
    bus.emit('hud:dirty', undefined);
  }

  private switchMonster(index: number): void {
    const target = ((index % this.run.team.length) + this.run.team.length) % this.run.team.length;
    if (target === this.run.activeIndex) return;
    const member = this.run.team[target];
    if (!member) return;
    if (member.hp <= 0) {
      bus.emit('log', { text: `${getSpecies(member.speciesId).name} ist kampfunfähig.`, color: '#94a3b8' });
      return;
    }
    // HP des aktuellen Monsters zurückschreiben, bevor gewechselt wird.
    const current = this.run.active;
    if (current && this.companion) current.hp = this.companion.hp;

    this.run.selectActive(target);
    this.ensureCompanion();
    bus.emit('log', { text: `Los, ${this.run.activeSpecies?.name}!`, color: '#8ad7ff' });
    bus.emit('hud:dirty', undefined);
  }

  // =======================================================================
  // Fangen
  // =======================================================================

  private tryCatch(): void {
    if (this.runOver || this.time.now < this.nextCatchAt) return;
    this.nextCatchAt = this.time.now + CATCH.cooldown;

    // Schwächsten fangbaren Gegner in Reichweite wählen.
    let best: Enemy | null = null;
    let bestScore = Infinity;
    for (const obj of this.enemies.getChildren()) {
      const e = obj as Enemy;
      if (!e.active || e.isBoss) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (dist > CATCH.range) continue;
      const score = e.hpRatio * 1000 + dist;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }

    if (!best) {
      bus.emit('log', { text: CATCH_FAIL_TEXT.zu_weit, color: '#94a3b8' });
      return;
    }

    const attempt = evaluateCatch(
      best.species,
      best.hpRatio,
      Phaser.Math.Distance.Between(this.player.x, this.player.y, best.x, best.y),
      this.run.team.length,
      this.run.mods,
    );

    if (!attempt.possible) {
      bus.emit('log', { text: CATCH_FAIL_TEXT[attempt.reason ?? 'zu_weit'], color: '#94a3b8' });
      return;
    }

    this.throwBall(best, attempt.chance);
  }

  /** Ballwurf-Animation; die Auswertung passiert beim Aufprall. */
  private throwBall(target: Enemy, chance: number): void {
    const ball = this.add.image(this.player.x, this.player.y, 'ball').setDepth(30).setTint(0xef4444);
    const tx = target.x;
    const ty = target.y;

    this.tweens.add({
      targets: ball,
      x: tx,
      y: ty,
      rotation: Math.PI * 4,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => {
        ball.destroy();
        if (!target.active) return;
        this.resolveCatch(target, chance);
      },
    });
  }

  private resolveCatch(target: Enemy, chance: number): void {
    const success = rollCatch(this.run.rng, { possible: true, chance });

    if (!success) {
      this.floater(target.x, target.y - 30, 'ausgebrochen!', 0xf87171, false);
      bus.emit('log', {
        text: `${target.species.name} bricht aus (${Math.round(chance * 100)} %).`,
        color: '#f87171',
      });
      return;
    }

    this.burst(target.x, target.y, 0xfde047, 12);
    this.floater(target.x, target.y - 30, 'gefangen!', 0xfde047, true);

    this.run.addToTeam(target.species.id);
    this.run.stats.catches++;
    const gained = this.run.award(REWARDS.perCatch);
    recordDex(this.meta, target.species.id, 'caught', this.run.floor);
    saveMeta(this.meta);

    bus.emit('monster:caught', { speciesId: target.species.id });
    bus.emit('log', {
      text: `${target.species.name} gefangen! (+${gained} Ätherstaub)`,
      color: '#fde047',
    });

    target.destroy();
    bus.emit('hud:dirty', undefined);
    this.checkRoomCleared();
  }

  // =======================================================================
  // Truhen & Relikte
  // =======================================================================

  private openChest(): void {
    if (!this.chest || this.chest.opened) return;
    if (!this.room.cleared) {
      // Nur einmal pro Sekunde nörgeln, sonst spammt der Overlap den Log voll.
      if (this.time.now > this.nextChestNagAt) {
        this.nextChestNagAt = this.time.now + 1200;
        bus.emit('log', { text: 'Erst den Raum räumen!', color: '#94a3b8' });
      }
      return;
    }
    this.chest.open();
    this.room.chestOpened = true;
    this.grantRelic();
  }

  private grantRelic(): void {
    const relic = rollRelic(this.run.rng, this.run.relicPool);
    const stacks = this.run.addRelic(relic.id);

    // Relikte, die maximale HP ändern, wirken sofort.
    this.player.maxHp = this.run.trainerMaxHp;
    if (relic.effect.maxHp) {
      this.player.heal(Math.max(0, relic.effect.maxHp));
      if (this.companion) {
        this.companion.maxHp = this.run.monsterMaxHp(this.companion.species);
        this.companion.heal(Math.max(0, relic.effect.maxHp));
        const active = this.run.active;
        if (active) active.hp = this.companion.hp;
      }
    }

    const icon = this.add
      .image(this.player.x, this.player.y - 30, 'orb')
      .setTint(relic.color)
      .setDepth(35)
      .setDisplaySize(22, 22);
    this.tweens.add({
      targets: icon,
      y: icon.y - 46,
      alpha: 0,
      duration: 900,
      onComplete: () => icon.destroy(),
    });

    bus.emit('relic:picked', { relic, stacks });
    bus.emit('log', {
      text: `${relic.name}${stacks > 1 ? ` ×${stacks}` : ''} — ${relic.desc}`,
      color: '#fbbf24',
    });
    bus.emit('hud:dirty', undefined);
  }

  // =======================================================================
  // Update-Schleife
  // =======================================================================

  override update(time: number, delta: number): void {
    if (this.runOver) return;
    const dt = delta / 1000;

    this.updatePlayer(time, dt);
    this.updateCompanion(time);
    this.updateEnemies(time);
    this.updateHoming(dt);
    this.updateRegen(dt);
    this.drawHealthBars();
    this.checkTransitions();
  }

  private updatePlayer(time: number, _dt: number): void {
    const dx = (this.keys.right.isDown ? 1 : 0) - (this.keys.left.isDown ? 1 : 0);
    const dy = (this.keys.down.isDown ? 1 : 0) - (this.keys.up.isDown ? 1 : 0);
    this.player.move(dx, dy, this.run.trainerSpeed);
    this.run.trainerHp = this.player.hp;

    const pointer = this.input.activePointer;
    if (pointer.isDown && this.player.canShoot(time)) {
      const angle = Math.atan2(pointer.worldY - this.player.y, pointer.worldX - this.player.x);
      this.player.registerShot(time, this.run.trainerFireRate);
      const species = this.run.activeSpecies;
      this.firePattern(
        'single',
        { x: this.player.x, y: this.player.y },
        angle,
        {
          damage: TRAINER.damage,
          // Der Trainer schiesst im Typ seines aktiven Monsters — belohnt die
          // Team-Wahl, ohne ein zweites Waffensystem einzuführen.
          element: species?.type ?? 'normal',
          faction: 'spieler',
          speed: TRAINER.projectileSpeed * pctMul(this.run.mods.projectileSpeedPct),
          bounces: this.run.mods.bounces,
          pierce: this.run.mods.pierce,
        },
      );
    }
  }

  private updateCompanion(time: number): void {
    const comp = this.companion;
    if (!comp) return;

    const target = this.nearestEnemy(comp.x, comp.y, COMPANION.attackRange, true);
    // Im Kampf schiebt sich das Monster zwischen Trainer und Gegner.
    const threat = target ?? this.nearestEnemy(this.player.x, this.player.y, COMPANION.aggroRange);
    comp.follow(
      this.player.x,
      this.player.y,
      this.run.companionSpeed,
      threat ? { x: threat.x, y: threat.y } : null,
    );
    comp.syncRing();

    // Laufende Salve zuerst abarbeiten.
    const burstAngle = comp.tickBurst(time);
    if (burstAngle !== null) {
      this.companionShoot(comp, burstAngle, 'single');
      return;
    }
    if (!target || !comp.readyToShoot(time)) return;

    const angle = Math.atan2(target.y - comp.y, target.x - comp.x);
    comp.registerShot(time, this.run.monsterFireRate(comp.species));

    if (comp.species.pattern === 'burst3') {
      comp.beginBurst(3, angle, time);
      const first = comp.tickBurst(time);
      if (first !== null) this.companionShoot(comp, first, 'single');
      return;
    }
    this.companionShoot(comp, angle, comp.species.pattern);
  }

  private companionShoot(comp: Companion, angle: number, pattern: string): void {
    this.firePattern(
      pattern,
      { x: comp.x, y: comp.y },
      angle,
      {
        damage: comp.species.attack,
        element: comp.species.type,
        faction: 'spieler',
        speed: COMPANION.projectileSpeed * pctMul(this.run.mods.projectileSpeedPct),
        bounces: this.run.mods.bounces,
        pierce: this.run.mods.pierce,
      },
    );
  }

  private updateEnemies(time: number): void {
    for (const obj of this.enemies.getChildren()) {
      const enemy = obj as Enemy;
      if (!enemy.active) continue;

      // Fangbarkeits-Markierung pulsieren lassen (unabhängig vom Angriff).
      if (enemy.catchable) enemy.setAlpha(0.6 + 0.4 * Math.sin(time / 120));

      // Das Begleitmonster ist die Frontlinie: Gegner nehmen es ins Visier,
      // solange es in Aggro-Reichweite ist. Der Trainer bekommt nur ab, was
      // danebengeht oder ihn direkt berührt.
      let tx = this.player.x;
      let ty = this.player.y;
      if (this.companion) {
        const dc = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.companion.x, this.companion.y);
        if (dc <= COMPANION.aggroRange) {
          tx = this.companion.x;
          ty = this.companion.y;
        }
      }

      const intent = enemy.think(time, tx, ty, enemy.species.attackSpeed);
      if (intent.kind === 'nichts') continue;

      const damage = Math.max(
        1,
        Math.round(enemy.species.attack * enemy.damageScale * (enemy.isBoss ? 1.15 : 1)),
      );
      this.fireEnemyPattern(enemy, intent.angle, damage, intent.kind === 'nahkampf');
    }
  }

  private fireEnemyPattern(enemy: Enemy, angle: number, damage: number, melee: boolean): void {
    const base = {
      damage,
      element: enemy.species.type,
      faction: 'gegner' as const,
      speed: 250 + (enemy.isBoss ? 40 : 0),
      bounces: 0,
      pierce: 0,
    };
    this.firePattern(melee ? 'melee' : enemy.species.pattern, { x: enemy.x, y: enemy.y }, angle, base);
  }

  /** Zielsuchende Projektile jeden Frame nachführen. */
  private updateHoming(dt: number): void {
    for (const obj of this.projectiles.getChildren()) {
      const proj = obj as Projectile;
      if (!proj.active || !proj.homing) continue;
      if (proj.faction === 'spieler') {
        const t = this.nearestEnemy(proj.x, proj.y, 420);
        if (t) proj.steerTowards(t.x, t.y, dt);
      } else {
        const t = this.companion ?? this.player;
        proj.steerTowards(t.x, t.y, dt);
      }
    }
  }

  /** HP-Regeneration und aufgelaufener Lebensraub. */
  private updateRegen(dt: number): void {
    const regen = this.run.mods.hpRegen * dt + this.regenCarry;
    this.regenCarry = 0;
    if (regen <= 0) return;

    const before = this.player.hp;
    this.player.maxHp = this.run.trainerMaxHp;
    this.player.heal(regen);
    if (this.companion) {
      this.companion.heal(regen);
      const active = this.run.active;
      if (active) active.hp = this.companion.hp;
    }
    if (Math.floor(this.player.hp) !== Math.floor(before)) {
      this.run.trainerHp = this.player.hp;
      bus.emit('hud:dirty', undefined);
    }
  }

  /**
   * Nächster Gegner. `sparePrey` lässt fangbare Gegner aus, solange es noch
   * andere Ziele gibt — sonst zerlegt das Begleitmonster genau das Monster,
   * das der Spieler gerade fangen will, bevor er den Ball werfen kann.
   */
  private nearestEnemy(x: number, y: number, maxRange: number, sparePrey = false): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = maxRange;
    let fallback: Enemy | null = null;
    let fallbackDist = maxRange;

    for (const obj of this.enemies.getChildren()) {
      const e = obj as Enemy;
      if (!e.active) continue;
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (sparePrey && e.catchable) {
        if (d < fallbackDist) {
          fallbackDist = d;
          fallback = e;
        }
        continue;
      }
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best ?? fallback;
  }

  /** Tür- und Portal-Übergänge prüfen. */
  private checkTransitions(): void {
    if (this.transitioning) return;

    if (this.portal) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.portal.x, this.portal.y) < 30) {
        this.transitioning = true;
        this.nextFloor();
        return;
      }
    }

    const room = this.room;
    if (!room.cleared) return;

    const { col, row } = worldToTile(this.player.x, this.player.y);
    if (room.tiles.grid[row]?.[col] !== Tile.Door) return;

    for (const dir of Object.keys(room.tiles.doors) as Direction[]) {
      const door = room.tiles.doors[dir];
      if (!door) continue;
      const onThisDoor =
        dir === 'north' || dir === 'south' ? row === door.row : col === door.col;
      if (!onThisDoor) continue;
      const targetIndex = room.neighbors[dir];
      if (targetIndex === undefined) continue;

      this.transitioning = true;
      this.cameras.main.fadeOut(110, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.enterRoom(targetIndex, OPPOSITE[dir]);
        this.cameras.main.fadeIn(110, 0, 0, 0);
      });
      return;
    }
  }

  // =======================================================================
  // Darstellung: HP-Balken und Effekte
  // =======================================================================

  private drawHealthBars(): void {
    const g = this.barGfx;
    g.clear();

    const bar = (x: number, y: number, w: number, ratio: number, color: number) => {
      g.fillStyle(0x000000, 0.55);
      g.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
      g.fillStyle(color, 1);
      g.fillRect(x - w / 2, y, w * Phaser.Math.Clamp(ratio, 0, 1), 4);
    };

    for (const obj of this.enemies.getChildren()) {
      const e = obj as Enemy;
      if (!e.active) continue;
      const w = e.isBoss ? 64 : 28;
      bar(e.x, e.y - e.radius - 12, w, e.hpRatio, e.catchable ? 0xfde047 : COLORS.hpBad);
    }

    if (this.companion) {
      bar(
        this.companion.x,
        this.companion.y - 26,
        30,
        this.companion.hp / this.companion.maxHp,
        COLORS.hpGood,
      );
    }
  }

  /** Aufsteigende Schadens-/Statuszahl. */
  private floater(x: number, y: number, text: string, color: number, big: boolean): void {
    const label = this.add
      .text(x, y, text, {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: big ? '18px' : '13px',
        color: '#' + color.toString(16).padStart(6, '0'),
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(50);

    this.tweens.add({
      targets: label,
      y: y - (big ? 40 : 26),
      alpha: 0,
      duration: big ? 900 : 620,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /** Kleiner Partikelausbruch (Tod, Fang). */
  private burst(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + this.run.rng.float(-0.3, 0.3);
      const dist = this.run.rng.float(18, 46);
      const p = this.add
        .image(x, y, 'spark')
        .setTint(color)
        .setDepth(45)
        .setDisplaySize(8, 8);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 380,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  // =======================================================================
  // Run-Ende
  // =======================================================================

  private endRun(): void {
    if (this.runOver) return;
    this.runOver = true;

    // Meta-Fortschritt sichern — das ist der Kern der Roguelite-Schleife.
    this.meta.currency += this.run.currency;
    this.meta.lifetime.runs++;
    this.meta.lifetime.kills += this.run.stats.kills;
    this.meta.lifetime.catches += this.run.stats.catches;
    this.meta.lifetime.totalCurrencyEarned += this.run.currency;
    this.meta.lifetime.bestFloor = Math.max(this.meta.lifetime.bestFloor, this.run.floor);
    this.meta.lifetime.bestRoomsCleared = Math.max(
      this.meta.lifetime.bestRoomsCleared,
      this.run.stats.roomsCleared,
    );
    saveMeta(this.meta);

    bus.emit('run:over', undefined);
    this.cameras.main.shake(400, 0.014);
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.time.delayedCall(680, () => {
      this.scene.stop('Hud');
      this.scene.start('GameOver', {
        stats: this.run.stats,
        floor: this.run.floor,
        earned: this.run.currency,
        relics: this.run.relicList(),
        team: this.run.team.map((m) => m.speciesId),
      });
    });
  }
}

/** Übersetzt dauerhafte Hub-Upgrades in Relikt-artige Modifikatoren. */
function permanentBonusFrom(meta: MetaSave) {
  // Wirkung der Stufen; die Definitionen (Kosten, Maxstufe) leben in MetaSave.
  const lvl = meta.upgrades;
  return {
    maxHp: lvl.vitalitaet * 10,
    damagePct: lvl.ausbildung * 0.04,
    moveSpeedPct: lvl.laufschuhe * 0.04,
    catchBonus: lvl.koeder * 0.06,
  };
}
