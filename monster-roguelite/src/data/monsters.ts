import type { ElementType } from './types';

/** Wie ein Monster schiesst. Wird von CombatSystem in Projektile übersetzt. */
export type AttackPattern =
  | 'single' // ein gerader Schuss
  | 'spread3' // drei Schüsse im Fächer
  | 'burst3' // drei Schüsse kurz hintereinander
  | 'homing' // langsames, zielsuchendes Projektil
  | 'melee' // kurze Reichweite, hoher Schaden
  | 'lob'; // langsamer Bogenschuss mit kleinem Flächenschaden

export interface MonsterSpecies {
  id: string;
  name: string;
  type: ElementType;
  /** Basis-Lebenspunkte auf Etage 1. */
  maxHp: number;
  /** Basis-Schaden pro Projektil. */
  attack: number;
  /** Angriffe pro Sekunde. */
  attackSpeed: number;
  /** Bewegungsgeschwindigkeit in px/s (Gegner-KI). */
  moveSpeed: number;
  pattern: AttackPattern;
  /** Grundchance-Modifikator beim Fangen (seltene Monster sind zäher). */
  catchRate: number;
  /** Kurzbeschreibung für Dex/UI. */
  blurb: string;
  /**
   * Ab welcher Etage die Art als Gegner auftaucht. Hält die härteren Arten
   * von Etage 1 fern, ohne an Gewichtungsformeln drehen zu müssen.
   */
  minFloor?: number;
  /** Nur als Gegner/Boss, nicht als Start-Begleiter wählbar. */
  bossOnly?: boolean;
}

/**
 * Monster-Katalog. Rein deklarativ — neue Kreaturen brauchen keinen Code,
 * nur einen Eintrag hier (und ggf. einen Unlock im Hub-Shop).
 */
export const MONSTERS: MonsterSpecies[] = [
  {
    id: 'glutfuchs',
    name: 'Glutfuchs',
    type: 'feuer',
    maxHp: 58,
    attack: 9,
    attackSpeed: 1.5,
    moveSpeed: 108,
    pattern: 'single',
    catchRate: 1.0,
    blurb: 'Flinker Feuerläufer. Solide Allzweckwaffe mit stabilem Dauerschaden.',
  },
  {
    id: 'tropfling',
    name: 'Tröpfling',
    type: 'wasser',
    maxHp: 74,
    attack: 7,
    attackSpeed: 1.7,
    moveSpeed: 96,
    pattern: 'burst3',
    catchRate: 1.0,
    blurb: 'Zäher Begleiter, feuert Salven aus drei Tropfen.',
  },
  {
    id: 'rankenkeim',
    name: 'Rankenkeim',
    type: 'pflanze',
    maxHp: 66,
    attack: 8,
    attackSpeed: 1.2,
    moveSpeed: 92,
    pattern: 'spread3',
    catchRate: 1.0,
    blurb: 'Deckt mit einem Sporenfächer breite Winkel ab.',
  },
  {
    id: 'voltmaus',
    name: 'Voltmaus',
    type: 'elektro',
    maxHp: 48,
    attack: 7,
    attackSpeed: 2.6,
    moveSpeed: 132,
    pattern: 'single',
    catchRate: 1.0,
    blurb: 'Glaskanone: extrem hohe Feuerrate, kaum Lebenspunkte.',
  },
  {
    id: 'puffel',
    name: 'Puffel',
    type: 'normal',
    maxHp: 88,
    attack: 10,
    attackSpeed: 1.0,
    moveSpeed: 84,
    pattern: 'lob',
    catchRate: 1.0,
    blurb: 'Wirft träge Kugeln mit kleinem Flächenschaden. Sehr robust.',
  },
  {
    id: 'brockel',
    name: 'Bröckel',
    type: 'gestein',
    maxHp: 105,
    attack: 14,
    attackSpeed: 0.85,
    moveSpeed: 74,
    pattern: 'melee',
    catchRate: 1.0,
    blurb: 'Wandelnder Felsblock. Langsam, aber im Nahkampf brutal.',
  },
  {
    id: 'aschgeist',
    name: 'Aschgeist',
    type: 'feuer',
    maxHp: 62,
    attack: 11,
    attackSpeed: 1.1,
    moveSpeed: 118,
    pattern: 'homing',
    catchRate: 0.8,
    blurb: 'Schickt zielsuchende Glutfunken los, die selten danebengehen.',
    minFloor: 3,
  },
  {
    id: 'quellwacht',
    name: 'Quellwacht',
    type: 'wasser',
    maxHp: 120,
    attack: 12,
    attackSpeed: 1.0,
    moveSpeed: 80,
    pattern: 'spread3',
    catchRate: 0.75,
    blurb: 'Massiver Wächter mit breitem Wasserfächer.',
    minFloor: 3,
  },
  {
    id: 'sturmranke',
    name: 'Sturmranke',
    type: 'pflanze',
    maxHp: 82,
    attack: 10,
    attackSpeed: 1.6,
    moveSpeed: 104,
    pattern: 'burst3',
    catchRate: 0.8,
    blurb: 'Peitscht Dornensalven in schneller Folge.',
    minFloor: 2,
  },
  {
    id: 'blitzhorn',
    name: 'Blitzhorn',
    type: 'elektro',
    maxHp: 70,
    attack: 13,
    attackSpeed: 1.4,
    moveSpeed: 126,
    pattern: 'spread3',
    catchRate: 0.7,
    blurb: 'Aggressiver Jäger mit gabelnden Entladungen.',
    minFloor: 3,
  },
  // --- Bosse -------------------------------------------------------------
  {
    id: 'magmakoloss',
    name: 'Magmakoloss',
    type: 'feuer',
    maxHp: 420,
    attack: 16,
    attackSpeed: 1.3,
    moveSpeed: 70,
    pattern: 'spread3',
    catchRate: 0.25,
    blurb: 'Etagenboss. Wirft brennende Fächer und lässt kaum Deckung.',
    bossOnly: true,
  },
  {
    id: 'tiefenwal',
    name: 'Tiefenwal',
    type: 'wasser',
    maxHp: 500,
    attack: 14,
    attackSpeed: 1.6,
    moveSpeed: 62,
    pattern: 'burst3',
    catchRate: 0.25,
    blurb: 'Etagenboss. Überflutet den Raum mit Dauerbeschuss.',
    bossOnly: true,
  },
  {
    id: 'donnerkrone',
    name: 'Donnerkrone',
    type: 'elektro',
    maxHp: 440,
    attack: 18,
    attackSpeed: 1.8,
    moveSpeed: 96,
    pattern: 'homing',
    catchRate: 0.2,
    blurb: 'Etagenboss. Schnell, zielsuchend und gnadenlos.',
    bossOnly: true,
  },
  {
    id: 'urwaldherz',
    name: 'Urwaldherz',
    type: 'pflanze',
    maxHp: 560,
    attack: 15,
    attackSpeed: 1.1,
    moveSpeed: 58,
    pattern: 'lob',
    catchRate: 0.25,
    blurb: 'Etagenboss. Bombardiert die Arena mit Sporenbomben.',
    bossOnly: true,
  },
];

const BY_ID = new Map(MONSTERS.map((m) => [m.id, m]));

export function getSpecies(id: string): MonsterSpecies {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`Unbekannte Monster-Art: ${id}`);
  return s;
}

/** Arten, die auf einer bestimmten Etage als Gegner spawnen dürfen. */
export function spawnableOn(floor: number): MonsterSpecies[] {
  return MONSTERS.filter((m) => !m.bossOnly && (m.minFloor ?? 1) <= floor);
}

/** Alle fangbaren (nicht-Boss) Arten. */
export const WILD_SPECIES = MONSTERS.filter((m) => !m.bossOnly);
export const BOSS_SPECIES = MONSTERS.filter((m) => m.bossOnly);
