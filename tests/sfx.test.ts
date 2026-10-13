import { describe, expect, it } from 'vitest';
import { BIOME_IDS, BIOMES } from '../src/world/biomes';
import { TILE } from '../src/world/terrain';
import {
  RateLimiter,
  SOFT_VOICE_CAP,
  SPACING,
  STEP_MATERIALS,
  STEP_TIMBRE,
  aggregateEvents,
  burstPlan,
  detune,
  stepMaterial,
  type SfxName,
} from '../src/core/sfxModel';

describe('aggregateEvents', () => {
  it('counts duplicates and keeps the order of first appearance', () => {
    const ev: SfxName[] = ['hit', 'swing', 'hit', 'hit', 'step', 'swing'];
    expect(aggregateEvents(ev)).toEqual([
      ['hit', 3],
      ['swing', 2],
      ['step', 1],
    ]);
    expect(aggregateEvents([])).toEqual([]);
  });
});

describe('RateLimiter', () => {
  it('lets an effect through once per its spacing, per effect', () => {
    const r = new RateLimiter();
    expect(r.allow('hit', 1)).toBe(true);
    expect(r.allow('hit', 1 + SPACING.hit / 2)).toBe(false);
    expect(r.allow('swing', 1.001)).toBe(true); // a different effect is independent
    expect(r.allow('hit', 1 + SPACING.hit + 0.001)).toBe(true);
    r.clear();
    expect(r.allow('hit', 1 + SPACING.hit + 0.002)).toBe(true);
  });

  it('a rejected play does not push the window out', () => {
    const r = new RateLimiter();
    expect(r.allow('hit', 0)).toBe(true);
    for (let t = 0.01; t < SPACING.hit; t += 0.01) expect(r.allow('hit', t)).toBe(false);
    expect(r.allow('hit', SPACING.hit + 0.001)).toBe(true);
  });
});

describe('burstPlan', () => {
  it('a lone event is a single, undetuned voice', () => {
    expect(burstPlan('hit', 1)).toEqual([{ delay: 0, gain: 1, spread: 0 }]);
    expect(burstPlan('hit', 0)).toHaveLength(1);
  });

  it('a crowd of hits becomes a short staggered burst, capped at 3 voices', () => {
    const plan = burstPlan('hit', 10);
    expect(plan).toHaveLength(3);
    for (let i = 1; i < plan.length; i++) {
      const prev = plan[i - 1];
      const cur = plan[i];
      expect(cur && prev && cur.delay > prev.delay).toBe(true);
      expect(cur && prev && cur.gain < prev.gain).toBe(true);
      expect(cur?.spread).toBe(1);
    }
    expect(plan[plan.length - 1]?.delay).toBeLessThan(0.06); // still reads as one hit
    // Louder than one voice but never a wall: summed gain stays under 2.
    expect(plan.reduce((a, v) => a + v.gain, 0)).toBeLessThan(2);
  });

  it('effects without a burst entry stay single, and the voice budget stays modest', () => {
    expect(burstPlan('explode', 20)).toHaveLength(1);
    expect(burstPlan('hurt', 20)).toHaveLength(1);
    for (const n of ['hit', 'swing', 'bow'] as const) {
      // Two nodes per voice (tone and noise) at most: a burst alone never fills the soft cap.
      expect(burstPlan(n, 99).length * 2).toBeLessThanOrEqual(SOFT_VOICE_CAP);
    }
  });
});

describe('detune', () => {
  it('stays within the requested band', () => {
    expect(detune(0, 0.05)).toBeCloseTo(0.95, 6);
    expect(detune(0.5, 0.05)).toBeCloseTo(1, 6);
    expect(detune(0.999999, 0.05)).toBeLessThanOrEqual(1.05);
    expect(detune(-3, 0.05)).toBeGreaterThanOrEqual(0.95);
    expect(detune(7, 0.05)).toBeLessThanOrEqual(1.05);
  });
});

describe('footstep surfaces', () => {
  it('water, ice, lava and soul sand override the tile', () => {
    expect(stepMaterial(TILE.GRASS, 'grass', 'water')).toBe('water');
    expect(stepMaterial(TILE.GRASS, 'snow', 'ice')).toBe('stone');
    expect(stepMaterial(TILE.GRASS, 'netherrack', 'lava')).toBe('stone');
    expect(stepMaterial(TILE.SAND, 'netherrack', 'soul')).toBe('mud');
  });

  it('sand tiles are sand anywhere, otherwise the biome ground family decides', () => {
    expect(stepMaterial(TILE.SAND, 'grass', 'ground')).toBe('sand');
    expect(stepMaterial(TILE.GRASS, 'grass', 'ground')).toBe('grass');
    expect(stepMaterial(TILE.GRASS, 'podzol', 'ground')).toBe('grass');
    expect(stepMaterial(TILE.GRASS, 'mycelium', 'ground')).toBe('grass');
    expect(stepMaterial(TILE.GRASS, 'sand', 'ground')).toBe('sand');
    expect(stepMaterial(TILE.GRASS, 'red_sand', 'ground')).toBe('sand');
    expect(stepMaterial(TILE.GRASS, 'snow', 'ground')).toBe('snow');
    expect(stepMaterial(TILE.GRASS, 'mud', 'ground')).toBe('mud');
    expect(stepMaterial(TILE.GRASS, 'netherrack', 'ground')).toBe('stone');
    expect(stepMaterial(TILE.WALL, 'grass', 'ground')).toBe('stone');
  });

  it('every biome walks on a known material, and the world offers all six', () => {
    const seen = new Set<string>();
    for (const id of BIOME_IDS) {
      const m = stepMaterial(TILE.GRASS, BIOMES[id].ground, 'ground');
      expect(STEP_MATERIALS).toContain(m);
      seen.add(m);
    }
    seen.add(stepMaterial(TILE.GRASS, 'grass', 'water'));
    seen.add(stepMaterial(TILE.WALL, 'grass', 'ground'));
    expect(seen.size).toBe(STEP_MATERIALS.length);
  });

  it('each material has its own timbre, and all of them are quiet and short', () => {
    const keys = STEP_MATERIALS.map((m) => {
      const t = STEP_TIMBRE[m];
      return [t.noiseCut, t.noiseDur, t.ticks, t.toneHz, t.toneType].join('/');
    });
    expect(new Set(keys).size).toBe(STEP_MATERIALS.length);
    for (const m of STEP_MATERIALS) {
      const t = STEP_TIMBRE[m];
      expect(t.noiseVol).toBeGreaterThan(0);
      expect(t.noiseVol).toBeLessThanOrEqual(0.05);
      expect(t.toneVol).toBeLessThanOrEqual(0.05);
      expect(t.noiseDur).toBeLessThanOrEqual(0.15);
      expect(t.toneDur).toBeLessThanOrEqual(0.15);
      expect(t.ticks).toBeGreaterThanOrEqual(1);
      // A footstep must fit well inside the step spacing, including the last tick's delay.
      expect(t.noiseDur + (t.ticks - 1) * 0.035).toBeLessThan(SPACING.step);
      if (t.toneVol > 0) expect(t.toneHz).toBeGreaterThan(0);
    }
  });
});
