import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  defaultSave,
  LocalSaveStore,
  migrate,
  STARTER_ALLY,
  STARTER_EGGS,
  summarizeSave,
} from '../src/core/save';
import {
  buyEggs,
  EGG_PRICE,
  OVERWORLD_BANNER,
  pull,
  spendAndPull,
  type Banner,
} from '../src/systems/gacha';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

/** A banner that always yields `id` (every rarity pool is just that companion). */
function only(id: string): Banner {
  const pool = { common: [id], uncommon: [id], rare: [id], epic: [id], legendary: [id] };
  return { ...OVERWORLD_BANNER, id: `only-${id}`, pool, pity: 1000 };
}

describe('starter eggs (BUG-01)', () => {
  it('a new save has 5 Spawn Eggs, so the Spawner works at once', () => {
    const s = defaultSave(1);
    expect(STARTER_EGGS).toBe(5);
    expect(s.currencies).toEqual({ emeralds: 500, spawnEggs: 5, rareSpawnEggs: 0 });
    for (let i = 0; i < 5; i++) expect(spendAndPull(s, OVERWORLD_BANNER, 1, 1)).not.toBeNull();
    expect(spendAndPull(s, OVERWORLD_BANNER, 1, 1)).toBeNull();
  });

  it('the starter eggs and the Wolf are not progress (no cloud conflict on a new device)', () => {
    const sum = summarizeSave(defaultSave(5));
    expect(sum.progress).toBe(0);
    expect(sum.owned).toBe(2);
    // Opening an egg is progress.
    const s = defaultSave(5);
    spendAndPull(s, OVERWORLD_BANNER, 1, 1);
    expect(summarizeSave(s).progress).toBeGreaterThan(0);
  });

  it('migrations and stored saves never gain the starter eggs', () => {
    expect(migrate(fixture('save-v0.json')).currencies.spawnEggs).toBe(0);
    expect(migrate(fixture('save-v1-early.json')).currencies.spawnEggs).toBe(2);
    expect(migrate(fixture('save-v1-late.json')).currencies.spawnEggs).toBe(3);
    // A v2 save without the field (or a bare object) reads 0, not 5.
    expect(migrate({ saveVersion: 2, currencies: { emeralds: 10 } }).currencies.spawnEggs).toBe(0);
    expect(migrate({ saveVersion: 1 }).currencies.spawnEggs).toBe(0);
    // A saved fresh game round-trips with its 5 eggs.
    const store = new LocalSaveStore(null);
    const again = new LocalSaveStore(null).import(store.export());
    expect(again.currencies.spawnEggs).toBe(5);
  });
});

describe('buyEggs (emerald sink, no UI yet)', () => {
  it('trades EGG_PRICE emeralds for one egg and refuses when short', () => {
    const s = defaultSave(1);
    s.currencies.emeralds = EGG_PRICE * 2 + 5;
    expect(buyEggs(s)).toBe(1);
    expect(s.currencies).toMatchObject({ emeralds: EGG_PRICE + 5, spawnEggs: 6 });
    expect(buyEggs(s, 2)).toBe(0); // short by 395
    expect(s.currencies).toMatchObject({ emeralds: EGG_PRICE + 5, spawnEggs: 6 });
    expect(buyEggs(s, 0)).toBe(0);
    expect(buyEggs(s, -3)).toBe(0);
    expect(buyEggs(s, Number.NaN)).toBe(0);
    expect(buyEggs(s, 1)).toBe(1);
    expect(s.currencies.emeralds).toBe(5);
  });

  it('is never profitable: the expected refund of a pull is far below the price', () => {
    // Even with a complete collection (every pull a refund) a pull returns about 70 emeralds.
    const s = defaultSave(3);
    let refunds = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      for (const id of Object.keys(s.owned)) s.owned[id] = { level: 5, shards: 99, obtainedAt: 1 };
      const r = pull(s, OVERWORLD_BANNER, 1, 1)[0];
      refunds += r?.refund ?? 0;
      s.owned[r?.id ?? 'x'] = { level: 5, shards: 99, obtainedAt: 1 };
    }
    expect(refunds / n).toBeLessThan(EGG_PRICE / 2);
  });
});

describe('gacha auto-equip replaces only the untouched starter Wolf (BUG-02)', () => {
  it('a rarer ally takes the Wolf slot; the Wolf stays owned', () => {
    for (const id of ['snow_golem', 'cleric', 'horse', 'iron_golem']) {
      const s = defaultSave(1);
      const r = pull(s, only(id), 1, 5)[0];
      expect(r?.isNew, id).toBe(true);
      expect(r?.equipped, id).toBe('ally');
      expect(r?.replaced, id).toBe(STARTER_ALLY);
      expect(s.loadout.allies, id).toEqual([id]);
      expect(s.owned[STARTER_ALLY], id).toMatchObject({ level: 1, shards: 0 });
    }
  });

  it('an equal rarity (common) never replaces the Wolf', () => {
    const s = defaultSave(1);
    const r = pull(s, only('butcher'), 1, 5)[0];
    expect(r?.isNew).toBe(true);
    expect(r?.equipped).toBeUndefined();
    expect(r?.replaced).toBeUndefined();
    expect(s.loadout.allies).toEqual(['wolf']);
    expect(s.owned['butcher']).toBeDefined();
  });

  it('a levelled or shard-carrying Wolf is no longer the untouched starter', () => {
    const leveled = defaultSave(1);
    leveled.owned['wolf'] = { level: 2, shards: 1, obtainedAt: 1 };
    expect(pull(leveled, only('iron_golem'), 1, 5)[0]?.equipped).toBeUndefined();
    expect(leveled.loadout.allies).toEqual(['wolf']);
    // The Wolf pulled again from the banner (a duplicate) becomes touched too.
    const dup = defaultSave(1);
    pull(dup, only('wolf'), 1, 5);
    expect(dup.owned['wolf']).toMatchObject({ level: 2, shards: 1 });
    expect(pull(dup, only('horse'), 1, 6)[0]?.equipped).toBeUndefined();
    expect(dup.loadout.allies).toEqual(['wolf']);
    // Shards without a level-up count as touched as well.
    const shards = defaultSave(1);
    shards.owned['wolf'] = { level: 1, shards: 1, obtainedAt: 1 };
    expect(pull(shards, only('horse'), 1, 5)[0]?.equipped).toBeUndefined();
  });

  it('never replaces any other equipped companion', () => {
    const s = defaultSave(1);
    s.owned['butcher'] = { level: 1, shards: 0, obtainedAt: 1 };
    s.loadout.allies = ['butcher']; // a common ally the player chose, the Wolf is not equipped
    const r = pull(s, only('iron_golem'), 1, 5)[0];
    expect(r?.equipped).toBeUndefined();
    expect(s.loadout.allies).toEqual(['butcher']);
    // A lower-rank ally is no exception: only the Wolf is ever replaced.
    const t = defaultSave(1);
    t.owned['horse'] = { level: 1, shards: 0, obtainedAt: 1 };
    t.loadout.allies = ['horse'];
    expect(pull(t, only('iron_golem'), 1, 5)[0]?.equipped).toBeUndefined();
    expect(t.loadout.allies).toEqual(['horse']);
  });

  it('with two slots an empty one is filled first and the Wolf is replaced only when both are full', () => {
    const s = defaultSave(1);
    s.upgrades['account'] = { leadership: 1 };
    const first = pull(s, only('cleric'), 1, 5)[0];
    expect(first?.equipped).toBe('ally');
    expect(first?.replaced).toBeUndefined();
    expect(s.loadout.allies).toEqual(['wolf', 'cleric']);
    const second = pull(s, only('horse'), 1, 6)[0];
    expect(second?.replaced).toBe('wolf');
    expect(s.loadout.allies).toEqual(['horse', 'cleric']);
    // The Wolf is gone from the loadout: nothing more can be replaced.
    expect(pull(s, only('iron_golem'), 1, 7)[0]?.equipped).toBeUndefined();
    expect(s.loadout.allies).toEqual(['horse', 'cleric']);
  });

  it('pets keep the old rule: only an empty pet slot, no replacement', () => {
    const s = defaultSave(1);
    const a = pull(s, only('wolf_pup'), 1, 5)[0];
    expect(a?.equipped).toBe('pet');
    expect(a?.replaced).toBeUndefined();
    expect(s.loadout.allies).toEqual(['wolf']);
    const b = pull(s, only('wisp'), 1, 6)[0];
    expect(b?.equipped).toBeUndefined();
    expect(s.loadout.pet).toBe('wolf_pup');
  });

  it('duplicates and heroes never equip or replace', () => {
    const s = defaultSave(1);
    pull(s, only('horse'), 1, 5); // replaces the Wolf
    const dup = pull(s, only('horse'), 1, 6)[0];
    expect(dup?.isNew).toBe(false);
    expect(dup?.equipped).toBeUndefined();
    const hero = pull(s, only('alex'), 1, 7)[0];
    expect(hero?.equipped).toBeUndefined();
    expect(s.loadout).toMatchObject({ hero: 'steve', allies: ['horse'] });
  });

  it('migrated saves: the Wolf of an early v1 save is levelled so it is kept; an empty loadout fills normally', () => {
    const early = migrate(fixture('save-v1-early.json'));
    expect(early.owned['wolf']?.level).toBe(2);
    expect(pull(early, only('iron_golem'), 1, 5)[0]?.equipped).toBeUndefined();
    expect(early.loadout.allies).toEqual(['wolf']);
    // A prototype save has no ally at all: the first new ally takes the empty slot, no replacement involved.
    const v0 = migrate(fixture('save-v0.json'));
    const r = pull(v0, only('horse'), 1, 5)[0];
    expect(r?.equipped).toBe('ally');
    expect(r?.replaced).toBeUndefined();
    expect(v0.loadout.allies).toEqual(['horse']);
    // A late v1 save owns the Wolf at level 2 and two slots full of its own choice: nothing is replaced.
    const late = migrate(fixture('save-v1-late.json'));
    expect(pull(late, only('horse'), 1, 5)[0]?.equipped).toBeUndefined();
    expect(late.loadout.allies).toEqual(['wolf', 'iron_golem']);
  });
});
