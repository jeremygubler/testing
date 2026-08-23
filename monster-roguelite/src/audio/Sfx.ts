/**
 * Prozedurale Soundeffekte über die Web-Audio-API.
 *
 * Bewusst ohne Audio-Dateien: das Projekt bleibt asset-frei, und jeder Effekt
 * ist eine Handvoll Zahlen statt eines Binärblobs. Die Klänge sind kurze
 * Oszillator-Rampen mit Hüllkurve — genug, um Treffer, Tod, Fang und Kauf
 * hörbar zu unterscheiden.
 */

export type SfxName =
  | 'schuss'
  | 'gegnerschuss'
  | 'treffer'
  | 'kill'
  | 'schaden'
  | 'wurf'
  | 'fang_ok'
  | 'fang_fehl'
  | 'relikt'
  | 'tuer'
  | 'boss'
  | 'aufstieg'
  | 'kauf'
  | 'abgelehnt';

interface Tone {
  /** Wellenform. */
  type: OscillatorType;
  /** Startfrequenz in Hz. */
  from: number;
  /** Zielfrequenz am Ende der Rampe. */
  to: number;
  /** Dauer in Sekunden. */
  dur: number;
  /** Spitzenlautstärke (vor Master-Gain). */
  gain: number;
  /** Minimaler Abstand zwischen zwei Wiedergaben in ms (gegen Klangbrei). */
  throttle?: number;
  /** Optionaler zweiter Ton, verzögert — für Akkorde/Arpeggios. */
  then?: Omit<Tone, 'throttle' | 'then'> & { delay: number };
}

const TONES: Record<SfxName, Tone> = {
  schuss: { type: 'square', from: 620, to: 300, dur: 0.07, gain: 0.055, throttle: 55 },
  gegnerschuss: { type: 'sawtooth', from: 300, to: 180, dur: 0.08, gain: 0.035, throttle: 90 },
  treffer: { type: 'triangle', from: 420, to: 180, dur: 0.06, gain: 0.06, throttle: 45 },
  kill: { type: 'square', from: 260, to: 70, dur: 0.2, gain: 0.09 },
  schaden: { type: 'sawtooth', from: 200, to: 60, dur: 0.24, gain: 0.13 },
  wurf: { type: 'sine', from: 500, to: 900, dur: 0.16, gain: 0.07 },
  fang_ok: {
    type: 'sine',
    from: 620,
    to: 900,
    dur: 0.13,
    gain: 0.1,
    then: { type: 'sine', from: 900, to: 1320, dur: 0.22, gain: 0.1, delay: 0.12 },
  },
  fang_fehl: { type: 'square', from: 340, to: 150, dur: 0.22, gain: 0.08 },
  relikt: {
    type: 'triangle',
    from: 700, to: 1050, dur: 0.12, gain: 0.09,
    then: { type: 'triangle', from: 1050, to: 1560, dur: 0.26, gain: 0.08, delay: 0.11 },
  },
  tuer: { type: 'sine', from: 260, to: 420, dur: 0.18, gain: 0.06 },
  boss: { type: 'sawtooth', from: 130, to: 55, dur: 0.7, gain: 0.14 },
  aufstieg: {
    type: 'sine',
    from: 520, to: 780, dur: 0.11, gain: 0.09,
    then: { type: 'sine', from: 780, to: 1180, dur: 0.3, gain: 0.09, delay: 0.1 },
  },
  kauf: { type: 'triangle', from: 880, to: 1180, dur: 0.14, gain: 0.09 },
  abgelehnt: { type: 'square', from: 180, to: 130, dur: 0.13, gain: 0.07, throttle: 400 },
};

class SfxBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastPlayed = new Map<SfxName, number>();
  private mutedFlag = false;

  /** Übernimmt den AudioContext von Phaser, statt einen zweiten aufzumachen. */
  init(ctx: AudioContext | undefined | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.mutedFlag ? 0 : 0.6;
    this.master.connect(ctx.destination);
  }

  get muted(): boolean {
    return this.mutedFlag;
  }

  setMuted(muted: boolean): void {
    this.mutedFlag = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.6;
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.mutedFlag) return;

    const tone = TONES[name];
    if (tone.throttle) {
      const last = this.lastPlayed.get(name) ?? -Infinity;
      const now = ctx.currentTime * 1000;
      if (now - last < tone.throttle) return;
      this.lastPlayed.set(name, now);
    }

    // Browser sperren den Context bis zur ersten Nutzergeste.
    if (ctx.state === 'suspended') void ctx.resume();

    this.emit(ctx, master, tone, 0);
    if (tone.then) this.emit(ctx, master, tone.then, tone.then.delay);
  }

  private emit(
    ctx: AudioContext,
    master: GainNode,
    tone: Omit<Tone, 'throttle' | 'then'>,
    delay: number,
  ): void {
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.to), start + tone.dur);

    // Kurzer Attack, exponentieller Release — sonst knackt es beim Abschalten.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(tone.gain, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);

    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + tone.dur + 0.02);
    // Nodes nach dem Abspielen freigeben, sonst wächst der Graph endlos.
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}

export const sfx = new SfxBus();
