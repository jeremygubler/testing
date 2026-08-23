/**
 * Relikt-Pool (Risk-of-Rain-Stil): jedes Relikt ist stapelbar und wirkt
 * additiv. Es gibt bewusst KEINE Sonderbehandlung für "zweites Exemplar" —
 * StatBlock multipliziert den Effektwert einfach mit der Stapelzahl.
 */

export type RelicRarity = 'gewoehnlich' | 'selten' | 'legendaer';

/**
 * Effekt-Schlüssel. Neue Relikte, die einen bestehenden Schlüssel nutzen,
 * brauchen keinerlei Code-Änderung. Ein neuer Schlüssel muss in
 * `StatBlock` gelesen werden.
 */
export interface RelicEffect {
  /** Angriffsgeschwindigkeit, +Anteil (0.15 = +15 %). */
  attackSpeedPct?: number;
  /** Flacher Schadensbonus pro Treffer. */
  flatDamage?: number;
  /** Schaden, +Anteil. */
  damagePct?: number;
  /** Maximale HP (Trainer und aktives Monster). */
  maxHp?: number;
  /** HP-Regeneration pro Sekunde. */
  hpRegen?: number;
  /** Anzahl zusätzlicher Abpraller pro Projektil. */
  bounces?: number;
  /** Zusätzliche Projektile pro Schuss. */
  extraProjectiles?: number;
  /** Bewegungsgeschwindigkeit, +Anteil. */
  moveSpeedPct?: number;
  /** Fangchance, additiver Bonus. */
  catchBonus?: number;
  /** Lebensraub als Anteil des verursachten Schadens. */
  lifesteal?: number;
  /** Kritische Trefferchance (Krit = doppelter Schaden). */
  critChance?: number;
  /** Aufsammelradius für Gold/Drops in Pixeln. */
  pickupRadius?: number;
  /** Gold-/Währungsertrag, +Anteil. */
  currencyPct?: number;
  /** Reflektierter Schaden bei Berührung. */
  thorns?: number;
  /** Anzahl Gegner, die ein Projektil zusätzlich durchdringt. */
  pierce?: number;
  /** Verstärkung der Typen-Effektivität. */
  harmony?: number;
  /** Projektilgeschwindigkeit, +Anteil. */
  projectileSpeedPct?: number;
}

export interface Relic {
  id: string;
  name: string;
  rarity: RelicRarity;
  /** Kurzer Effekttext für die UI ("pro Stapel"). */
  desc: string;
  /** Anzeigefarbe der Platzhalter-Grafik. */
  color: number;
  effect: RelicEffect;
  /** true = muss im Hub freigeschaltet werden, bevor es im Run-Pool auftaucht. */
  lockedByDefault?: boolean;
  /** Kosten im Hub-Shop (nur wenn lockedByDefault). */
  unlockCost?: number;
}

export const RELICS: Relic[] = [
  {
    id: 'schnellfeuer_chip',
    name: 'Schnellfeuer-Chip',
    rarity: 'gewoehnlich',
    desc: '+15 % Angriffsgeschwindigkeit',
    color: 0x38bdf8,
    effect: { attackSpeedPct: 0.15 },
  },
  {
    id: 'scharfe_kralle',
    name: 'Scharfe Kralle',
    rarity: 'gewoehnlich',
    desc: '+4 Schaden pro Treffer',
    color: 0xf87171,
    effect: { flatDamage: 4 },
  },
  {
    id: 'vitalkern',
    name: 'Vitalkern',
    rarity: 'gewoehnlich',
    desc: '+22 maximale HP (Trainer & Monster)',
    color: 0x4ade80,
    effect: { maxHp: 22 },
  },
  {
    id: 'regenmodul',
    name: 'Regenerationsmodul',
    rarity: 'gewoehnlich',
    desc: '+0,6 HP Regeneration pro Sekunde',
    color: 0x34d399,
    effect: { hpRegen: 0.6 },
  },
  {
    id: 'turbostiefel',
    name: 'Turbostiefel',
    rarity: 'gewoehnlich',
    desc: '+12 % Bewegungsgeschwindigkeit',
    color: 0xa78bfa,
    effect: { moveSpeedPct: 0.12 },
  },
  {
    id: 'gluecksstein',
    name: 'Glücksstein',
    rarity: 'gewoehnlich',
    desc: '+15 % Fangchance',
    color: 0xfde047,
    effect: { catchBonus: 0.15 },
  },
  {
    id: 'verstaerker_prisma',
    name: 'Verstärker-Prisma',
    rarity: 'selten',
    desc: '+12 % Schaden',
    color: 0xfb923c,
    effect: { damagePct: 0.12 },
  },
  {
    id: 'gummihaut',
    name: 'Gummihaut',
    rarity: 'selten',
    desc: 'Projektile prallen 1× zusätzlich von Wänden ab',
    color: 0x60a5fa,
    effect: { bounces: 1, projectileSpeedPct: 0.05 },
  },
  {
    id: 'splitterschuss',
    name: 'Splitterschuss',
    rarity: 'selten',
    desc: '+1 Projektil pro Schuss (−15 % Schaden je Projektil)',
    color: 0xf472b6,
    effect: { extraProjectiles: 1, damagePct: -0.15 },
  },
  {
    id: 'blutsauger',
    name: 'Blutsauger',
    rarity: 'selten',
    desc: '6 % des verursachten Schadens als Heilung',
    color: 0xdc2626,
    effect: { lifesteal: 0.06 },
  },
  {
    id: 'kritikallinse',
    name: 'Kritikallinse',
    rarity: 'selten',
    desc: '+10 % kritische Trefferchance (doppelter Schaden)',
    color: 0xfacc15,
    effect: { critChance: 0.1 },
  },
  {
    id: 'magnetkern',
    name: 'Magnetkern',
    rarity: 'gewoehnlich',
    desc: '+70 px Aufsammelradius, +10 % Ätherstaub',
    color: 0x94a3b8,
    effect: { pickupRadius: 70, currencyPct: 0.1 },
  },
  {
    id: 'dornenpanzer',
    name: 'Dornenpanzer',
    rarity: 'selten',
    desc: 'Reflektiert 8 Schaden bei Berührung',
    color: 0x78716c,
    effect: { thorns: 8 },
    lockedByDefault: true,
    unlockCost: 150,
  },
  {
    id: 'durchschlagsmunition',
    name: 'Durchschlagsmunition',
    rarity: 'legendaer',
    desc: 'Projektile durchdringen 1 Gegner zusätzlich',
    color: 0xe2e8f0,
    effect: { pierce: 1 },
    lockedByDefault: true,
    unlockCost: 220,
  },
  {
    id: 'elementarharmonie',
    name: 'Elementarharmonie',
    rarity: 'legendaer',
    desc: 'Typenvorteile schlagen härter durch, Nachteile schwächer',
    color: 0xc084fc,
    effect: { harmony: 1 },
    lockedByDefault: true,
    unlockCost: 260,
  },
  {
    id: 'ueberlader',
    name: 'Überlader',
    rarity: 'legendaer',
    desc: '+25 % Angriffsgeschwindigkeit, −10 maximale HP',
    color: 0xf59e0b,
    effect: { attackSpeedPct: 0.25, maxHp: -10 },
    lockedByDefault: true,
    unlockCost: 200,
  },
];

const RELICS_BY_ID = new Map(RELICS.map((r) => [r.id, r]));

export function getRelic(id: string): Relic {
  const r = RELICS_BY_ID.get(id);
  if (!r) throw new Error(`Unbekanntes Relikt: ${id}`);
  return r;
}

/** Relikte, die ohne Freischaltung im Pool sind. */
export const DEFAULT_RELIC_IDS = RELICS.filter((r) => !r.lockedByDefault).map((r) => r.id);

/** Relikte, die im Hub gekauft werden können. */
export const LOCKABLE_RELICS = RELICS.filter((r) => r.lockedByDefault);

export const RARITY_LABELS: Record<RelicRarity, string> = {
  gewoehnlich: 'Gewöhnlich',
  selten: 'Selten',
  legendaer: 'Legendär',
};

export const RARITY_COLORS: Record<RelicRarity, string> = {
  gewoehnlich: '#cbd5e1',
  selten: '#60a5fa',
  legendaer: '#f0abfc',
};

/** Gewichtung beim Ziehen aus dem Pool. */
export const RARITY_WEIGHTS: Record<RelicRarity, number> = {
  gewoehnlich: 60,
  selten: 30,
  legendaer: 10,
};
