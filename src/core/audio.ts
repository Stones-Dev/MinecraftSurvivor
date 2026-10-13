/** Procedural Web Audio synth: square/triangle/noise voices with simple envelopes. No audio files. */
import type { ThemeId } from '../data/music';
import { MusicEngine } from './music';
import { Rng } from './rng';
import {
  burstPlan,
  detune,
  RateLimiter,
  SOFT_VOICE_CAP,
  STEP_TIMBRE,
  type SfxName,
  type StepMaterial,
} from './sfxModel';

export type { SfxName } from './sfxModel';
export type { StepMaterial } from './sfxModel';

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
  private readonly limiter = new RateLimiter();
  /** Detune source for pitch variation (sound only, never touches the simulation's streams). */
  private readonly rng = new Rng(0x5f3759df);
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
    // A gentle safety limiter on the effects only (the threshold sits above every single effect's level, so
    // it only acts when many voices stack): a crowd of hits plus an explosion must not clip.
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;
    this.sfxBus.connect(limiter).connect(this.ctx.destination);
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

  /** A pitch factor near 1 for variation between repeated effects (`amount` 0.05 = +-5%). */
  private pitch(amount: number): number {
    return detune(this.rng.float(), amount);
  }

  /**
   * Play an effect. `count` is how many of it happened in the same simulation step: a crowd of hits plays a
   * short staggered burst of detuned voices (see `burstPlan`) instead of one click. `material` picks the
   * timbre of a footstep.
   */
  play(name: SfxName, count = 1, material?: StepMaterial): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || this.muted || ctx.state !== 'running') return;
    if (!this.limiter.allow(name, ctx.currentTime)) return;
    bus.gain.value = this.sfxVolume;
    if (name === 'step') {
      this.step(material ?? 'grass');
      return;
    }
    if (name === 'hit' || name === 'swing' || name === 'bow' || name === 'hurt') {
      this.burst(name, count);
      return;
    }
    this.playOnce(name);
  }

  /** Footstep with the timbre of the surface under the hero (grass, sand, snow, stone, water, mud). */
  private step(material: StepMaterial): void {
    const t = STEP_TIMBRE[material];
    const k = this.pitch(0.12);
    for (let i = 0; i < t.ticks; i++) {
      this.noise(t.noiseDur, t.noiseVol, t.noiseCut * k, i * 0.035);
    }
    if (t.toneVol > 0) this.tone(t.toneHz * k, t.toneDur, t.toneType, t.toneVol, t.toneTo * k);
  }

  /** The hit-like effects: one voice, or a staggered burst with falling volume and a little pitch spread. */
  private burst(name: 'hit' | 'swing' | 'bow' | 'hurt', count: number): void {
    const plan = burstPlan(name, count);
    plan.forEach((v, i) => {
      // Extra voices only while the engine is not already busy; the first voice always plays.
      if (i > 0 && this.voices >= SOFT_VOICE_CAP) return;
      const k = this.pitch(0.05 + 0.04 * v.spread);
      const g = v.gain;
      const d = v.delay;
      switch (name) {
        case 'hit':
          this.tone(220 * k, 0.07, 'square', 0.18 * g, 90 * k, d);
          this.noise(0.05, 0.12 * g, 3000, d);
          // Three or more at once: a short low thump underneath, so a crowd sounds heavier, not just busier.
          if (i === 0 && count >= 4) this.tone(110, 0.09, 'triangle', 0.1, 60);
          break;
        case 'hurt':
          this.tone(160 * k, 0.22, 'sawtooth', 0.22, 60 * k);
          this.noise(0.12, 0.18, 1800);
          break;
        case 'swing':
          this.noise(0.14, 0.14 * g, 5000, d);
          this.tone(480 * k, 0.1, 'triangle', 0.08 * g, 220 * k, d);
          break;
        case 'bow':
          this.tone(700 * k, 0.09, 'triangle', 0.12 * g, 260 * k, d);
          this.noise(0.05, 0.08 * g, 6000, d);
          break;
      }
    });
  }

  private playOnce(name: SfxName): void {
    const now = this.ctx?.currentTime ?? 0;
    switch (name) {
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
      case 'splash':
        this.noise(0.22, 0.2, 4500);
        this.tone(900, 0.12, 'sine', 0.1, 400);
        break;
      case 'snow':
        this.noise(0.1, 0.1, 5500);
        this.tone(600, 0.06, 'sine', 0.06, 300);
        break;
      case 'thunder':
        this.noise(0.7, 0.4, 1200);
        this.tone(70, 0.6, 'sawtooth', 0.22, 35);
        this.tone(1500, 0.05, 'square', 0.15, 200);
        break;
      case 'chest':
        this.tone(220, 0.08, 'square', 0.1, 330);
        this.tone(330, 0.1, 'square', 0.1, 495, 0.08);
        this.tone(660, 0.14, 'triangle', 0.1, 880, 0.17);
        break;
      case 'egg':
        this.tone(660, 0.07, 'triangle', 0.12, 990);
        this.tone(880, 0.07, 'triangle', 0.12, 1320, 0.07);
        this.tone(1320, 0.12, 'triangle', 0.1, 1760, 0.14);
        break;
      case 'spin':
        this.tone(300 + this.xpStreak * 20, 0.05, 'square', 0.05, 500);
        break;
      case 'gameover':
        [392, 349, 311, 261, 196].forEach((f, i) =>
          this.tone(f, i === 4 ? 0.9 : 0.22, 'triangle', 0.16, f * 0.98, i * 0.2),
        );
        break;
      case 'trade':
        this.tone(784, 0.08, 'triangle', 0.12, 784);
        this.tone(1175, 0.14, 'triangle', 0.12, 1175, 0.07);
        break;
    }
  }
}
