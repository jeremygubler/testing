/**
 * Zentrale Konstanten. Alles was am Spielgefühl schraubt, gehört hierher —
 * nicht verstreut in die Systeme.
 */

/** Kachelgrösse in Pixeln. Räume sind grid-basiert. */
export const TILE = 32;

/** Raumgrösse in Kacheln (inkl. Wandrahmen). */
export const ROOM_COLS = 25;
export const ROOM_ROWS = 15;

/** Canvas-Auflösung. Der Raum wird darin zentriert, der Rest ist HUD-Rand. */
export const VIEW_W = 960;
export const VIEW_H = 600;

/** Pixel-Offset, damit das Raumgitter mittig im Canvas sitzt. */
export const ROOM_OFFSET_X = Math.floor((VIEW_W - ROOM_COLS * TILE) / 2);
export const ROOM_OFFSET_Y = Math.floor((VIEW_H - ROOM_ROWS * TILE) / 2) + 14;

/** Farbpalette (Platzhalter-Grafik = farbige Shapes). */
export const COLORS = {
  bg: 0x0b0d16,
  floor: 0x1b2033,
  floorAlt: 0x161a2a,
  wall: 0x323a55,
  wallTop: 0x424c70,
  door: 0x6f5a2e,
  doorOpen: 0xd9a441,
  obstacle: 0x2b3450,
  trainer: 0x8ad7ff,
  hpGood: 0x4ade80,
  hpBad: 0xef4444,
  gold: 0xfbbf24,
  chest: 0xb07a3c,
  text: '#e6e9f5',
  textDim: '#8b93b0',
} as const;

/** Trainer-Basiswerte. */
export const TRAINER = {
  maxHp: 120,
  speed: 190,
  /** Schüsse pro Sekunde. */
  fireRate: 2.6,
  damage: 6,
  projectileSpeed: 460,
  /** Unverwundbarkeit nach Treffer, in ms. */
  iframes: 700,
  radius: 11,
  /**
   * Schadensdämpfung für den Trainer. Das Begleitmonster ist die Frontlinie —
   * der Trainer soll Streuschaden abkönnen, sonst ist ein Raum mit drei
   * Fernkämpfern in fünf Sekunden vorbei.
   */
  damageTaken: 0.6,
} as const;

/** Begleitmonster-Verhalten. */
export const COMPANION = {
  /** Wunschabstand zum Trainer beim Folgen (ohne Gegner in Sicht). */
  followDistance: 46,
  /**
   * Abstand, mit dem sich das Monster im Kampf vor den Trainer schiebt.
   * Muss deutlich grösser als die Trefferradien beider sein, sonst fängt der
   * Trainer die Schüsse ab, die dem Monster gelten.
   */
  screenDistance: 78,
  /**
   * Das eigene Monster kämpft regelmässig gegen mehrere Gegner gleichzeitig.
   * Ohne Heldenbonus ist ein 1-gegen-3 mit denselben Grundwerten rechnerisch
   * immer verloren — die Artwerte bleiben so untereinander vergleichbar.
   */
  playerHpMultiplier: 2.0,
  /** Kurze Unverwundbarkeit, damit eine Salve das Monster nicht auslöscht. */
  iframes: 220,
  followSpeed: 230,
  /** Reichweite der Auto-Attacke. */
  attackRange: 260,
  /**
   * Bis zu dieser Distanz zieht das Begleitmonster die Aufmerksamkeit der
   * Gegner auf sich, auch wenn der Trainer näher steht.
   */
  aggroRange: 340,
  projectileSpeed: 420,
  radius: 12,
} as const;

/** Fang-Mechanik. */
export const CATCH = {
  /** Maximaler HP-Anteil, ab dem gefangen werden kann. */
  hpThreshold: 0.3,
  /** Reichweite des Fangwurfs. */
  range: 150,
  /** Grundchance bei 0 % HP (linear runter bis hpThreshold). */
  baseChance: 0.75,
  /** Abklingzeit zwischen zwei Fangversuchen, in ms. */
  cooldown: 900,
  teamSize: 4,
} as const;

/** Etagen-/Progressionskurve. */
export const FLOOR = {
  /** Anzahl normaler Räume auf Etage n = base + n * growth (gedeckelt). */
  baseRooms: 6,
  roomGrowth: 1,
  maxRooms: 12,
  /** Gegner-Skalierung pro Etage. */
  hpScalePerFloor: 0.28,
  damageScalePerFloor: 0.18,
  /** Gegner pro Kampfraum. */
  minEnemies: 2,
  maxEnemies: 5,
} as const;

/** Belohnungen (Meta-Währung "Ätherstaub"). */
/** Erholung nach einem geräumten Raum, als Anteil der maximalen HP. */
export const ROOM_RECOVERY = {
  trainer: 0.06,
  monster: 0.12,
} as const;

export const REWARDS = {
  perKill: 2,
  perCatch: 12,
  perRoomCleared: 3,
  perFloorCleared: 25,
  perBoss: 40,
} as const;
