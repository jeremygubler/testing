import { MAX_SPEED } from '../core/config';

/**
 * Everything an achievement can be judged on. It is assembled both during a
 * run — so a milestone pops the moment it is reached — and once at the end for
 * the ones that only make sense then.
 */
export interface AchievementContext {
  eggs: number;
  distance: number;
  score: number;
  eggsWhileMagnet: number;
  shieldSaves: number;
  topSpeed: number;
  /** Lifetime eggs, including the ones collected in the current run. */
  eggsAllTime: number;
  unlockedSkins: number;
  totalSkins: number;
  /** True only in the evaluation that happens after a run ends. */
  runFinished: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  check: (context: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_run',
    name: 'Erster Schritt',
    description: 'Beende deinen ersten Lauf.',
    icon: '👣',
    check: (c) => c.runFinished,
  },
  {
    id: 'eggs50',
    name: 'Eiersammler',
    description: 'Sammle 50 Eier in einem Lauf.',
    icon: '🧺',
    check: (c) => c.eggs >= 50,
  },
  {
    id: 'dist1000',
    name: 'Weltenbummler',
    description: 'Laufe 1000 m in einem Lauf.',
    icon: '🗺️',
    check: (c) => c.distance >= 1000,
  },
  {
    id: 'score8000',
    name: 'Punktejäger',
    description: 'Erreiche 8000 Punkte.',
    icon: '🏆',
    check: (c) => c.score >= 8000,
  },
  {
    id: 'shield_save',
    name: 'Gerettet!',
    description: 'Überlebe einen Treffer mit dem Schild.',
    icon: '🛡️',
    check: (c) => c.shieldSaves >= 1,
  },
  {
    id: 'magnet30',
    name: 'Magnetisch',
    description: 'Sammle 30 Eier mit einem Magneten.',
    icon: '🧲',
    check: (c) => c.eggsWhileMagnet >= 30,
  },
  {
    id: 'top_speed',
    name: 'Vollgas',
    description: 'Erreiche die Höchstgeschwindigkeit.',
    icon: '🔥',
    check: (c) => c.topSpeed >= MAX_SPEED - 0.01,
  },
  {
    id: 'eggs1000',
    name: 'Eierberg',
    description: 'Sammle insgesamt 1000 Eier.',
    icon: '⛰️',
    check: (c) => c.eggsAllTime >= 1000,
  },
  {
    id: 'all_skins',
    name: 'Dino-Sammler',
    description: 'Schalte alle Dinos frei.',
    icon: '🦕',
    check: (c) => c.unlockedSkins >= c.totalSkins,
  },
];

export function getAchievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Achievements whose condition now holds and that have not been earned yet. */
export function evaluateAchievements(
  context: AchievementContext,
  alreadyEarned: readonly string[],
): Achievement[] {
  const earned = new Set(alreadyEarned);
  return ACHIEVEMENTS.filter((a) => !earned.has(a.id) && a.check(context));
}
