/**
 * Seedbarer Zufallsgenerator (mulberry32).
 *
 * Bewusst nicht `Math.random()`: Etagen-Layouts und Item-Drops sollen bei
 * gleichem Seed reproduzierbar sein — hilft beim Debuggen und macht später
 * "Daily Runs" möglich.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Erzeugt einen Seed aus der aktuellen Zeit. */
  static randomSeed(): number {
    return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  }

  /** Gleitkommazahl in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Ganzzahl in [min, max] (inklusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Gleitkommazahl in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** true mit Wahrscheinlichkeit p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Zufälliges Element. Wirft bei leerem Array. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick auf leerem Array');
    return arr[Math.floor(this.next() * arr.length)]!;
  }

  /** Gewichtete Auswahl. */
  pickWeighted<T>(arr: readonly T[], weight: (item: T) => number): T {
    const total = arr.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
    if (total <= 0) return this.pick(arr);
    let roll = this.next() * total;
    for (const item of arr) {
      roll -= Math.max(0, weight(item));
      if (roll <= 0) return item;
    }
    return arr[arr.length - 1]!;
  }

  /** Fisher-Yates, in-place. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }
}
