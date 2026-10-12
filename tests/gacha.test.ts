import { describe, expect, it } from 'vitest';
import {
  COMPANIONS,
  ALLIES,
  HEROES,
  PETS,
  MAX_COMPANION_LEVEL,
  type CompanionRarity,
  RARITY_ORDER,
} from '../src/data/companions';
import { defaultSave } from '../src/core/save';
import {
  type Banner,
  OVERWORLD_BANNER,
  dupesToReach,
  pull,
  pullRng,
  rollRarity,
  spendAndPull,
} from '../src/systems/gacha';

describe('companion data', () => {
  it('meets the v1.0 content floor and has unique ids and pools', () => {
    expect(PETS.length).toBeGreaterThanOrEqual(30);
    expect(ALLIES.length).toBeGreaterThanOrEqual(22);
    expect(HEROES).toHaveLength(11);
    expect(new Set(COMPANIONS.map((c) => c.id)).size).toBe(COMPANIONS.length);
    for (const r of RARITY_ORDER) expect(OVERWORLD_BANNER.pool[r].length).toBeGreaterThan(0);
    const rates = Object.values(OVERWORLD_BANNER.rates).reduce((a, b) => a + b, 0);
    expect(rates).toBeCloseTo(100, 6);
    for (const c of COMPANIONS) expect(c.quip.length).toBeGreaterThan(10);
  });
});

describe('gacha rates', () => {
  it('rolls rarities within 1% of the published rates over 1e6 pulls', () => {
    const rng = pullRng(123, 1);
    const counts: Record<CompanionRarity, number> = {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
    };
    const N = 1_000_000;
    for (let i = 0; i < N; i++) counts[rollRarity(OVERWORLD_BANNER, rng.float())]++;
    for (const r of RARITY_ORDER) {
      const pct = (counts[r] / N) * 100;
      expect(Math.abs(pct - OVERWORLD_BANNER.rates[r])).toBeLessThan(1);
    }
  });

  it('is deterministic for a seed and pull index', () => {
    const a = defaultSave(1000);
    const b = defaultSave(1000);
    a.gachaSeed = b.gachaSeed = 777;
    const ra = pull(a, OVERWORLD_BANNER, 10, 5).map((r) => r.id);
    const rb = pull(b, OVERWORLD_BANNER, 10, 5).map((r) => r.id);
    expect(ra).toEqual(rb);
    expect(a.pullCount).toBe(10);
  });
});

describe('gacha guarantees', () => {
  it('x10 always contains a Rare or better', () => {
    for (let seed = 0; seed < 400; seed++) {
      const s = defaultSave(1);
      s.gachaSeed = seed;
      const rs = pull(s, OVERWORLD_BANNER, 10, 1);
      expect(rs.some((r) => RARITY_ORDER.indexOf(r.rarity) >= 2)).toBe(true);
    }
  });

  it('forces a Legendary after 60 pulls without one', () => {
    const banner: Banner = {
      ...OVERWORLD_BANNER,
      rates: { common: 100, uncommon: 0, rare: 0, epic: 0, legendary: 0 },
    };
    const s = defaultSave(1);
    const rs = pull(s, banner, 60, 1);
    expect(rs.slice(0, 59).every((r) => r.rarity === 'common')).toBe(true);
    const last = rs[59];
    expect(last?.rarity).toBe('legendary');
    expect(last?.pityHit).toBe(true);
    expect(s.pity[banner.id]).toBe(0);
    // And the counter keeps counting afterwards.
    pull(s, banner, 5, 1);
    expect(s.pity[banner.id]).toBe(5);
  });

  it('keeps pity below 60 with default rates and resets on a Legendary', () => {
    const s = defaultSave(1);
    s.gachaSeed = 99;
    let max = 0;
    for (let i = 0; i < 600; i++) {
      pull(s, OVERWORLD_BANNER, 1, 1);
      max = Math.max(max, s.pity[OVERWORLD_BANNER.id] ?? 0);
    }
    expect(max).toBeLessThan(60);
  });
});

describe('duplicates and collection', () => {
  it('levels a companion with 1/2/3/4 duplicates and refunds Emeralds after level 5', () => {
    expect([2, 3, 4, 5].map(dupesToReach)).toEqual([1, 3, 6, 10]);
    const banner: Banner = {
      ...OVERWORLD_BANNER,
      rates: { common: 100, uncommon: 0, rare: 0, epic: 0, legendary: 0 },
      pool: { ...OVERWORLD_BANNER.pool, common: ['chicken'] },
      pity: 1000,
    };
    const s = defaultSave(1);
    const emeralds = s.currencies.emeralds;
    const rs = pull(s, banner, 12, 1);
    expect(rs[0]?.isNew).toBe(true);
    expect(s.owned.chicken?.level).toBe(MAX_COMPANION_LEVEL);
    expect(rs[11]?.refund).toBe(30);
    expect(s.currencies.emeralds).toBe(emeralds + 30);
  });

  it('gives hero duplicates 5 shards and 500 Emeralds', () => {
    const banner: Banner = {
      ...OVERWORLD_BANNER,
      rates: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 100 },
      pool: { ...OVERWORLD_BANNER.pool, legendary: ['alex'] },
    };
    const s = defaultSave(1);
    pull(s, banner, 1, 1);
    const before = s.currencies.emeralds;
    const r = pull(s, banner, 1, 1)[0];
    expect(r?.isNew).toBe(false);
    expect(r?.shards).toBe(5);
    expect(s.owned.alex?.shards).toBe(5);
    expect(s.currencies.emeralds).toBe(before + 500);
  });

  it('spends tickets and refuses when short', () => {
    const s = defaultSave(1);
    expect(spendAndPull(s, OVERWORLD_BANNER, 1)).toBeNull();
    s.currencies.spawnEggs = 1;
    s.currencies.rareSpawnEggs = 1;
    expect(spendAndPull(s, OVERWORLD_BANNER, 1)).toHaveLength(1);
    expect(s.currencies.spawnEggs).toBe(0);
    expect(spendAndPull(s, OVERWORLD_BANNER, 10)).toHaveLength(10);
    expect(s.currencies.rareSpawnEggs).toBe(0);
  });
});
