/**
 * Minimaler, typisierter Event-Bus.
 *
 * Zweck: Die HUD-Szene soll nie in Entities hineingreifen. Gameplay feuert
 * Events, UI hört zu. Damit bleiben beide Seiten unabhängig testbar.
 */

import type { Relic } from '../data/relics';
import type { ElementType } from '../data/types';

export interface GameEvents {
  /** Irgendein HUD-relevanter Wert hat sich geändert — HUD zeichnet neu. */
  'hud:dirty': void;
  /** Fliesstext oben rechts, z. B. "Glutfuchs gefangen!". */
  'log': { text: string; color?: string };
  /** Schwebende Schadenszahl an Weltkoordinaten. */
  'floater': { x: number; y: number; text: string; color: number };
  /** Relikt eingesammelt. */
  'relic:picked': { relic: Relic; stacks: number };
  /** Monster gefangen. */
  'monster:caught': { speciesId: string };
  /** Raum betreten/gewechselt. */
  'room:changed': { index: number; total: number; kind: string };
  /** Etage abgeschlossen. */
  'floor:cleared': { floor: number };
  /** Run vorbei. */
  'run:over': void;
  /** Kurzer Bildschirm-Shake. */
  'shake': { intensity: number; duration: number };
  /** Typ-Effektivitäts-Hinweis. */
  'effectiveness': { x: number; y: number; label: string; type: ElementType };
}

type Handler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;

class Bus {
  private handlers = new Map<string, Set<(payload: unknown) => void>>();

  on<K extends keyof GameEvents>(event: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(fn as (payload: unknown) => void);
    return () => this.off(event, fn);
  }

  off<K extends keyof GameEvents>(event: K, fn: Handler<K>): void {
    this.handlers.get(event)?.delete(fn as (payload: unknown) => void);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    // Kopie, damit Handler sich während der Iteration abmelden dürfen.
    for (const fn of [...set]) fn(payload);
  }

  /** Alle Listener entfernen (beim Szenenwechsel). */
  clear(): void {
    this.handlers.clear();
  }
}

export const bus = new Bus();
