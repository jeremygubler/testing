import { ELITE, FLOOR } from '../config/GameConfig';
import type { Rng } from '../core/Rng';
import { BOSS_SPECIES, spawnableOn, type MonsterSpecies } from '../data/monsters';
import { getRelic, RARITY_WEIGHTS, type RelicRarity } from '../data/relics';
import {
  DIRECTIONS,
  DIR_DELTA,
  OPPOSITE,
  ROOM_CENTER,
  buildRoomTiles,
  findFreeTile,
  type Direction,
  type RoomTiles,
} from './RoomLayout';

export type RoomKind = 'start' | 'kampf' | 'schatz' | 'boss' | 'laden';

/** Ein Angebot im Laden-Raum. */
export interface ShopOffer {
  kind: 'relikt' | 'heilung';
  /** Bei 'relikt': die Relikt-Id. */
  relicId?: string;
  name: string;
  price: number;
  color: number;
  sold: boolean;
}

/**
 * Grundpreise je Seltenheit, vor der Etagen-Skalierung.
 *
 * Kalibriert gegen das gemessene Einkommen bis zum Laden (siehe die
 * Ökonomie-Tabelle in `tools/smoke.mjs`). Mit den ersten Werten war der Laden
 * auf Etage 1 in 0 % der Layouts bezahlbar — ein Raum, den man auf der ersten
 * Etage grundsätzlich nur durchquert, ist toter Inhalt.
 */
const RELIC_BASE_PRICE: Record<RelicRarity, number> = {
  gewoehnlich: 26,
  selten: 46,
  legendaer: 76,
};

const HEAL_BASE_PRICE = 18;

/** Preise steigen mit der Etage, sonst ist der Laden ab Etage 3 geschenkt. */
function priceScale(floor: number): number {
  return 1 + (floor - 1) * 0.22;
}

/**
 * Baut das Angebot eines Laden-Raums: zwei Relikte plus eine Heilung.
 *
 * Der Laden verkauft gegen dieselbe Währung, die am Ende in den Meta-Fortschritt
 * fliesst. Das ist die eigentliche Entscheidung: jetzt Stärke kaufen und den
 * Run weiter treiben, oder sparen und im Basislager dauerhaft freischalten.
 */
function buildShopOffers(rng: Rng, floor: number, pool: readonly string[]): ShopOffer[] {
  const offers: ShopOffer[] = [];
  const remaining = [...pool];

  for (let i = 0; i < 2 && remaining.length > 0; i++) {
    const relics = remaining.map(getRelic);
    const relic = rng.pickWeighted(relics, (r) => RARITY_WEIGHTS[r.rarity]);
    remaining.splice(remaining.indexOf(relic.id), 1);
    offers.push({
      kind: 'relikt',
      relicId: relic.id,
      name: relic.name,
      price: Math.round(RELIC_BASE_PRICE[relic.rarity] * priceScale(floor)),
      color: relic.color,
      sold: false,
    });
  }

  offers.push({
    kind: 'heilung',
    name: 'Heiltrank',
    price: Math.round(HEAL_BASE_PRICE * priceScale(floor)),
    color: 0x4ade80,
    sold: false,
  });

  return offers;
}

export interface EnemySpawn {
  speciesId: string;
  col: number;
  row: number;
  isBoss: boolean;
  /** Verstärkte Variante — mehr HP, mehr Schaden, mehr Beute. */
  isElite?: boolean;
}

export interface RoomNode {
  index: number;
  /** Position im Etagen-Gitter (nur für die Minikarte relevant). */
  gx: number;
  gy: number;
  kind: RoomKind;
  neighbors: Partial<Record<Direction, number>>;
  tiles: RoomTiles;
  enemies: EnemySpawn[];
  /** Truhe im Raum? (Schatzräume immer, Kampfräume mit Chance.) */
  chest: { col: number; row: number } | null;
  /** Angebote, falls es ein Laden-Raum ist. */
  shop: ShopOffer[];
  /** Wird zur Laufzeit gesetzt, sobald der Raum leergekämpft ist. */
  cleared: boolean;
  /** Wurde die Truhe schon geöffnet? */
  chestOpened: boolean;
  visited: boolean;
}

export interface FloorPlan {
  floor: number;
  rooms: RoomNode[];
  startIndex: number;
  bossIndex: number;
  /** Gitter-Bounds für die Minikarte. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

const key = (x: number, y: number) => `${x},${y}`;

/**
 * Erzeugt eine Etage als Raum-Graph.
 *
 * Verfahren: Random Walk mit Verzweigungen auf einem Gitter. Danach wird der
 * vom Start am weitesten entfernte Raum zum Boss-Raum (BFS-Distanz), damit der
 * Weg dorthin nie trivial kurz ist. Ein bis zwei Sackgassen werden zu
 * Schatzräumen — dort gibt es garantiert ein Relikt.
 */
export function generateFloor(rng: Rng, floor: number, relicPool: readonly string[] = []): FloorPlan {
  const roomCount = Math.min(
    FLOOR.maxRooms,
    FLOOR.baseRooms + (floor - 1) * FLOOR.roomGrowth,
  );

  // --- 1) Gitterpositionen per Random Walk belegen ------------------------
  const occupied = new Map<string, { gx: number; gy: number }>();
  const order: { gx: number; gy: number }[] = [];
  let cx = 0;
  let cy = 0;
  occupied.set(key(cx, cy), { gx: cx, gy: cy });
  order.push({ gx: cx, gy: cy });

  let guard = 0;
  while (order.length < roomCount && guard++ < 500) {
    // Gelegentlich von einem beliebigen bestehenden Raum aus weiterlaufen —
    // erzeugt Verzweigungen statt eines langen Schlauchs.
    if (rng.chance(0.35)) {
      const from = rng.pick(order);
      cx = from.gx;
      cy = from.gy;
    }
    const dir = rng.pick(DIRECTIONS);
    const nx = cx + DIR_DELTA[dir].dx;
    const ny = cy + DIR_DELTA[dir].dy;
    if (occupied.has(key(nx, ny))) {
      cx = nx;
      cy = ny;
      continue;
    }
    occupied.set(key(nx, ny), { gx: nx, gy: ny });
    order.push({ gx: nx, gy: ny });
    cx = nx;
    cy = ny;
  }

  // --- 2) Knoten anlegen und Nachbarschaften verdrahten -------------------
  const indexByPos = new Map<string, number>();
  order.forEach((pos, i) => indexByPos.set(key(pos.gx, pos.gy), i));

  const neighborLists = order.map((pos) => {
    const n: Partial<Record<Direction, number>> = {};
    for (const dir of DIRECTIONS) {
      const target = indexByPos.get(key(pos.gx + DIR_DELTA[dir].dx, pos.gy + DIR_DELTA[dir].dy));
      if (target !== undefined) n[dir] = target;
    }
    return n;
  });

  // --- 3) Boss = grösste BFS-Distanz zum Start ----------------------------
  const dist = bfsDistances(neighborLists, 0);
  let bossIndex = 0;
  let best = -1;
  dist.forEach((d, i) => {
    if (i !== 0 && d > best) {
      best = d;
      bossIndex = i;
    }
  });
  if (bossIndex === 0) bossIndex = order.length - 1;

  // --- 4) Schatzräume: Sackgassen, die nicht Start/Boss sind --------------
  const deadEnds = neighborLists
    .map((n, i) => ({ i, degree: Object.keys(n).length }))
    .filter((r) => r.degree === 1 && r.i !== 0 && r.i !== bossIndex)
    .map((r) => r.i);
  const treasureCount = Math.min(deadEnds.length, floor === 1 ? 1 : rng.int(1, 2));
  const treasures = new Set(rng.shuffle([...deadEnds]).slice(0, treasureCount));
  // Falls es keine Sackgasse gibt, wird ein beliebiger Zwischenraum zum Schatzraum.
  if (treasures.size === 0 && order.length > 2) {
    const candidates = order.map((_, i) => i).filter((i) => i !== 0 && i !== bossIndex);
    if (candidates.length > 0) treasures.add(rng.pick(candidates));
  }

  // --- 4b) Laden-Raum ------------------------------------------------------
  // Bevorzugt eine freie Sackgasse, und darunter die vom Start am weitesten
  // entfernte: Wer den Laden auf den ersten Metern passiert, hat noch nichts
  // verdient und läuft an einem Angebot vorbei, das er sich nicht leisten kann.
  let shopIndex = -1;
  if (relicPool.length > 0 && order.length > 3) {
    const freeDeadEnds = deadEnds.filter((i) => !treasures.has(i));
    const candidates =
      freeDeadEnds.length > 0
        ? freeDeadEnds
        : order.map((_, i) => i).filter((i) => i !== 0 && i !== bossIndex && !treasures.has(i));
    if (candidates.length > 0) {
      shopIndex = candidates.reduce((best, i) => (dist[i]! > dist[best]! ? i : best), candidates[0]!);
    }
  }

  // --- 5) Räume ausbauen ---------------------------------------------------
  const rooms: RoomNode[] = order.map((pos, i) => {
    const kind: RoomKind =
      i === 0
        ? 'start'
        : i === bossIndex
          ? 'boss'
          : treasures.has(i)
            ? 'schatz'
            : i === shopIndex
              ? 'laden'
              : 'kampf';
    const exits = Object.keys(neighborLists[i]!) as Direction[];
    const tiles = buildRoomTiles(rng, exits, kind === 'kampf');

    const enemies: EnemySpawn[] = [];
    if (kind === 'kampf') {
      const count = rng.int(
        FLOOR.minEnemies,
        Math.min(FLOOR.maxEnemies, FLOOR.minEnemies + Math.floor(floor / 2) + 1),
      );
      const eliteChance =
        floor < ELITE.minFloor
          ? 0
          : Math.min(
              ELITE.maxChance,
              ELITE.baseChance + (floor - ELITE.minFloor) * ELITE.chanceGrowth,
            );
      let elitesPlaced = 0;
      for (let e = 0; e < count; e++) {
        const spot = findFreeTile(rng, tiles.grid, [
          { col: ROOM_CENTER.col, row: ROOM_CENTER.row, minDist: 4 },
          ...enemies.map((x) => ({ col: x.col, row: x.row, minDist: 2 })),
        ]);
        const isElite = elitesPlaced < ELITE.maxPerRoom && rng.chance(eliteChance);
        if (isElite) elitesPlaced++;
        enemies.push({
          speciesId: pickWildSpecies(rng, floor).id,
          col: spot.col,
          row: spot.row,
          isBoss: false,
          isElite,
        });
      }
    } else if (kind === 'boss') {
      const boss = rng.pick(BOSS_SPECIES);
      enemies.push({ speciesId: boss.id, col: ROOM_CENTER.col, row: 4, isBoss: true });
      // Boss bekommt zwei Begleiter ab Etage 2.
      if (floor >= 2) {
        for (let e = 0; e < 2; e++) {
          const spot = findFreeTile(rng, tiles.grid, [
            { col: ROOM_CENTER.col, row: ROOM_CENTER.row, minDist: 3 },
          ]);
          enemies.push({
            speciesId: pickWildSpecies(rng, floor).id,
            col: spot.col,
            row: spot.row,
            isBoss: false,
          });
        }
      }
    }

    let chest: RoomNode['chest'] = null;
    if (kind === 'schatz') {
      chest = { col: ROOM_CENTER.col, row: ROOM_CENTER.row };
    } else if (kind === 'kampf' && rng.chance(0.35)) {
      chest = findFreeTile(rng, tiles.grid, [
        { col: ROOM_CENTER.col, row: ROOM_CENTER.row, minDist: 3 },
        ...enemies.map((x) => ({ col: x.col, row: x.row, minDist: 2 })),
      ]);
    }

    return {
      index: i,
      gx: pos.gx,
      gy: pos.gy,
      kind,
      neighbors: neighborLists[i]!,
      tiles,
      enemies,
      chest,
      shop: kind === 'laden' ? buildShopOffers(rng, floor, relicPool) : [],
      cleared: kind === 'start' || kind === 'schatz' || kind === 'laden',
      chestOpened: false,
      visited: i === 0,
    };
  });

  const bounds = {
    minX: Math.min(...order.map((p) => p.gx)),
    maxX: Math.max(...order.map((p) => p.gx)),
    minY: Math.min(...order.map((p) => p.gy)),
    maxY: Math.max(...order.map((p) => p.gy)),
  };

  return { floor, rooms, startIndex: 0, bossIndex, bounds };
}

/** Gegner-Auswahl: höhere Etagen ziehen häufiger die zäheren Arten. */
function pickWildSpecies(rng: Rng, floor: number): MonsterSpecies {
  return rng.pickWeighted(spawnableOn(floor), (s) => {
    // Grober Stärkeindex der Art.
    const power = s.maxHp * 0.01 + s.attack * 0.1;
    // Auf Etage 1 sind schwache Arten stark bevorzugt, später gleicht es sich an.
    const bias = Math.max(0.2, 3.2 - floor * 0.5);
    return Math.max(0.05, 1 / Math.pow(power, bias));
  });
}

function bfsDistances(
  neighbors: Partial<Record<Direction, number>>[],
  start: number,
): number[] {
  const dist = new Array<number>(neighbors.length).fill(-1);
  dist[start] = 0;
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const dir of DIRECTIONS) {
      const next = neighbors[cur]![dir];
      if (next === undefined || dist[next] !== -1) continue;
      dist[next] = dist[cur]! + 1;
      queue.push(next);
    }
  }
  return dist;
}

/** Richtung, über die man von `from` nach `to` gelangt. */
export function directionBetween(from: RoomNode, to: RoomNode): Direction | null {
  for (const dir of DIRECTIONS) {
    if (from.neighbors[dir] === to.index) return dir;
  }
  return null;
}

export { OPPOSITE };
