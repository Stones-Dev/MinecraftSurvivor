import { describe, expect, it } from 'vitest';
import { ENEMIES, HERO_BOX_CD_MULT, HERO_BOX_DMG_MULT } from '../src/data/enemies';

describe('hostile ranged pressure after the taller hero hurtbox', () => {
  it('projectile shooters wait longer and hit softer; pools and beams are untouched', () => {
    const skeleton = ENEMIES['skeleton']?.shot;
    const witch = ENEMIES['witch']?.shot;
    const guardian = ENEMIES['guardian']?.shot;
    if (!skeleton || !witch || !guardian) throw new Error('missing defs');
    expect(skeleton.cd[0]).toBeCloseTo(1.8 * HERO_BOX_CD_MULT);
    expect(skeleton.cd[1]).toBeCloseTo(2.6 * HERO_BOX_CD_MULT);
    expect(skeleton.dmgMult).toBeCloseTo(HERO_BOX_DMG_MULT);
    expect(witch.cd).toEqual([4, 5.5]); // lobbed pool
    expect(witch.dmgMult).toBe(0.8);
    expect(guardian.cd).toEqual([3, 4]); // instant beam (speed 0)
  });

  it('the pressure cut is about a third (rate x damage), not more', () => {
    const cut = 1 - HERO_BOX_DMG_MULT / HERO_BOX_CD_MULT;
    expect(cut).toBeGreaterThan(0.15);
    expect(cut).toBeLessThan(0.4);
  });
});
