import { describe, expect, it } from 'vitest';
import { segDist2, sweepHit } from '../src/core/geom';
import { defaultSave, LocalSaveStore, migrate, SAVE_VERSION } from '../src/core/save';
import { SpatialHash } from '../src/core/spatialhash';
import { runReward, xpToNext } from '../src/systems/economy';

describe('swept collision', () => {
  it('hits an enemy that sits right on the projectile start (no point-blank immunity)', () => {
    expect(sweepHit(0, 0, 8, 0, 2, 1, 0, 5)).toBe(true);
  });

  it('hits an enemy the projectile passed through within one frame', () => {
    // A fast arrow moves 8 px per frame; the enemy is in the middle of the segment.
    expect(sweepHit(0, 0, 8, 0, 1, 4, 3, 3)).toBe(true);
    // A point-only test at the end position would miss it.
    expect(Math.hypot(8 - 4, 0 - 3)).toBeGreaterThan(1 + 3);
  });

  it('misses when the path stays clear and handles zero-length segments', () => {
    expect(sweepHit(0, 0, 8, 0, 1, 4, 20, 3)).toBe(false);
    expect(segDist2(1, 1, 1, 1, 4, 5)).toBe(25);
  });
});

describe('SpatialHash', () => {
  it('finds circles in range and rebuilds cleanly', () => {
    const hash = new SpatialHash<{ x: number; y: number; radius: number }>(32);
    const a = { x: 10, y: 10, radius: 5 };
    const b = { x: 200, y: 200, radius: 5 };
    const c = { x: -40, y: -40, radius: 5 };
    [a, b, c].forEach((e) => hash.insert(e));
    const out: (typeof a)[] = [];
    expect(hash.query(12, 12, 10, out)).toEqual([a]);
    expect(hash.query(-38, -38, 4, out)).toEqual([c]);
    hash.clear();
    expect(hash.query(12, 12, 10, out)).toEqual([]);
    hash.insert(b);
    expect(hash.query(198, 198, 6, out)).toEqual([b]);
  });
});

describe('economy', () => {
  it('computes the run reward from BRIEF section 12', () => {
    expect(runReward({ timeSec: 300, kills: 200, bosses: 1, miniBosses: 1, picked: 30 })).toBe(
      60 + 50 + 80 + 40 + 30,
    );
    expect(runReward({ timeSec: 100, kills: 0, bosses: 0, miniBosses: 0, picked: 0 }, 1.5)).toBe(
      30,
    );
  });

  it('xpToNext follows 10 + level * 8', () => {
    expect(xpToNext(1)).toBe(18);
    expect(xpToNext(10)).toBe(90);
  });
});

describe('save', () => {
  it('migrates a v0 prototype save', () => {
    const s = migrate({ bestTime: 321, bestKills: 77, emeralds: 900, createdAt: 5 });
    expect(s.saveVersion).toBe(SAVE_VERSION);
    expect(s.records.bestTimeSec).toBe(321);
    expect(s.records.bestKills).toBe(77);
    expect(s.currencies.emeralds).toBe(900);
    expect(s.loadout.hero).toBe('steve');
  });

  it('fills missing fields of an older v1 save and rejects newer or corrupt data', () => {
    const partial = { saveVersion: 1, records: { bestKills: 9 } };
    const s = migrate(partial);
    expect(s.records.bestKills).toBe(9);
    expect(s.records.runs).toBe(0);
    expect(s.settings.musicVolume).toBe(0.6);
    expect(migrate({ saveVersion: 999, currencies: { emeralds: 1 } }).currencies.emeralds).toBe(
      500,
    );
    expect(migrate('garbage').saveVersion).toBe(SAVE_VERSION);
    expect(migrate(null).saveVersion).toBe(SAVE_VERSION);
  });

  it('round-trips through a store, export and import, and survives blocked storage', () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    const store = new LocalSaveStore(storage);
    const data = store.load();
    data.records.bestKills = 42;
    store.save(data);
    expect(new LocalSaveStore(storage).load().records.bestKills).toBe(42);
    const json = store.export();
    const other = new LocalSaveStore(null);
    expect(other.import(json).records.bestKills).toBe(42);
    const broken = new LocalSaveStore({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(broken.load().currencies.emeralds).toBe(defaultSave().currencies.emeralds);
    expect(() => broken.save(broken.load())).not.toThrow();
  });
});
