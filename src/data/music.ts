/** Procedural music themes (BRIEF section 14). Pure data and a pure step function; core/music.ts plays them. */
import { BIOMES, type BiomeId } from '../world/biomes';

export type ThemeId =
  | 'hub'
  | 'plains'
  | 'night'
  | 'dark_forest'
  | 'snowy_taiga'
  | 'desert'
  | 'jungle'
  | 'swamp'
  | 'cherry'
  | 'mushroom'
  | 'badlands'
  | 'nether'
  | 'end'
  | 'boss';

export type Voice = 'bass' | 'arp' | 'lead' | 'kick' | 'snare' | 'hat';

export interface Theme {
  id: ThemeId;
  bpm: number;
  /** MIDI note of the scale root. */
  root: number;
  /** Semitone offsets of the scale degrees. */
  scale: readonly number[];
  /** One entry per bar: the chord as scale degrees (root first). */
  chords: readonly (readonly number[])[];
  /** 16-step patterns. bass: 1 root, 2 fifth; arp: chord index + 1 (4 = octave); 0 is a rest. */
  bass: readonly number[];
  arp: readonly number[];
  /** Optional melody, one scale degree (+1, 0 = rest) per step over `lead.length / 16` bars. */
  lead?: readonly number[];
  kick?: readonly number[];
  snare?: readonly number[];
  hat?: readonly number[];
  wave: { bass: OscillatorType; arp: OscillatorType; lead: OscillatorType };
  /** Voice levels 0..1. */
  mix: { bass: number; arp: number; lead: number; drums: number };
}

const MAJOR_PENT = [0, 2, 4, 7, 9] as const;
const MINOR_PENT = [0, 3, 5, 7, 10] as const;
const MINOR = [0, 2, 3, 5, 7, 8, 10] as const;
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10] as const;
const HARM_MINOR = [0, 2, 3, 5, 7, 8, 11] as const;
const PHRYG_DOM = [0, 1, 4, 5, 7, 8, 10] as const;
const DORIAN = [0, 2, 3, 5, 7, 9, 10] as const;
const LYDIAN = [0, 2, 4, 6, 7, 9, 11] as const;
const WHOLE_TONE = [0, 2, 4, 6, 8, 10] as const;
const LOCRIAN = [0, 1, 3, 5, 6, 8, 10] as const;

const R = 0;

export const THEMES: Record<ThemeId, Theme> = {
  hub: {
    id: 'hub',
    bpm: 84,
    root: 60,
    scale: MAJOR_PENT,
    chords: [
      [0, 2, 4],
      [3, 0, 2],
      [4, 1, 3],
      [2, 4, 1],
    ],
    bass: [1, R, R, R, R, R, 2, R, 1, R, R, R, R, R, 2, R],
    arp: [1, R, 2, R, 3, R, 2, R, 1, R, 2, R, 4, R, 3, R],
    lead: [
      3,
      R,
      R,
      R,
      5,
      R,
      R,
      4,
      3,
      R,
      R,
      R,
      2,
      R,
      R,
      R,
      1,
      R,
      R,
      R,
      3,
      R,
      R,
      2,
      1,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
    ],
    hat: [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, 1],
    wave: { bass: 'triangle', arp: 'square', lead: 'triangle' },
    mix: { bass: 0.5, arp: 0.18, lead: 0.3, drums: 0.3 },
  },
  plains: {
    id: 'plains',
    bpm: 100,
    root: 62,
    scale: MAJOR_PENT,
    chords: [
      [0, 2, 4],
      [4, 1, 3],
      [3, 0, 2],
      [4, 1, 3],
    ],
    bass: [1, R, R, 2, R, R, 1, R, 1, R, R, 2, R, R, 1, R],
    arp: [1, 2, 3, 2, 1, 2, 3, 4, 1, 2, 3, 2, 1, 2, 3, 4],
    kick: [1, R, R, R, R, R, R, R, 1, R, R, R, R, R, R, R],
    hat: [R, R, 1, R, R, R, 1, R, R, R, 1, R, R, R, 1, R],
    wave: { bass: 'triangle', arp: 'square', lead: 'triangle' },
    mix: { bass: 0.55, arp: 0.16, lead: 0.3, drums: 0.35 },
  },
  night: {
    id: 'night',
    bpm: 96,
    root: 57,
    scale: MINOR,
    chords: [
      [0, 2, 4],
      [5, 0, 2],
      [3, 5, 0],
      [4, 6, 1],
    ],
    bass: [1, R, 1, R, R, 1, R, 2, 1, R, 1, R, R, 1, R, 2],
    arp: [1, R, 2, 3, R, 2, 3, R, 1, R, 2, 3, R, 4, 3, R],
    kick: [1, R, R, R, R, R, 1, R, 1, R, R, R, R, R, R, R],
    snare: [R, R, R, R, 1, R, R, R, R, R, R, R, 1, R, R, R],
    hat: [R, R, 1, R, R, R, 1, R, R, R, 1, R, R, R, 1, 1],
    wave: { bass: 'sawtooth', arp: 'square', lead: 'triangle' },
    mix: { bass: 0.4, arp: 0.14, lead: 0.28, drums: 0.4 },
  },
  dark_forest: {
    id: 'dark_forest',
    bpm: 88,
    root: 52,
    scale: PHRYGIAN,
    chords: [
      [0, 2, 4],
      [1, 3, 5],
      [0, 2, 4],
      [6, 1, 3],
    ],
    bass: [1, R, R, R, R, R, R, R, 2, R, R, R, 1, R, R, R],
    arp: [1, R, R, 2, R, R, 3, R, R, 2, R, R, 4, R, 3, R],
    lead: [
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      5,
      R,
      R,
      R,
      4,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      3,
      R,
      R,
      R,
      2,
      R,
      R,
      R,
    ],
    kick: [1, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    wave: { bass: 'triangle', arp: 'triangle', lead: 'square' },
    mix: { bass: 0.5, arp: 0.2, lead: 0.16, drums: 0.3 },
  },
  snowy_taiga: {
    id: 'snowy_taiga',
    bpm: 76,
    root: 66,
    scale: MINOR_PENT,
    chords: [
      [0, 2, 4],
      [3, 0, 2],
      [2, 4, 1],
      [4, 1, 3],
    ],
    bass: [1, R, R, R, R, R, R, R, R, R, R, R, 2, R, R, R],
    arp: [1, R, 3, R, 2, R, 4, R, 1, R, 3, R, 2, R, 4, R],
    lead: [
      5,
      R,
      R,
      R,
      R,
      R,
      3,
      R,
      R,
      R,
      4,
      R,
      R,
      R,
      R,
      R,
      5,
      R,
      R,
      R,
      R,
      R,
      2,
      R,
      R,
      R,
      3,
      R,
      R,
      R,
      R,
      R,
    ],
    hat: [R, R, R, R, R, R, R, R, R, R, R, R, R, R, 1, R],
    wave: { bass: 'sine', arp: 'triangle', lead: 'sine' },
    mix: { bass: 0.5, arp: 0.2, lead: 0.28, drums: 0.2 },
  },
  desert: {
    id: 'desert',
    bpm: 104,
    root: 50,
    scale: HARM_MINOR,
    chords: [
      [0, 2, 4],
      [0, 2, 4],
      [3, 5, 0],
      [4, 6, 1],
    ],
    bass: [1, R, 1, R, R, 2, R, 1, 1, R, 1, R, R, 2, R, 1],
    arp: [1, 2, 3, R, 3, 2, 1, R, 1, 2, 3, R, 4, 3, 2, R],
    kick: [1, R, R, R, R, R, 1, R, R, R, 1, R, R, R, R, R],
    snare: [R, R, R, R, 1, R, R, R, R, R, R, R, 1, R, R, 1],
    hat: [1, R, 1, R, 1, R, 1, R, 1, R, 1, R, 1, R, 1, R],
    wave: { bass: 'triangle', arp: 'square', lead: 'triangle' },
    mix: { bass: 0.5, arp: 0.15, lead: 0.3, drums: 0.35 },
  },
  jungle: {
    id: 'jungle',
    bpm: 118,
    root: 55,
    scale: DORIAN,
    chords: [
      [0, 2, 4],
      [3, 5, 7],
      [0, 2, 4],
      [6, 1, 3],
    ],
    bass: [1, R, R, 1, R, R, 2, R, 1, R, R, 1, R, 2, R, R],
    arp: [1, R, 2, R, 3, R, 2, 3, 1, R, 2, R, 3, R, 4, R],
    lead: [
      5,
      R,
      R,
      3,
      R,
      R,
      5,
      R,
      6,
      R,
      R,
      5,
      R,
      R,
      3,
      R,
      2,
      R,
      R,
      3,
      R,
      R,
      5,
      R,
      R,
      R,
      R,
      R,
      3,
      R,
      2,
      R,
    ],
    kick: [1, R, R, R, R, R, 1, R, R, R, 1, R, R, R, R, R],
    hat: [R, R, 1, R, R, 1, R, R, 1, R, R, 1, R, R, 1, 1],
    wave: { bass: 'triangle', arp: 'square', lead: 'triangle' },
    mix: { bass: 0.5, arp: 0.14, lead: 0.28, drums: 0.4 },
  },
  swamp: {
    id: 'swamp',
    bpm: 68,
    root: 50,
    scale: MINOR_PENT,
    chords: [
      [0, 2, 4],
      [0, 2, 4],
      [3, 0, 2],
      [2, 4, 1],
    ],
    bass: [1, R, R, R, R, R, R, R, R, R, R, R, 2, R, R, R],
    arp: [R, R, 1, R, R, R, 3, R, R, 2, R, R, R, R, 4, R],
    lead: [
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      3,
      R,
      R,
      R,
      2,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      1,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
    ],
    kick: [1, R, R, R, R, R, R, R, R, R, 1, R, R, R, R, R],
    wave: { bass: 'sine', arp: 'triangle', lead: 'square' },
    mix: { bass: 0.55, arp: 0.2, lead: 0.12, drums: 0.3 },
  },
  cherry: {
    id: 'cherry',
    bpm: 90,
    root: 64,
    scale: LYDIAN,
    chords: [
      [0, 2, 4],
      [1, 3, 5],
      [3, 5, 7],
      [4, 6, 8],
    ],
    bass: [1, R, R, R, R, R, R, R, 1, R, R, R, 2, R, R, R],
    arp: [1, R, 2, R, 3, R, 2, R, 1, R, 2, R, 3, R, 4, R],
    lead: [
      5,
      R,
      R,
      R,
      3,
      R,
      4,
      R,
      5,
      R,
      R,
      R,
      7,
      R,
      R,
      R,
      6,
      R,
      R,
      R,
      5,
      R,
      R,
      R,
      3,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
    ],
    hat: [R, R, R, R, R, R, R, R, R, R, R, R, R, R, 1, R],
    wave: { bass: 'sine', arp: 'triangle', lead: 'triangle' },
    mix: { bass: 0.45, arp: 0.2, lead: 0.3, drums: 0.15 },
  },
  mushroom: {
    id: 'mushroom',
    bpm: 112,
    root: 59,
    scale: WHOLE_TONE,
    chords: [
      [0, 2, 4],
      [1, 3, 5],
      [2, 4, 6],
      [1, 3, 5],
    ],
    bass: [1, R, 1, R, R, 2, R, R, 1, R, 1, R, R, R, 2, R],
    arp: [1, 2, 3, 2, R, 3, 2, 1, R, 2, 3, 4, 3, R, 2, R],
    lead: [
      4,
      R,
      5,
      R,
      6,
      R,
      R,
      R,
      5,
      R,
      4,
      R,
      R,
      R,
      R,
      R,
      3,
      R,
      4,
      R,
      5,
      R,
      R,
      R,
      4,
      R,
      2,
      R,
      R,
      R,
      R,
      R,
    ],
    kick: [1, R, R, R, R, R, R, 1, R, R, R, R, 1, R, R, R],
    hat: [R, 1, R, R, R, 1, R, R, R, 1, R, R, R, 1, R, 1],
    wave: { bass: 'triangle', arp: 'square', lead: 'square' },
    mix: { bass: 0.5, arp: 0.13, lead: 0.17, drums: 0.3 },
  },
  badlands: {
    id: 'badlands',
    bpm: 94,
    root: 53,
    scale: MINOR_PENT,
    chords: [
      [0, 2, 4],
      [0, 2, 4],
      [3, 0, 2],
      [4, 1, 3],
    ],
    bass: [1, R, R, 1, R, R, 2, R, 1, R, R, 1, R, 2, R, R],
    arp: [1, R, 2, R, 3, R, 2, R, 1, R, 3, R, 4, R, 3, R],
    lead: [
      R,
      R,
      R,
      R,
      3,
      R,
      R,
      5,
      R,
      R,
      4,
      R,
      R,
      R,
      3,
      R,
      R,
      R,
      R,
      R,
      2,
      R,
      R,
      3,
      R,
      R,
      R,
      R,
      1,
      R,
      R,
      R,
    ],
    kick: [1, R, R, R, R, R, R, 1, R, R, 1, R, R, R, R, R],
    snare: [R, R, R, R, 1, R, R, R, R, R, R, R, 1, R, R, R],
    hat: [1, R, 1, R, 1, R, 1, R, 1, R, 1, R, 1, R, 1, R],
    wave: { bass: 'sawtooth', arp: 'triangle', lead: 'square' },
    mix: { bass: 0.42, arp: 0.16, lead: 0.2, drums: 0.38 },
  },
  nether: {
    id: 'nether',
    bpm: 112,
    root: 48,
    scale: PHRYG_DOM,
    chords: [
      [0, 2, 4],
      [1, 3, 5],
      [0, 2, 4],
      [6, 1, 3],
    ],
    bass: [1, R, 1, 1, R, 1, R, 2, 1, R, 1, 1, R, 1, 2, R],
    arp: [1, 3, 2, 3, 1, 3, 2, 4, 1, 3, 2, 3, 1, 4, 3, 2],
    kick: [1, R, R, 1, R, R, 1, R, 1, R, R, 1, R, R, 1, R],
    snare: [R, R, R, R, 1, R, R, R, R, R, R, R, 1, R, R, R],
    hat: [R, 1, R, 1, R, 1, R, 1, R, 1, R, 1, R, 1, R, 1],
    wave: { bass: 'sawtooth', arp: 'square', lead: 'sawtooth' },
    mix: { bass: 0.45, arp: 0.15, lead: 0.2, drums: 0.45 },
  },
  // The End (Ender Dragon): slow and sparse. A low drone on the root and its minor second, a lone bell-like
  // arp that dwells on the tritone, no drums but a distant, soft kick every other bar. Locrian is the scale
  // with a diminished fifth: every chord sounds unresolved.
  end: {
    id: 'end',
    bpm: 66,
    root: 52,
    scale: LOCRIAN,
    chords: [
      [0, 2, 4],
      [1, 3, 5],
      [0, 2, 4],
      [4, 6, 1],
    ],
    bass: [1, R, R, R, R, R, R, R, R, R, R, R, 2, R, R, R],
    arp: [R, R, R, R, 3, R, R, R, R, R, R, 2, R, R, R, R],
    lead: [
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      5,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      4,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      6,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
      2,
      R,
      R,
      R,
      R,
      R,
      R,
      R,
    ],
    kick: [1, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    wave: { bass: 'triangle', arp: 'sine', lead: 'sine' },
    mix: { bass: 0.5, arp: 0.2, lead: 0.16, drums: 0.18 },
  },
  boss: {
    id: 'boss',
    bpm: 140,
    root: 50,
    scale: MINOR,
    chords: [
      [0, 2, 4],
      [0, 2, 4],
      [5, 0, 2],
      [4, 6, 1],
    ],
    bass: [1, 1, R, 1, 1, R, 1, 1, 1, 1, R, 1, 2, R, 2, R],
    arp: [1, 2, 3, 2, 1, 3, 2, 4, 1, 2, 3, 2, 1, 3, 4, 3],
    lead: [
      5,
      R,
      5,
      R,
      4,
      R,
      3,
      R,
      5,
      R,
      5,
      R,
      6,
      R,
      5,
      R,
      5,
      R,
      5,
      R,
      4,
      R,
      3,
      R,
      2,
      R,
      3,
      R,
      4,
      R,
      R,
      R,
    ],
    kick: [1, R, R, R, 1, R, R, R, 1, R, R, R, 1, R, 1, R],
    snare: [R, R, R, R, 1, R, R, R, R, R, R, R, 1, R, R, 1],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    wave: { bass: 'sawtooth', arp: 'square', lead: 'square' },
    mix: { bass: 0.45, arp: 0.14, lead: 0.2, drums: 0.5 },
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/**
 * Music theme of a biome (the mapping lives in each biome's `theme` field, world/biomes.ts): plains and
 * forest share the plains theme, every other biome has its own.
 */
export function biomeTheme(biome: BiomeId): ThemeId {
  return BIOMES[biome].theme;
}

/** MIDI note of a scale degree (may exceed the scale length: wraps into higher octaves). */
export function degreeToMidi(theme: Theme, degree: number): number {
  const n = theme.scale.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return theme.root + (theme.scale[idx] ?? 0) + 12 * oct;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface StepEvent {
  voice: Voice;
  /** Absent for drums. */
  midi?: number;
  /** Duration in steps. */
  len: number;
}

/** Everything that sounds on a given (global) 16th-note step of a theme. */
export function stepEvents(theme: Theme, step: number): StepEvent[] {
  const out: StepEvent[] = [];
  const pos = step % 16;
  const bar = Math.floor(step / 16);
  const chord = theme.chords[bar % theme.chords.length] ?? theme.chords[0] ?? [0, 2, 4];
  const rootDeg = chord[0] ?? 0;
  const b = theme.bass[pos] ?? 0;
  if (b > 0) {
    const deg = b === 1 ? rootDeg : (chord[2] ?? rootDeg + 4);
    out.push({ voice: 'bass', midi: degreeToMidi(theme, deg) - 24, len: 2 });
  }
  const a = theme.arp[pos] ?? 0;
  if (a > 0) {
    const deg = a === 4 ? rootDeg + theme.scale.length : (chord[a - 1] ?? rootDeg);
    out.push({ voice: 'arp', midi: degreeToMidi(theme, deg) + 12, len: 1 });
  }
  if (theme.lead && theme.lead.length > 0) {
    const l = theme.lead[step % theme.lead.length] ?? 0;
    if (l > 0)
      out.push({ voice: 'lead', midi: degreeToMidi(theme, l - 1 + theme.scale.length), len: 3 });
  }
  if (theme.kick?.[pos]) out.push({ voice: 'kick', len: 1 });
  if (theme.snare?.[pos]) out.push({ voice: 'snare', len: 1 });
  if (theme.hat?.[pos]) out.push({ voice: 'hat', len: 1 });
  return out;
}

/** Seconds a new biome's theme must be the one under the hero before the music follows. */
export const THEME_SETTLE = 4;
/** Minimum seconds between two biome-driven theme changes (walking along a border never flutters). */
export const THEME_MIN_GAP = 20;
/** Night factor to switch to the night theme, and the lower one to leave it (hysteresis). */
export const NIGHT_ON = 0.55;
export const NIGHT_OFF = 0.4;

export interface MusicSituation {
  boss: boolean;
  rift: boolean;
  /** Inside the End (its own theme, also during the dragon fight). */
  end?: boolean;
  /** 0..1 night factor. */
  night: number;
  biome: BiomeId;
}

/**
 * Chooses the run's music theme from the moment: a boss, the Nether rift and night take over at once;
 * otherwise the theme of the biome under the hero, with hysteresis so the border between two biomes
 * does not restart the track (the engine crossfades every change, but a flutter would still be noise).
 */
export class MusicDirector {
  private current: ThemeId | null = null;
  private candidate: ThemeId | null = null;
  private candidateT = 0;
  private sinceSwitch = Infinity;
  private night = false;
  private overridden = false;

  /** The theme to play now; call once per simulation step with its dt. */
  update(dt: number, s: MusicSituation): ThemeId {
    this.sinceSwitch += dt;
    this.night = s.night > (this.night ? NIGHT_OFF : NIGHT_ON);
    const want = biomeTheme(s.biome);
    if (s.end || s.boss || s.rift || this.night) {
      this.overridden = true;
      return s.end ? 'end' : s.boss ? 'boss' : s.rift ? 'nether' : 'night';
    }
    if (this.current === null || this.overridden) {
      // First call, or an override just ended: follow the biome straight away.
      const first = this.current === null;
      this.overridden = false;
      this.current = want;
      this.candidate = null;
      // After the very first pick the hero may follow a border at once; after an override, wait a while.
      this.sinceSwitch = first ? THEME_MIN_GAP : 0;
      return want;
    }
    if (want === this.current) {
      this.candidate = null;
      this.candidateT = 0;
    } else if (want !== this.candidate) {
      this.candidate = want;
      this.candidateT = 0;
    } else {
      this.candidateT += dt;
      if (this.candidateT >= THEME_SETTLE && this.sinceSwitch >= THEME_MIN_GAP) {
        this.current = want;
        this.candidate = null;
        this.sinceSwitch = 0;
      }
    }
    return this.current;
  }
}
