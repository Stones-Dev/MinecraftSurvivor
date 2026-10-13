import { describe, expect, it } from 'vitest';
import {
  MAX_SHAKE_PX,
  Shake,
  TRAUMA_DECAY,
  decayTrauma,
  hashNoise,
  noise,
  shakeMagnitude,
  shakeOffset,
  traumaFromAmplitude,
} from '../src/core/shake';

describe('trauma shake (pure)', () => {
  it('decays 1.8 per second down to zero', () => {
    expect(TRAUMA_DECAY).toBe(1.8);
    expect(decayTrauma(1, 0.5)).toBeCloseTo(0.1);
    expect(decayTrauma(0.5, 1)).toBe(0);
  });

  it('shake is trauma squared', () => {
    expect(shakeMagnitude(1)).toBe(MAX_SHAKE_PX);
    expect(shakeMagnitude(0.5)).toBeCloseTo(MAX_SHAKE_PX * 0.25);
    expect(shakeMagnitude(0)).toBe(0);
    expect(shakeMagnitude(3)).toBe(MAX_SHAKE_PX); // clamped
  });

  it('a legacy amplitude comes back at its peak size', () => {
    for (const amp of [1.5, 3, 4, 7]) {
      expect(shakeMagnitude(traumaFromAmplitude(amp))).toBeCloseTo(amp);
    }
    expect(traumaFromAmplitude(99)).toBe(1);
  });

  it('noise is deterministic, bounded and varies quickly', () => {
    expect(hashNoise(5, 11)).toBe(hashNoise(5, 11));
    let min = 1;
    let max = -1;
    let changes = 0;
    let prev = noise(0, 11);
    for (let i = 1; i < 600; i++) {
      const v = noise(i / 60, 11);
      min = Math.min(min, v);
      max = Math.max(max, v);
      if (Math.abs(v - prev) > 0.05) changes++;
      prev = v;
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
    expect(max - min).toBeGreaterThan(1.2);
    expect(changes).toBeGreaterThan(300);
  });

  it('offsets are whole pixels, never exceed the magnitude, and vanish below half a pixel', () => {
    for (let i = 0; i < 400; i++) {
      const t = i / 60;
      const trauma = 0.2 + (i % 9) / 10;
      const o = shakeOffset(trauma, t);
      expect(Number.isInteger(o.x)).toBe(true);
      expect(Number.isInteger(o.y)).toBe(true);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(Math.ceil(shakeMagnitude(trauma)));
      expect(Object.is(o.x, -0)).toBe(false);
    }
    expect(shakeOffset(0.1, 3)).toEqual({ x: 0, y: 0 });
    expect(shakeOffset(0, 3)).toEqual({ x: 0, y: 0 });
  });

  it('the same state and inputs give the same offsets', () => {
    const play = (): string => {
      const s = new Shake();
      let out = '';
      let legacy = 0;
      for (let i = 0; i < 120; i++) {
        legacy = i === 10 ? 5 : Math.max(0, legacy - 14 / 60);
        const o = s.step(legacy, 1 / 60, true);
        out += `${o.x},${o.y};`;
      }
      return out;
    };
    expect(play()).toBe(play());
  });

  it('an event shakes, then settles about half a second later', () => {
    const s = new Shake();
    let legacy = 7;
    let moved = 0;
    const late: number[] = [];
    for (let i = 0; i < 90; i++) {
      const o = s.step(legacy, 1 / 60, true);
      legacy = Math.max(0, legacy - 14 / 60);
      if (o.x !== 0 || o.y !== 0) moved++;
      if (i > 45) late.push(Math.abs(o.x) + Math.abs(o.y));
    }
    expect(moved).toBeGreaterThan(5);
    expect(late.every((v) => v <= 1)).toBe(true);
    expect(s.trauma).toBe(0);
  });

  it('does nothing when screen shake is off (setting or reduced flashing)', () => {
    const s = new Shake();
    for (let i = 0; i < 30; i++) expect(s.step(7, 1 / 60, false)).toEqual({ x: 0, y: 0 });
    expect(s.trauma).toBe(0);
    // Turning it back on does not replay the old event.
    expect(s.step(7, 1 / 60, true)).toEqual({ x: 0, y: 0 });
  });
});
