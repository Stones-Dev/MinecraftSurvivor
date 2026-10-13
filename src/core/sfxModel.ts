/**
 * Pure parts of the sound effects (no Web Audio, testable in node): the effect names, event aggregation,
 * the per-effect rate limiter, the polyphony plan for a burst of the same event, and the footstep surface
 * to timbre mapping. `AudioEngine` (audio.ts) turns these into oscillators and noise.
 */
import type { GroundFamily } from '../world/biomes';
import { TILE } from '../world/terrain';
import type { Surface } from '../world/world';

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
  | 'trade'
  | 'splash'
  | 'snow'
  | 'thunder'
  | 'chest'
  | 'egg'
  | 'spin'
  | 'gameover'
  | 'step';

/** Minimum seconds between two plays of the same effect (keeps crowds from clipping). */
export const SPACING: Record<SfxName, number> = {
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
  splash: 0.1,
  snow: 0.08,
  thunder: 0.15,
  chest: 0.2,
  egg: 0.3,
  spin: 0.03,
  gameover: 2,
  step: 0.17,
};

/**
 * One simulation step's events as `[name, count]` pairs in order of first appearance. Ten hits in one step
 * used to collapse into a single `Set` entry (one click); now the engine learns how many there were.
 */
export function aggregateEvents(events: readonly SfxName[]): [SfxName, number][] {
  const counts = new Map<SfxName, number>();
  for (const ev of events) counts.set(ev, (counts.get(ev) ?? 0) + 1);
  return [...counts];
}

/** Per-effect minimum spacing (see `SPACING`): `allow` answers and records in one call. */
export class RateLimiter {
  private readonly last = new Map<SfxName, number>();

  /** True when `name` may play at time `now` (seconds); records the play when it does. */
  allow(name: SfxName, now: number): boolean {
    const prev = this.last.get(name);
    if (prev !== undefined && now - prev < SPACING[name]) return false;
    this.last.set(name, now);
    return true;
  }

  clear(): void {
    this.last.clear();
  }
}

// ---------- polyphony ----------

/** Effects that play as a short burst of staggered, detuned voices when several happen at once. */
const BURST_MAX: Partial<Record<SfxName, number>> = { hit: 3, swing: 2, bow: 2, hurt: 1 };

/** Soft ceiling for extra burst voices: above it only the first voice of an effect plays. */
export const SOFT_VOICE_CAP = 8;

/** Seconds between the voices of a burst. */
const BURST_STAGGER = 0.022;

export interface BurstVoice {
  /** Start delay in seconds. */
  delay: number;
  /** Volume factor (the loudest voice is 1). */
  gain: number;
  /** Extra pitch spread factor (0 for the first voice, so a lone effect is never detuned by the burst). */
  spread: number;
}

/**
 * Voices to start for `count` simultaneous events of `name`: 1 voice for a lone event, up to the effect's
 * cap for a crowd (hits: 3). Later voices are quieter and later; the summed gain stays below 2 so a crowd is
 * a little fuller, never a wall of sound.
 */
export function burstPlan(name: SfxName, count: number): BurstVoice[] {
  const cap = BURST_MAX[name] ?? 1;
  const n = Math.max(1, Math.min(cap, Math.floor(count)));
  const out: BurstVoice[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ delay: i * BURST_STAGGER, gain: 0.6 ** i, spread: i === 0 ? 0 : 1 });
  }
  return out;
}

/** Pitch multiplier in `[1 - amount, 1 + amount]` for a uniform `u` in [0, 1). */
export function detune(u: number, amount: number): number {
  return 1 + (Math.max(0, Math.min(0.999999, u)) * 2 - 1) * amount;
}

// ---------- footsteps ----------

export type StepMaterial = 'grass' | 'sand' | 'snow' | 'stone' | 'water' | 'mud';

export const STEP_MATERIALS: readonly StepMaterial[] = [
  'grass',
  'sand',
  'snow',
  'stone',
  'water',
  'mud',
];

/**
 * What the hero is walking on. `tile` is the terrain tile (TILE.*), `ground` the biome's ground family and
 * `surface` the world's surface answer (water, ice, lava, soul sand), which wins over the tile.
 */
export function stepMaterial(tile: number, ground: GroundFamily, surface: Surface): StepMaterial {
  if (surface === 'water') return 'water';
  if (surface === 'ice' || surface === 'lava') return 'stone';
  if (surface === 'soul') return 'mud';
  if (tile === TILE.SAND) return 'sand';
  if (tile === TILE.WALL) return 'stone';
  switch (ground) {
    case 'sand':
    case 'red_sand':
      return 'sand';
    case 'snow':
      return 'snow';
    case 'mud':
      return 'mud';
    case 'netherrack':
      return 'stone';
    default:
      return 'grass';
  }
}

export interface StepTimbre {
  /** Noise burst: seconds, volume, low-pass cutoff (Hz) and how many quick ticks it is split into. */
  noiseDur: number;
  noiseVol: number;
  noiseCut: number;
  ticks: number;
  /** Optional tonal part (0 volume = none). */
  toneHz: number;
  toneTo: number;
  toneDur: number;
  toneVol: number;
  toneType: OscillatorType;
}

/**
 * Footstep voices, deliberately quiet (the old single footstep was a 0.035 noise tick): soft low-pass noise
 * for grass, hissy long noise for sand, two crunchy ticks for snow, a short hard click for stone, a splash
 * for water and a dull squelch for mud.
 */
export const STEP_TIMBRE: Record<StepMaterial, StepTimbre> = {
  grass: {
    noiseDur: 0.05,
    noiseVol: 0.035,
    noiseCut: 1100,
    ticks: 1,
    toneHz: 0,
    toneTo: 0,
    toneDur: 0,
    toneVol: 0,
    toneType: 'sine',
  },
  sand: {
    noiseDur: 0.075,
    noiseVol: 0.028,
    noiseCut: 3000,
    ticks: 1,
    toneHz: 0,
    toneTo: 0,
    toneDur: 0,
    toneVol: 0,
    toneType: 'sine',
  },
  snow: {
    noiseDur: 0.035,
    noiseVol: 0.03,
    noiseCut: 4200,
    ticks: 2,
    toneHz: 0,
    toneTo: 0,
    toneDur: 0,
    toneVol: 0,
    toneType: 'sine',
  },
  stone: {
    noiseDur: 0.025,
    noiseVol: 0.03,
    noiseCut: 2400,
    ticks: 1,
    toneHz: 200,
    toneTo: 120,
    toneDur: 0.04,
    toneVol: 0.03,
    toneType: 'triangle',
  },
  water: {
    noiseDur: 0.12,
    noiseVol: 0.04,
    noiseCut: 1900,
    ticks: 1,
    toneHz: 520,
    toneTo: 260,
    toneDur: 0.09,
    toneVol: 0.03,
    toneType: 'sine',
  },
  mud: {
    noiseDur: 0.09,
    noiseVol: 0.035,
    noiseCut: 520,
    ticks: 1,
    toneHz: 110,
    toneTo: 70,
    toneDur: 0.08,
    toneVol: 0.035,
    toneType: 'sine',
  },
};
