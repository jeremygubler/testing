import type { PowerUpKind } from '../core/types';

const STORAGE_KEY = 'dino-dash-save-v1';

/** How many entries the best-runs list keeps. */
export const SCORE_LIST_SIZE = 5;
/** Highest level each power-up can be upgraded to. */
export const MAX_UPGRADE_LEVEL = 3;

export interface ScoreEntry {
  score: number;
  distance: number;
  eggs: number;
  /** ISO date of the run, used only for display. */
  date: string;
}

export type UpgradeLevels = Record<PowerUpKind, number>;

export interface SaveData {
  highScore: number;
  bestDistance: number;
  /** Eggs available to spend. */
  eggs: number;
  eggsAllTime: number;
  bestEggsInRun: number;
  runs: number;
  unlockedSkins: string[];
  selectedSkin: string;
  achievements: string[];
  /** Best runs, highest score first. */
  scores: ScoreEntry[];
  upgrades: UpgradeLevels;
  muted: boolean;
}

function defaults(): SaveData {
  return {
    highScore: 0,
    bestDistance: 0,
    eggs: 0,
    eggsAllTime: 0,
    bestEggsInRun: 0,
    runs: 0,
    unlockedSkins: ['classic'],
    selectedSkin: 'classic',
    achievements: [],
    scores: [],
    upgrades: { magnet: 0, shield: 0, boost: 0, spring: 0 },
    muted: false,
  };
}

/**
 * localStorage-backed save file. Every access is guarded because private
 * browsing modes can throw on both read and write, and because a save written
 * by an older version may be missing fields.
 */
export function loadSave(): SaveData {
  const base = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...base,
      ...parsed,
      unlockedSkins: Array.isArray(parsed.unlockedSkins)
        ? Array.from(new Set(['classic', ...parsed.unlockedSkins]))
        : base.unlockedSkins,
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements : base.achievements,
      scores: Array.isArray(parsed.scores) ? parsed.scores.slice(0, SCORE_LIST_SIZE) : base.scores,
      upgrades: { ...base.upgrades, ...(parsed.upgrades ?? {}) },
    };
  } catch {
    return base;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Saving is best effort; the run still plays without persistence.
  }
}

/** Inserts a finished run into the best-runs list, keeping it sorted. */
export function recordScore(
  save: SaveData,
  score: number,
  distance: number,
  eggs: number,
): void {
  save.scores.push({ score, distance, eggs, date: new Date().toISOString().slice(0, 10) });
  save.scores.sort((a, b) => b.score - a.score);
  save.scores.length = Math.min(save.scores.length, SCORE_LIST_SIZE);
}
