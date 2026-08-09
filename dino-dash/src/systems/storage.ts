const STORAGE_KEY = 'dino-dash-save-v1';

export interface SaveData {
  highScore: number;
  bestDistance: number;
  /** Eggs available to spend on skins. */
  eggs: number;
  eggsAllTime: number;
  bestEggsInRun: number;
  runs: number;
  unlockedSkins: string[];
  selectedSkin: string;
  achievements: string[];
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
    muted: false,
  };
}

/**
 * localStorage-backed save file. Every access is guarded because private
 * browsing modes can throw on both read and write.
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
      // Guard against a hand-edited or partially written save.
      unlockedSkins: Array.isArray(parsed.unlockedSkins)
        ? Array.from(new Set(['classic', ...parsed.unlockedSkins]))
        : base.unlockedSkins,
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements : base.achievements,
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
