import { MAX_SPEED } from '../core/config';
import type { SaveData } from './storage';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_run', name: 'Erster Schritt', description: 'Beende deinen ersten Lauf.', icon: '👣' },
  { id: 'eggs50', name: 'Eiersammler', description: 'Sammle 50 Eier in einem Lauf.', icon: '🧺' },
  { id: 'dist1000', name: 'Weltenbummler', description: 'Laufe 1000 m in einem Lauf.', icon: '🗺️' },
  { id: 'score8000', name: 'Punktejäger', description: 'Erreiche 8000 Punkte.', icon: '🏆' },
  { id: 'shield_save', name: 'Gerettet!', description: 'Überlebe einen Treffer mit dem Schild.', icon: '🛡️' },
  { id: 'magnet30', name: 'Magnetisch', description: 'Sammle 30 Eier mit einem Magneten.', icon: '🧲' },
  { id: 'top_speed', name: 'Vollgas', description: 'Erreiche die Höchstgeschwindigkeit.', icon: '🔥' },
  { id: 'eggs1000', name: 'Eierberg', description: 'Sammle insgesamt 1000 Eier.', icon: '⛰️' },
  { id: 'all_skins', name: 'Dino-Sammler', description: 'Schalte alle Dinos frei.', icon: '🦕' },
];

/** Everything a run can prove, gathered while playing. */
export interface RunSummary {
  eggs: number;
  distance: number;
  score: number;
  eggsWhileMagnet: number;
  shieldSaves: number;
  topSpeed: number;
}

export function getAchievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/**
 * Returns the achievements newly earned by this run. The caller is responsible
 * for adding them to the save file.
 */
export function evaluateAchievements(run: RunSummary, save: SaveData, totalSkins: number): Achievement[] {
  const earned = new Set(save.achievements);
  const results: Achievement[] = [];

  const award = (id: string, condition: boolean) => {
    if (!condition || earned.has(id)) return;
    const achievement = getAchievement(id);
    if (achievement) results.push(achievement);
  };

  award('first_run', true);
  award('eggs50', run.eggs >= 50);
  award('dist1000', run.distance >= 1000);
  award('score8000', run.score >= 8000);
  award('shield_save', run.shieldSaves >= 1);
  award('magnet30', run.eggsWhileMagnet >= 30);
  award('top_speed', run.topSpeed >= MAX_SPEED - 0.01);
  award('eggs1000', save.eggsAllTime >= 1000);
  award('all_skins', save.unlockedSkins.length >= totalSkins);

  return results;
}
