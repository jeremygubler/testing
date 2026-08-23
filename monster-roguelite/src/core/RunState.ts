import { CATCH, COMPANION, TRAINER } from '../config/GameConfig';
import { getSpecies, type MonsterSpecies } from '../data/monsters';
import { getRelic, type Relic } from '../data/relics';
import { aggregate, pctMul, type AggregatedStats } from './StatBlock';
import { Rng } from './Rng';

/** Ein Monster im Team des Spielers (Instanz, nicht Art). */
export interface TeamMonster {
  speciesId: string;
  /** Aktuelle HP. Bleibt zwischen Räumen erhalten. */
  hp: number;
  /** Stufe. Skaliert HP und Angriff (siehe `levelMultiplier`). */
  level: number;
  /** Erfahrung auf der aktuellen Stufe. */
  xp: number;
}

/**
 * Stat-Multiplikator einer Stufe.
 *
 * Ohne Stufen wäre ein auf Etage 5 gefangenes Monster exakt so stark wie der
 * Starter aus Etage 1 — Fangen würde ab der zweiten Etage sinnlos. Die Kurve
 * ist bewusst flach: Stufen sollen ein Nachziehen ermöglichen, nicht die
 * Relikt-Stapel als Hauptquelle für Stärke ablösen.
 */
export function levelMultiplier(level: number): number {
  return 1 + (Math.max(1, level) - 1) * 0.11;
}

/** Erfahrung bis zur nächsten Stufe. */
export function xpToNext(level: number): number {
  return 24 + level * 18;
}

/** Statistiken für den Game-Over-Screen. */
export interface RunStats {
  kills: number;
  catches: number;
  roomsCleared: number;
  floorsCleared: number;
  bossesDefeated: number;
  elitesDefeated: number;
  relicsFound: number;
  purchases: number;
  damageDealt: number;
  startedAt: number;
}

/**
 * Der komplette Zustand eines laufenden Runs.
 *
 * Bewusst frei von Phaser: Szenen lesen hieraus, schreiben hierhin, aber der
 * Zustand selbst weiss nichts von Sprites. Das erlaubt Game-Over-Screen und
 * HUD, dieselbe Quelle zu befragen.
 */
export class RunState {
  readonly rng: Rng;
  readonly seed: number;

  /** Relikt-Id → Stapelzahl. */
  readonly relics = new Map<string, number>();
  /** Pool an Relikt-Ids, die in diesem Run droppen können (Meta-Unlocks). */
  relicPool: string[] = [];

  team: TeamMonster[] = [];
  activeIndex = 0;

  trainerHp: number;
  floor = 1;
  /** Index des aktuellen Raums innerhalb der Etage. */
  roomIndex = 0;
  currency = 0;

  /** Dauerhafte Meta-Boni, die wie ein unsichtbares Relikt eingerechnet werden. */
  permanentBonus: Partial<AggregatedStats> = {};

  readonly stats: RunStats = {
    kills: 0,
    catches: 0,
    roomsCleared: 0,
    floorsCleared: 0,
    bossesDefeated: 0,
    elitesDefeated: 0,
    relicsFound: 0,
    purchases: 0,
    damageDealt: 0,
    startedAt: Date.now(),
  };

  /** Gecacht, weil pro Frame mehrfach gelesen. Invalidiert bei Relikt-Änderung. */
  private cachedStats: AggregatedStats | null = null;

  constructor(seed = Rng.randomSeed()) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.trainerHp = TRAINER.maxHp;
  }

  // --- Relikte -----------------------------------------------------------

  addRelic(id: string): number {
    const next = (this.relics.get(id) ?? 0) + 1;
    this.relics.set(id, next);
    this.cachedStats = null;
    this.stats.relicsFound++;
    return next;
  }

  relicCount(id: string): number {
    return this.relics.get(id) ?? 0;
  }

  /** Relikte als sortierte Liste für die UI (neueste Seltenheit zuerst). */
  relicList(): { relic: Relic; stacks: number }[] {
    return [...this.relics.entries()]
      .map(([id, stacks]) => ({ relic: getRelic(id), stacks }))
      .sort((a, b) => a.relic.name.localeCompare(b.relic.name, 'de'));
  }

  /** Aggregierte Boni aus allen Relikten + Meta-Upgrades. */
  get mods(): AggregatedStats {
    if (!this.cachedStats) this.cachedStats = aggregate(this.relics, this.permanentBonus);
    return this.cachedStats;
  }

  // --- Team --------------------------------------------------------------

  get active(): TeamMonster | null {
    return this.team[this.activeIndex] ?? null;
  }

  get activeSpecies(): MonsterSpecies | null {
    const a = this.active;
    return a ? getSpecies(a.speciesId) : null;
  }

  /** Nimmt ein Monster ins Team. Gefangene starten auf Höhe der Etage. */
  addToTeam(speciesId: string, level = 1): boolean {
    if (this.team.length >= CATCH.teamSize) return false;
    const member: TeamMonster = { speciesId, hp: 0, level: Math.max(1, level), xp: 0 };
    member.hp = this.maxHpOf(member);
    this.team.push(member);
    return true;
  }

  /**
   * Erfahrung verteilen. Das aktive Monster bekommt alles, die Bank die
   * Hälfte — so lohnt sich ein Wechsel, ohne dass die Reserve abgehängt wird.
   * Gibt die Monster zurück, die dabei aufgestiegen sind.
   */
  grantXp(amount: number): TeamMonster[] {
    const leveled: TeamMonster[] = [];
    this.team.forEach((member, i) => {
      if (member.hp <= 0) return;
      const share = i === this.activeIndex ? amount : amount * 0.5;
      member.xp += share;
      while (member.xp >= xpToNext(member.level)) {
        member.xp -= xpToNext(member.level);
        member.level++;
        // Ein Aufstieg heilt anteilig — das ist die Belohnung fürs Dranbleiben.
        member.hp = Math.min(this.maxHpOf(member), member.hp + this.maxHpOf(member) * 0.25);
        leveled.push(member);
      }
    });
    return leveled;
  }

  /** Wechselt zum nächsten lebenden Monster. Gibt false zurück, wenn keins übrig. */
  cycleActive(direction = 1): boolean {
    if (this.team.length === 0) return false;
    for (let i = 1; i <= this.team.length; i++) {
      const idx = (this.activeIndex + direction * i + this.team.length * 2) % this.team.length;
      if ((this.team[idx]?.hp ?? 0) > 0) {
        this.activeIndex = idx;
        return true;
      }
    }
    return false;
  }

  selectActive(index: number): boolean {
    const m = this.team[index];
    if (!m || m.hp <= 0) return false;
    this.activeIndex = index;
    return true;
  }

  /** Mindestens ein Monster ist noch kampffähig. */
  hasLivingMonster(): boolean {
    return this.team.some((m) => m.hp > 0);
  }

  // --- Abgeleitete Werte (Relikte eingerechnet) --------------------------

  monsterMaxHp(species: MonsterSpecies, level = 1): number {
    return Math.max(
      1,
      Math.round(
        species.maxHp * COMPANION.playerHpMultiplier * levelMultiplier(level) + this.mods.maxHp,
      ),
    );
  }

  /** Maximale HP eines konkreten Teammitglieds (inkl. seiner Stufe). */
  maxHpOf(member: TeamMonster): number {
    return this.monsterMaxHp(getSpecies(member.speciesId), member.level);
  }

  /** Angriffswert eines Teammitglieds (inkl. seiner Stufe). */
  attackOf(member: TeamMonster): number {
    return getSpecies(member.speciesId).attack * levelMultiplier(member.level);
  }

  get trainerMaxHp(): number {
    return Math.max(1, Math.round(TRAINER.maxHp + this.mods.maxHp));
  }

  get trainerSpeed(): number {
    return TRAINER.speed * pctMul(this.mods.moveSpeedPct);
  }

  get companionSpeed(): number {
    return COMPANION.followSpeed * pctMul(this.mods.moveSpeedPct);
  }

  get trainerFireRate(): number {
    return TRAINER.fireRate * pctMul(this.mods.attackSpeedPct);
  }

  monsterFireRate(species: MonsterSpecies): number {
    return species.attackSpeed * pctMul(this.mods.attackSpeedPct);
  }

  /** Währungsgutschrift inkl. Relikt-Bonus. */
  award(amount: number): number {
    const gained = Math.max(0, Math.round(amount * pctMul(this.mods.currencyPct)));
    this.currency += gained;
    return gained;
  }

  /** Gegner-Skalierung nach Etage. */
  get enemyHpScale(): number {
    return 1 + (this.floor - 1) * 0.28;
  }

  get enemyDamageScale(): number {
    return 1 + (this.floor - 1) * 0.18;
  }
}
