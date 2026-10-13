/**
 * Screen shake as a trauma model (Squirrel Eiserloh, GDC 2016): events add trauma, trauma decays linearly, the shake
 * is trauma squared, and the camera is moved by whole-pixel translations taken from deterministic noise. Never a
 * rotation: the pixel art would shimmer.
 */

/** Trauma lost per second (full trauma lasts about 0.55 s). */
export const TRAUMA_DECAY = 1.8;
/** Peak offset in art pixels at trauma 1. */
export const MAX_SHAKE_PX = 8;
/** Noise lattice rate: a new random target every 1/30 s, linearly interpolated. */
export const NOISE_HZ = 30;

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Trauma that reproduces a legacy shake amplitude (px) at its peak: trauma^2 * MAX_SHAKE_PX = amplitude. */
export function traumaFromAmplitude(amp: number): number {
  return clamp01(Math.sqrt(Math.max(0, amp) / MAX_SHAKE_PX));
}

export function decayTrauma(trauma: number, dt: number): number {
  return Math.max(0, trauma - TRAUMA_DECAY * dt);
}

/** Shake size in px for a trauma value. */
export function shakeMagnitude(trauma: number): number {
  const t = clamp01(trauma);
  return t * t * MAX_SHAKE_PX;
}

/** Deterministic integer hash to [-1, 1]. */
export function hashNoise(i: number, seed: number): number {
  let h = (Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h / 0xffffffff) * 2 - 1;
}

/** Value noise in [-1, 1] at time `t` seconds. */
export function noise(t: number, seed: number): number {
  const x = t * NOISE_HZ;
  const i = Math.floor(x);
  const f = x - i;
  return hashNoise(i, seed) * (1 - f) + hashNoise(i + 1, seed) * f;
}

/** Whole-pixel camera offset for a trauma value at time `t`. Pure and deterministic. */
export function shakeOffset(trauma: number, t: number): { x: number; y: number } {
  const m = shakeMagnitude(trauma);
  if (m < 0.5) return { x: 0, y: 0 };
  // `+ 0` turns -0 into 0.
  return { x: Math.round(noise(t, 11) * m) + 0, y: Math.round(noise(t, 71) * m) + 0 };
}

/** Per-run shake state kept by the run screen. */
export class Shake {
  trauma = 0;
  clock = 0;
  private seen = 0;

  /**
   * Advance by one rendered frame. `legacy` is `run.shake`, a peak amplitude in px that the game raises with
   * `max(shake, n)` and decays quickly by itself; a rise is a new event. Returns the camera offset.
   */
  step(legacy: number, dt: number, enabled: boolean): { x: number; y: number } {
    if (!enabled) {
      this.trauma = 0;
      this.seen = legacy;
      return { x: 0, y: 0 };
    }
    if (legacy > this.seen + 1e-3) this.trauma = Math.max(this.trauma, traumaFromAmplitude(legacy));
    this.seen = legacy;
    this.clock += dt;
    this.trauma = decayTrauma(this.trauma, dt);
    return shakeOffset(this.trauma, this.clock);
  }
}
