export type SoundName =
  | 'jump'
  | 'doubleJump'
  | 'duck'
  | 'egg'
  | 'powerup'
  | 'shieldBreak'
  | 'hit'
  | 'gameOver'
  | 'unlock'
  | 'achievement'
  | 'button';

/**
 * All sound effects are synthesised with the Web Audio API — the project ships
 * no audio files. Browsers block audio until a user gesture, so `unlock()` is
 * called from the first input event.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.22;
    this.master.connect(this.ctx.destination);

    const length = Math.floor(this.ctx.sampleRate * 0.4);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.22;
  }

  play(name: SoundName): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;

    switch (name) {
      case 'jump':
        this.tone({ from: 330, to: 640, duration: 0.16, type: 'sine', gain: 0.5, at: now });
        break;
      case 'doubleJump':
        this.tone({ from: 520, to: 980, duration: 0.18, type: 'triangle', gain: 0.5, at: now });
        this.tone({ from: 780, to: 1320, duration: 0.14, type: 'sine', gain: 0.25, at: now + 0.03 });
        break;
      case 'duck':
        this.noise({ duration: 0.18, gain: 0.28, filterFrom: 1800, filterTo: 400, at: now });
        break;
      case 'egg':
        this.tone({ from: 1050, to: 1500, duration: 0.09, type: 'triangle', gain: 0.32, at: now });
        break;
      case 'powerup':
        [523, 659, 784, 1047].forEach((freq, i) => {
          this.tone({ from: freq, to: freq, duration: 0.1, type: 'square', gain: 0.16, at: now + i * 0.06 });
        });
        break;
      case 'shieldBreak':
        this.tone({ from: 900, to: 220, duration: 0.28, type: 'square', gain: 0.3, at: now });
        this.noise({ duration: 0.24, gain: 0.3, filterFrom: 3000, filterTo: 600, at: now });
        break;
      case 'hit':
        this.tone({ from: 220, to: 60, duration: 0.32, type: 'sawtooth', gain: 0.4, at: now });
        this.noise({ duration: 0.3, gain: 0.35, filterFrom: 1200, filterTo: 200, at: now });
        break;
      case 'gameOver':
        [523, 466, 415, 311].forEach((freq, i) => {
          this.tone({ from: freq, to: freq, duration: 0.24, type: 'triangle', gain: 0.28, at: now + i * 0.17 });
        });
        break;
      case 'unlock':
        [659, 784, 988, 1319].forEach((freq, i) => {
          this.tone({ from: freq, to: freq, duration: 0.22, type: 'sine', gain: 0.22, at: now + i * 0.09 });
        });
        break;
      case 'achievement':
        this.tone({ from: 784, to: 784, duration: 0.14, type: 'sine', gain: 0.26, at: now });
        this.tone({ from: 1175, to: 1175, duration: 0.26, type: 'sine', gain: 0.26, at: now + 0.13 });
        break;
      case 'button':
        this.tone({ from: 640, to: 760, duration: 0.07, type: 'square', gain: 0.16, at: now });
        break;
    }
  }

  private tone(options: {
    from: number;
    to: number;
    duration: number;
    type: OscillatorType;
    gain: number;
    at: number;
  }): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = options.type;
    osc.frequency.setValueAtTime(options.from, options.at);
    if (options.to !== options.from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.to), options.at + options.duration);
    }
    gain.gain.setValueAtTime(0.0001, options.at);
    gain.gain.exponentialRampToValueAtTime(options.gain, options.at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, options.at + options.duration);
    osc.connect(gain).connect(this.master);
    osc.start(options.at);
    osc.stop(options.at + options.duration + 0.02);
  }

  private noise(options: {
    duration: number;
    gain: number;
    filterFrom: number;
    filterTo: number;
    at: number;
  }): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(options.filterFrom, options.at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, options.filterTo), options.at + options.duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(options.gain, options.at);
    gain.gain.exponentialRampToValueAtTime(0.0001, options.at + options.duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(options.at);
    source.stop(options.at + options.duration + 0.02);
  }
}

export const audio = new AudioSystem();
