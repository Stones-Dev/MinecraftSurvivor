import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';

describe('Rng', () => {
  it('is reproducible for a seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('differs between seeds', () => {
    expect(new Rng(1).nextU32()).not.toBe(new Rng(2).nextU32());
  });

  it('forks independent streams that do not depend on draws so far', () => {
    const a = new Rng(99);
    const b = new Rng(99);
    a.nextU32();
    a.nextU32();
    expect(a.fork('world').nextU32()).toBe(b.fork('world').nextU32());
    expect(b.fork('world').nextU32()).not.toBe(b.fork('spawn').nextU32());
  });

  it('keeps floats in [0,1) and ints in range', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      expect(r.int(6)).toBeLessThan(6);
    }
  });
});
