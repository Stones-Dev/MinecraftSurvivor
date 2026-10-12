/** Procedural Web Audio synth: square/triangle/noise voices with simple envelopes. No audio files. */
import type { ThemeId } from '../data/music';
import { MusicEngine } from './music';
export type SfxName =
  | 'hit'
  | 'hurt'
  | 'swing'
  | 'bow'
  | 'explode'
  | 'xp'
  | 'emerald'
  | 'levelup'
  | 'click'
  | 'death'
  | 'tnt'
  | 'hiss'
  | 'legendary'
  | 'victory'
  | 'boss'
  | 'portal'
  | 'trade';

/** Minimum seconds between two plays of the same effect (keeps crowds from clipping). */
const SPACING: Record<SfxName, number> = {
  hit: 0.045,
  hurt: 0.15,
  swing: 0.1,
  bow: 0.08,
  explode: 0.08,
  xp: 0.03,
  emerald: 0.05,
  levelup: 0.5,
  click: 0.05,
  death: 0.3,
  tnt: 0.1,
  hiss: 0.3,
  legendary: 1,
  victory: 2,
  boss: 1,
  portal: 0.5,
  trade: 0.3,
};

const MAX_VOICES = 18;

export class AudioEngine {
  musicVolume = 0.6;
  sfxVolume = 0.8;
  muted = false;
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private music: MusicEngine | null = null;
  private pendingTheme: ThemeId | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<SfxName, number>();
  private voices = 0;
  private xpStreak = 0;
  private xpAt = 0;

  /** Browsers need a user gesture before audio can start (the title screen click). */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.ctx.destination);
    const musicBus = this.ctx.createGain();
    musicBus.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    // Deterministic noise (LCG) so no Math.random is needed anywhere.
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      data[i] = (s / 4294967296) * 2 - 1;
    }
    this.music = new MusicEngine(this.ctx, musicBus, this.noiseBuf);
    this.refresh();
    if (this.pendingTheme) this.music.set(this.pendingTheme);
  }

  /** Push the volume and mute fields to the audio graph (call after changing them). */
  refresh(): void {
    if (this.sfxBus) this.sfxBus.gain.value = this.muted ? 0 : this.sfxVolume;
    if (this.music) this.music.bus.gain.value = this.muted ? 0 : this.musicVolume * 0.55;
  }

  /** Switch the background theme (null = silence). Safe before the first user gesture: it starts on unlock. */
  setTheme(id: ThemeId | null): void {
    this.pendingTheme = id;
    this.music?.set(id);
  }

  get theme(): ThemeId | null {
    return this.pendingTheme;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo = freq,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || this.voices >= MAX_VOICES) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    this.voices++;
    osc.onended = () => {
      this.voices--;
    };
  }

  private noise(dur: number, vol: number, cutoff: number, delay = 0): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || !this.noiseBuf || this.voices >= MAX_VOICES) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.2), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(bus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    this.voices++;
    src.onended = () => {
      this.voices--;
    };
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < SPACING[name]) return;
    this.last.set(name, now);
    bus.gain.value = this.sfxVolume;
    switch (name) {
      case 'hit':
        this.tone(220, 0.07, 'square', 0.18, 90);
        this.noise(0.05, 0.12, 3000);
        break;
      case 'hurt':
        this.tone(160, 0.22, 'sawtooth', 0.22, 60);
        this.noise(0.12, 0.18, 1800);
        break;
      case 'swing':
        this.noise(0.14, 0.14, 5000);
        this.tone(480, 0.1, 'triangle', 0.08, 220);
        break;
      case 'bow':
        this.tone(700, 0.09, 'triangle', 0.12, 260);
        this.noise(0.05, 0.08, 6000);
        break;
      case 'explode':
        this.noise(0.45, 0.4, 1600);
        this.tone(90, 0.4, 'square', 0.25, 30);
        break;
      case 'tnt':
        this.tone(900, 0.06, 'square', 0.1, 900);
        break;
      case 'hiss':
        this.noise(0.4, 0.14, 7000);
        break;
      case 'xp': {
        this.xpStreak = now - this.xpAt < 0.6 ? Math.min(this.xpStreak + 1, 12) : 0;
        this.xpAt = now;
        const f = 520 * Math.pow(1.0595, this.xpStreak);
        this.tone(f, 0.08, 'square', 0.07, f * 1.5);
        break;
      }
      case 'emerald':
        this.tone(1040, 0.07, 'triangle', 0.14, 1040);
        this.tone(1560, 0.12, 'triangle', 0.12, 1560, 0.05);
        break;
      case 'levelup':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'square', 0.12, f, i * 0.09));
        break;
      case 'click':
        this.tone(660, 0.04, 'square', 0.08, 440);
        break;
      case 'death':
        this.tone(330, 0.7, 'sawtooth', 0.2, 55);
        break;
      case 'legendary':
        // Rising shimmer over a held chord, with a thunder crack underneath.
        [392, 494, 587, 784, 988, 1175].forEach((f, i) =>
          this.tone(f, 0.5, 'triangle', 0.14, f * 1.01, i * 0.07),
        );
        this.noise(0.5, 0.25, 2500);
        this.tone(196, 0.9, 'square', 0.1, 196, 0.1);
        break;
      case 'victory':
        [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) =>
          this.tone(f, i === 7 ? 0.7 : 0.16, 'square', 0.12, f, i * 0.14),
        );
        break;
      case 'boss':
        this.tone(110, 0.8, 'sawtooth', 0.22, 55);
        this.tone(116, 0.8, 'sawtooth', 0.18, 58, 0.02);
        this.noise(0.6, 0.18, 900);
        break;
      case 'portal':
        this.tone(220, 0.6, 'sine', 0.14, 660);
        this.tone(330, 0.6, 'triangle', 0.08, 990, 0.05);
        break;
      case 'trade':
        this.tone(784, 0.08, 'triangle', 0.12, 784);
        this.tone(1175, 0.14, 'triangle', 0.12, 1175, 0.07);
        break;
    }
  }
}
