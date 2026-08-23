import { ROOM_COLS, ROOM_ROWS, ROOM_OFFSET_X, ROOM_OFFSET_Y, TILE } from '../config/GameConfig';
import type { Rng } from '../core/Rng';

export type Direction = 'north' | 'south' | 'east' | 'west';

export const DIRECTIONS: Direction[] = ['north', 'south', 'east', 'west'];

export const OPPOSITE: Record<Direction, Direction> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
};

/** Gitterversatz je Richtung. */
export const DIR_DELTA: Record<Direction, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

export const enum Tile {
  Floor = 0,
  Wall = 1,
  /** Türfeld: begehbar, sobald der Raum leergekämpft ist. */
  Door = 2,
  /** Innenhindernis: blockiert Bewegung und Projektile. */
  Obstacle = 3,
}

/** Türbreite in Kacheln (ungerade Zahl, mittig auf der Wandseite). */
const DOOR_WIDTH = 3;

export interface RoomTiles {
  /** [row][col] */
  grid: Tile[][];
  /** Kachelkoordinaten der Türmitte je Richtung. */
  doors: Partial<Record<Direction, { col: number; row: number }>>;
}

/** Weltkoordinate (Mitte) einer Kachel. */
export function tileToWorld(col: number, row: number): { x: number; y: number } {
  return {
    x: ROOM_OFFSET_X + col * TILE + TILE / 2,
    y: ROOM_OFFSET_Y + row * TILE + TILE / 2,
  };
}

/** Kachel unter einer Weltkoordinate. */
export function worldToTile(x: number, y: number): { col: number; row: number } {
  return {
    col: Math.floor((x - ROOM_OFFSET_X) / TILE),
    row: Math.floor((y - ROOM_OFFSET_Y) / TILE),
  };
}

const CENTER_COL = Math.floor(ROOM_COLS / 2);
const CENTER_ROW = Math.floor(ROOM_ROWS / 2);

/**
 * Baut das Kachelgitter eines Raums.
 *
 * Regeln: Aussenrahmen ist Wand, in jede Richtung mit Nachbar wird eine
 * `DOOR_WIDTH` breite Öffnung geschnitten. Innenhindernisse werden aus einer
 * kleinen Musterbibliothek gewählt und nie auf Tür-Korridore oder die
 * Raummitte gesetzt — sonst kann ein Raum unpassierbar werden.
 */
export function buildRoomTiles(rng: Rng, exits: Direction[], decorated: boolean): RoomTiles {
  const grid: Tile[][] = [];
  for (let row = 0; row < ROOM_ROWS; row++) {
    const line: Tile[] = [];
    for (let col = 0; col < ROOM_COLS; col++) {
      const isBorder = row === 0 || col === 0 || row === ROOM_ROWS - 1 || col === ROOM_COLS - 1;
      line.push(isBorder ? Tile.Wall : Tile.Floor);
    }
    grid.push(line);
  }

  const doors: RoomTiles['doors'] = {};
  const half = Math.floor(DOOR_WIDTH / 2);

  for (const dir of exits) {
    if (dir === 'north' || dir === 'south') {
      const row = dir === 'north' ? 0 : ROOM_ROWS - 1;
      for (let d = -half; d <= half; d++) grid[row]![CENTER_COL + d] = Tile.Door;
      doors[dir] = { col: CENTER_COL, row };
    } else {
      const col = dir === 'east' ? ROOM_COLS - 1 : 0;
      for (let d = -half; d <= half; d++) grid[CENTER_ROW + d]![col] = Tile.Door;
      doors[dir] = { col, row: CENTER_ROW };
    }
  }

  if (decorated) placeObstacles(rng, grid);

  return { grid, doors };
}

/** Freiraum-Korridore, die nie zugebaut werden dürfen. */
function isProtected(col: number, row: number): boolean {
  const corridor = 2;
  const nearCenterCol = Math.abs(col - CENTER_COL) <= corridor;
  const nearCenterRow = Math.abs(row - CENTER_ROW) <= corridor;
  // Kreuz durch die Raummitte bleibt frei → alle Türen sind immer erreichbar.
  return nearCenterCol || nearCenterRow;
}

function placeObstacles(rng: Rng, grid: Tile[][]): void {
  const patterns: ((c: number, r: number) => boolean)[] = [
    // Vier Pfeiler
    (c, r) => (c === 5 || c === ROOM_COLS - 6) && (r === 4 || r === ROOM_ROWS - 5),
    // Zwei kurze Riegel
    (c, r) => r === 4 && c >= 6 && c <= 9,
    (c, r) => r === ROOM_ROWS - 5 && c >= ROOM_COLS - 10 && c <= ROOM_COLS - 7,
    // Ecken-Blöcke
    (c, r) => c >= 3 && c <= 4 && r >= 3 && r <= 4,
    (c, r) => c >= ROOM_COLS - 5 && c <= ROOM_COLS - 4 && r >= ROOM_ROWS - 5 && r <= ROOM_ROWS - 4,
  ];

  const count = rng.int(1, 3);
  const chosen = rng.shuffle([...patterns]).slice(0, count);

  for (let row = 1; row < ROOM_ROWS - 1; row++) {
    for (let col = 1; col < ROOM_COLS - 1; col++) {
      if (isProtected(col, row)) continue;
      if (chosen.some((p) => p(col, row))) grid[row]![col] = Tile.Obstacle;
    }
  }
}

/** Blockiert diese Kachel Bewegung? Türen blockieren nur, wenn verschlossen. */
export function isBlocking(tile: Tile | undefined, doorsLocked: boolean): boolean {
  if (tile === undefined) return true;
  if (tile === Tile.Wall || tile === Tile.Obstacle) return true;
  if (tile === Tile.Door) return doorsLocked;
  return false;
}

/** Freie Bodenkachel für Spawns finden (mit Mindestabstand zu einem Punkt). */
export function findFreeTile(
  rng: Rng,
  grid: Tile[][],
  avoid: { col: number; row: number; minDist: number }[] = [],
  attempts = 60,
): { col: number; row: number } {
  for (let i = 0; i < attempts; i++) {
    const col = rng.int(2, ROOM_COLS - 3);
    const row = rng.int(2, ROOM_ROWS - 3);
    if (grid[row]?.[col] !== Tile.Floor) continue;
    const tooClose = avoid.some(
      (a) => Math.hypot(a.col - col, a.row - row) < a.minDist,
    );
    if (!tooClose) return { col, row };
  }
  // Fallback: erste freie Kachel überhaupt.
  for (let row = 2; row < ROOM_ROWS - 2; row++) {
    for (let col = 2; col < ROOM_COLS - 2; col++) {
      if (grid[row]?.[col] === Tile.Floor) return { col, row };
    }
  }
  return { col: CENTER_COL, row: CENTER_ROW };
}

export const ROOM_CENTER = { col: CENTER_COL, row: CENTER_ROW };
