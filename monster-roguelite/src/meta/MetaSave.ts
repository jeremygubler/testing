import { DEFAULT_RELIC_IDS, LOCKABLE_RELICS } from '../data/relics';
import { WILD_SPECIES } from '../data/monsters';

/**
 * Dauerhafter Fortschritt über localStorage.
 *
 * Einziges Modul im Projekt, das `localStorage` kennt. Alles andere geht über
 * `loadMeta()` / `saveMeta()`, damit ein Wechsel auf ein Backend später eine
 * Ein-Datei-Änderung bleibt.
 */

const STORAGE_KEY = 'monster-roguelite:save';
const SAVE_VERSION = 1;

/** Eintrag im Monster-Dex. */
export interface DexEntry {
  /** Wie oft insgesamt gefangen. */
  caught: number;
  /** Wie oft besiegt (auch ohne Fang gesehen). */
  defeated: number;
  /** Niedrigste Etage, auf der die Art zuerst gesehen wurde. */
  firstFloor: number;
}

/** Dauerhafte Stat-Upgrades aus dem Hub. */
export interface PermUpgrades {
  vitalitaet: number; // +HP
  ausbildung: number; // +Schaden
  laufschuhe: number; // +Tempo
  koeder: number; // +Fangchance
}

export interface MetaSave {
  version: number;
  /** Meta-Währung: Ätherstaub. */
  currency: number;
  dex: Record<string, DexEntry>;
  unlockedStarters: string[];
  unlockedRelics: string[];
  upgrades: PermUpgrades;
  /** Ton stummgeschaltet? Wird zwischen Sitzungen gemerkt. */
  muted: boolean;
  lifetime: {
    runs: number;
    kills: number;
    catches: number;
    bestFloor: number;
    bestRoomsCleared: number;
    totalCurrencyEarned: number;
  };
}

/** Start-Monster, die von Anfang an verfügbar sind. */
export const DEFAULT_STARTERS = ['glutfuchs', 'tropfling', 'rankenkeim'];

/** Start-Monster, die im Hub freigeschaltet werden können. */
export const LOCKABLE_STARTERS: { id: string; cost: number }[] = [
  { id: 'voltmaus', cost: 90 },
  { id: 'puffel', cost: 110 },
  { id: 'brockel', cost: 140 },
  { id: 'aschgeist', cost: 180 },
  { id: 'blitzhorn', cost: 240 },
];

/** Konfiguration der dauerhaften Stat-Upgrades. */
export const UPGRADE_DEFS = [
  {
    key: 'vitalitaet' as const,
    name: 'Vitalität',
    desc: '+10 maximale HP pro Stufe',
    maxLevel: 5,
    baseCost: 60,
    costStep: 40,
  },
  {
    key: 'ausbildung' as const,
    name: 'Ausbildung',
    desc: '+4 % Schaden pro Stufe',
    maxLevel: 5,
    baseCost: 75,
    costStep: 50,
  },
  {
    key: 'laufschuhe' as const,
    name: 'Laufschuhe',
    desc: '+4 % Tempo pro Stufe',
    maxLevel: 4,
    baseCost: 55,
    costStep: 35,
  },
  {
    key: 'koeder' as const,
    name: 'Premium-Köder',
    desc: '+6 % Fangchance pro Stufe',
    maxLevel: 4,
    baseCost: 70,
    costStep: 45,
  },
];

export function upgradeCost(key: keyof PermUpgrades, level: number): number {
  const def = UPGRADE_DEFS.find((d) => d.key === key)!;
  return def.baseCost + def.costStep * level;
}

function emptySave(): MetaSave {
  return {
    version: SAVE_VERSION,
    currency: 0,
    dex: {},
    unlockedStarters: [...DEFAULT_STARTERS],
    unlockedRelics: [...DEFAULT_RELIC_IDS],
    upgrades: { vitalitaet: 0, ausbildung: 0, laufschuhe: 0, koeder: 0 },
    muted: false,
    lifetime: {
      runs: 0,
      kills: 0,
      catches: 0,
      bestFloor: 0,
      bestRoomsCleared: 0,
      totalCurrencyEarned: 0,
    },
  };
}

/**
 * Lädt den Spielstand. Defekte oder veraltete Daten führen nie zu einem
 * Absturz — im Zweifel wird auf einen frischen Stand zurückgefallen und
 * fehlende Felder werden ergänzt.
 */
export function loadMeta(): MetaSave {
  const fresh = emptySave();
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Privater Modus / blockierter Speicher: mit flüchtigem Stand weiterspielen.
    return fresh;
  }
  if (!raw) return fresh;

  try {
    const parsed = JSON.parse(raw) as Partial<MetaSave>;
    if (typeof parsed !== 'object' || parsed === null) return fresh;

    const save: MetaSave = {
      ...fresh,
      ...parsed,
      version: SAVE_VERSION,
      upgrades: { ...fresh.upgrades, ...(parsed.upgrades ?? {}) },
      lifetime: { ...fresh.lifetime, ...(parsed.lifetime ?? {}) },
      dex: { ...(parsed.dex ?? {}) },
      unlockedStarters: Array.isArray(parsed.unlockedStarters)
        ? parsed.unlockedStarters
        : fresh.unlockedStarters,
      unlockedRelics: Array.isArray(parsed.unlockedRelics)
        ? parsed.unlockedRelics
        : fresh.unlockedRelics,
    };

    // Standardinhalte immer nachziehen — sonst fehlen nach einem Content-Patch
    // die neuen Basis-Relikte in alten Spielständen.
    const starters = new Set([...DEFAULT_STARTERS, ...save.unlockedStarters]);
    save.unlockedStarters = [...starters].filter((id) =>
      WILD_SPECIES.some((s) => s.id === id),
    );
    const relics = new Set([...DEFAULT_RELIC_IDS, ...save.unlockedRelics]);
    save.unlockedRelics = [...relics];
    save.currency = Math.max(0, Math.floor(save.currency) || 0);
    save.muted = save.muted === true;
    return save;
  } catch {
    return fresh;
  }
}

export function saveMeta(save: MetaSave): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Speicher nicht verfügbar — Fortschritt geht verloren, aber das Spiel
    // läuft weiter. Bewusst kein Absturz.
  }
}

export function resetMeta(): MetaSave {
  const fresh = emptySave();
  saveMeta(fresh);
  return fresh;
}

/** Dex-Eintrag anlegen/hochzählen. */
export function recordDex(
  save: MetaSave,
  speciesId: string,
  kind: 'caught' | 'defeated',
  floor: number,
): void {
  const entry = save.dex[speciesId] ?? { caught: 0, defeated: 0, firstFloor: floor };
  entry[kind]++;
  entry.firstFloor = Math.min(entry.firstFloor, floor);
  save.dex[speciesId] = entry;
}

/** Anzahl gefangener Arten / Gesamtzahl fangbarer Arten. */
export function dexProgress(save: MetaSave): { caught: number; total: number } {
  const total = WILD_SPECIES.length;
  const caught = WILD_SPECIES.filter((s) => (save.dex[s.id]?.caught ?? 0) > 0).length;
  return { caught, total };
}

/** Noch nicht gekaufte, freischaltbare Relikte. */
export function lockedRelics(save: MetaSave) {
  return LOCKABLE_RELICS.filter((r) => !save.unlockedRelics.includes(r.id));
}
