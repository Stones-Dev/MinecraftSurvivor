/** Look-ahead step sequencer that plays a data/music.ts theme through WebAudio, with crossfades between themes. */
import {
  midiToFreq,
  stepEvents,
  THEMES,
  type Theme,
  type ThemeId,
  type Voice,
} from '../data/music';

const LOOKAHEAD = 0.25;
const TICK_MS = 60;
const FADE = 1.6;

class ThemePlayer {
  readonly out: GainNode;
  private step = 0;
  private next: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private readonly theme: Theme;

  constructor(
    private readonly ctx: AudioContext,
    dest: AudioNode,
    private readonly noise: AudioBuffer,
    id: ThemeId,
  ) {
    this.theme = THEMES[id];
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.out.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE);
    this.out.connect(dest);
    this.next = ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop(fade = FADE): void {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0.0001, t + fade);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    setTimeout(() => this.out.disconnect(), (fade + 0.5) * 1000);
  }

  private schedule(): void {
    if (this.stopped) return;
    const stepDur = 60 / this.theme.bpm / 4;
    while (this.next < this.ctx.currentTime + LOOKAHEAD) {
      for (const ev of stepEvents(this.theme, this.step)) {
        this.play(ev.voice, ev.midi, this.next, ev.len * stepDur);
      }
      this.next += stepDur;
      this.step++;
    }
  }

  private play(voice: Voice, midi: number | undefined, t: number, dur: number): void {
    const ctx = this.ctx;
    const mix = this.theme.mix;
    if (voice === 'kick') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.5 * mix.drums, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.16);
      return;
    }
    if (voice === 'snare' || voice === 'hat') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = voice === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = voice === 'hat' ? 7000 : 1800;
      const g = ctx.createGain();
      const len = voice === 'hat' ? 0.04 : 0.12;
      g.gain.setValueAtTime((voice === 'hat' ? 0.16 : 0.3) * mix.drums, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(f).connect(g).connect(this.out);
      src.start(t);
      src.stop(t + len + 0.02);
      return;
    }
    if (midi === undefined) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = this.theme.wave[voice];
    o.frequency.setValueAtTime(midiToFreq(midi), t);
    const vol = mix[voice];
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * 0.5), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.06, dur));
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + Math.max(0.06, dur) + 0.02);
  }
}

/** Owns the music bus and the current theme; `set` crossfades, `null` fades to silence. */
export class MusicEngine {
  private current: ThemePlayer | null = null;
  private currentId: ThemeId | null = null;

  constructor(
    private readonly ctx: AudioContext,
    readonly bus: GainNode,
    private readonly noise: AudioBuffer,
  ) {}

  get playing(): ThemeId | null {
    return this.currentId;
  }

  set(id: ThemeId | null): void {
    if (id === this.currentId) return;
    this.current?.stop();
    this.current = id ? new ThemePlayer(this.ctx, this.bus, this.noise, id) : null;
    this.currentId = id;
  }
}
