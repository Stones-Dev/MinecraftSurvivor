import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultSave, migrate, summarizeSave, STARTER_ALLY } from '../src/core/save';
import { COMPANION_BY_ID } from '../src/data/companions';
import { ENEMIES } from '../src/data/enemies';
import { spawnPool } from '../src/data/rosters';
import { RunState } from '../src/game';
import { killEnemy } from '../src/systems/combat';
import { OVERWORLD_BANNER, pull, type Banner } from '../src/systems/gacha';
import {
  RANDOM_START_WEIGHTS,
  defaultLoadout,
  loadoutFromSave,
  randomStartBiome,
  resolveStartBiome,
} from '../src/systems/meta';
import { updateRift } from '../src/systems/rift';
import {
  SPAWN_RING,
  WARDEN_FROM,
  WARDEN_ID,
  makeEnemy,
  updateSpawner,
} from '../src/systems/spawner';
import { OVERWORLD_BIOMES, type BiomeId } from '../src/world/biomes';

const atlas = JSON.parse(
  readFileSync(new URL('../public/atlas/atlas.json', import.meta.url), 'utf8'),
) as { anims: Record<string, unknown> };
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('random start biome (audit item 1)', () => {
  it('draws every overworld biome, keeps plains the most common and the hard ones rare', () => {
    const n = 20000;
    const tally = new Map<BiomeId, number>();
    for (let seed = 1; seed <= n; seed++) {
      const b = randomStartBiome(seed);
      tally.set(b, (tally.get(b) ?? 0) + 1);
    }
    for (const b of OVERWORLD_BIOMES) expect(tally.get(b) ?? 0, b).toBeGreaterThan(n * 0.03);
    const plains = (tally.get('plains') ?? 0) / n;
    expect(plains).toBeGreaterThan(0.26);
    expect(plains).toBeLessThan(0.34);
    for (const b of OVERWORLD_BIOMES) {
      if (b !== 'plains') expect(tally.get(b) ?? 0).toBeLessThan(tally.get('plains') ?? 0);
      // Observed share within 1.5 points of the published weight.
      const total = Object.values(RANDOM_START_WEIGHTS).reduce((a, w) => a + w, 0);
      expect(
        Math.abs((tally.get(b) ?? 0) / n - (RANDOM_START_WEIGHTS[b] ?? 0) / total),
      ).toBeLessThan(0.015);
    }
  });

  it('is a pure function of the seed', () => {
    for (const seed of [0, 1, 42, 1337, 999_999_999])
      expect(randomStartBiome(seed)).toBe(randomStartBiome(seed));
    const a = Array.from({ length: 200 }, (_, i) => randomStartBiome(i));
    const b = Array.from({ length: 200 }, (_, i) => randomStartBiome(i));
    expect(a).toEqual(b);
  });

  it('resolves: ?biome= wins, a picked biome wins, the tutorial and debug runs stay in the meadow', () => {
    const base = { seed: 7, firstRun: false, debug: false };
    expect(resolveStartBiome({ ...base, debugBiome: 'jungle', picked: 'desert' })).toBe('jungle');
    expect(resolveStartBiome({ ...base, picked: 'desert' })).toBe('desert');
    expect(resolveStartBiome({ ...base, picked: 'desert', firstRun: true })).toBe('desert');
    expect(resolveStartBiome({ ...base, firstRun: true })).toBeUndefined();
    expect(resolveStartBiome({ ...base, debug: true })).toBeUndefined();
    // "Random": the seed decides, and a plains draw means the usual meadow (undefined).
    let nonPlains = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = resolveStartBiome({ ...base, seed });
      const drawn = randomStartBiome(seed);
      expect(r).toBe(drawn === 'plains' ? undefined : drawn);
      if (r) nonPlains++;
    }
    expect(nonPlains).toBeGreaterThan(100);
  });
});

describe('starter companion (audit item 3)', () => {
  it('a new save owns and equips the Wolf ally, with working art', () => {
    const s = defaultSave(1000);
    expect(STARTER_ALLY).toBe('wolf');
    expect(s.owned['wolf']).toMatchObject({ level: 1, shards: 0 });
    expect(s.loadout).toEqual({ hero: 'steve', pet: null, allies: ['wolf'] });
    const def = COMPANION_BY_ID.get('wolf');
    expect(def?.kind).toBe('ally');
    expect(def?.rarity).toBe('common');
    const lo = loadoutFromSave(s);
    expect(lo.allies).toEqual([{ id: 'wolf', level: 1 }]);
    const run = new RunState(1, 0, lo);
    expect(run.allies).toHaveLength(1);
    const sprite = (def as { sprite: string }).sprite;
    expect(Object.keys(atlas.anims).some((k) => k.startsWith(`${sprite}.`))).toBe(true);
  });

  it('a fresh save still counts as untouched for the cloud sync prompts', () => {
    const sum = summarizeSave(defaultSave(5));
    expect(sum.owned).toBe(2);
    expect(sum.progress).toBe(0);
  });

  it('migration does not hand existing saves the wolf', () => {
    const v0 = migrate(fixture('save-v0.json'));
    expect(Object.keys(v0.owned)).toEqual(['steve']);
    expect(v0.loadout).toEqual({ hero: 'steve', pet: null, allies: [] });
    // Saves that own a wolf keep exactly their own copy (level 2, shards 1) and loadout.
    const early = migrate(fixture('save-v1-early.json'));
    expect(early.owned['wolf']).toMatchObject({ level: 2, shards: 1 });
    expect(early.loadout.allies).toEqual(['wolf']);
    const late = migrate(fixture('save-v1-late.json'));
    expect(late.owned['wolf']?.level).toBeGreaterThanOrEqual(1);
    // A save that already lists a loadout keeps exactly that loadout.
    const kept = migrate({
      saveVersion: 2,
      owned: { cat: { level: 1, shards: 0, obtainedAt: 1 } },
      loadout: { hero: 'steve', pet: 'cat', allies: [] },
    });
    expect(kept.loadout).toEqual({ hero: 'steve', pet: 'cat', allies: [] });
    expect(Object.keys(kept.owned).sort()).toEqual(['cat', 'steve']);
    // A save with nothing equipped is not auto-equipped either.
    const empty = migrate({ saveVersion: 2, loadout: { hero: 'steve', pet: null, allies: [] } });
    expect(empty.loadout.allies).toEqual([]);
    expect(empty.owned['wolf']).toBeUndefined();
  });

  it('the default run loadout (simulator, tests) is still companion-free', () => {
    const l = defaultLoadout();
    expect(l.pet).toBeNull();
    expect(l.allies).toEqual([]);
  });
});

/** A banner that always yields `id` (every rarity pool is just that companion). */
function only(id: string): Banner {
  const pool = { common: [id], uncommon: [id], rare: [id], epic: [id], legendary: [id] };
  return { ...OVERWORLD_BANNER, id: `only-${id}`, pool, pity: 1000 };
}

describe('gacha auto-equip (audit item 3)', () => {
  it('equips a new pet into an empty pet slot, never over an equipped one', () => {
    const s = defaultSave(1);
    const r = pull(s, only('cat'), 1, 5)[0];
    expect(r?.isNew).toBe(true);
    expect(r?.equipped).toBe('pet');
    expect(s.loadout.pet).toBe('cat');
    const r2 = pull(s, only('fox'), 1, 6)[0];
    expect(r2?.isNew).toBe(true);
    expect(r2?.equipped).toBeUndefined();
    expect(s.loadout.pet).toBe('cat');
    expect(s.owned['fox']).toBeDefined();
  });

  it('a duplicate pull never equips', () => {
    const s = defaultSave(1);
    s.loadout.pet = null;
    s.owned['cat'] = { level: 1, shards: 0, obtainedAt: 1 };
    const r = pull(s, only('cat'), 1, 5)[0];
    expect(r?.isNew).toBe(false);
    expect(s.loadout.pet).toBeNull();
  });

  it('allies fill free slots up to the Leadership count and no further', () => {
    const s = defaultSave(1); // the wolf already holds the only slot
    expect(pull(s, only('horse'), 1, 2)[0]?.equipped).toBeUndefined();
    expect(s.loadout.allies).toEqual(['wolf']);
    s.upgrades['account'] = { leadership: 1 };
    const r = pull(s, only('snow_golem'), 1, 3)[0];
    expect(r?.equipped).toBe('ally');
    expect(s.loadout.allies).toEqual(['wolf', 'snow_golem']);
    expect(pull(s, only('iron_golem'), 1, 4)[0]?.equipped).toBeUndefined();
    expect(s.loadout.allies).toEqual(['wolf', 'snow_golem']);
  });

  it('an emptied ally slot takes the next new ally; heroes are never equipped', () => {
    const s = defaultSave(1);
    s.loadout.allies = [];
    expect(pull(s, only('horse'), 1, 2)[0]?.equipped).toBe('ally');
    expect(s.loadout.allies).toEqual(['horse']);
    const hero = pull(s, only('alex'), 1, 3)[0];
    expect(hero?.isNew).toBe(true);
    expect(hero?.equipped).toBeUndefined();
    expect(s.loadout.hero).toBe('steve');
  });

  it('a x10 pull on the real banner equips at most one pet and one ally', () => {
    const s = defaultSave(77);
    s.loadout.allies = [];
    const res = pull(s, OVERWORLD_BANNER, 10, 9);
    expect(res.filter((r) => r.equipped === 'pet').length).toBeLessThanOrEqual(1);
    expect(res.filter((r) => r.equipped === 'ally').length).toBeLessThanOrEqual(1);
    expect(s.loadout.allies.length).toBeLessThanOrEqual(1);
  });
});

function quietRun(seed: number, time: number): RunState {
  const run = new RunState(seed, time);
  run.spawnMult = 0; // no trickle or tides: only the recycle / warden logic runs
  run.enemies.length = 0;
  return run;
}

function farZombies(run: RunState, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const e = makeEnemy(
      run,
      'zombie',
      run.player.x + Math.cos(a) * SPAWN_RING * 3,
      run.player.y + Math.sin(a) * SPAWN_RING * 3 * 0.9,
      false,
    );
    if (e) run.enemies.push(e);
  }
}

describe('enemy recycling (audit item 4)', () => {
  it('swaps full-health stragglers for freshly rolled mobs, count unchanged', () => {
    const run = quietRun(11, 5 * 60);
    farZombies(run, 40);
    const before = new Set(run.enemies);
    for (let i = 0; i < 60 * 4; i++) updateSpawner(run, 1 / 60);
    expect(run.enemies).toHaveLength(40);
    const swapped = run.enemies.filter((e) => !before.has(e));
    expect(swapped.length).toBeGreaterThan(10);
    expect(new Set(run.enemies.map((e) => e.def.id)).size).toBeGreaterThan(2);
    for (const e of run.enemies) {
      expect(Math.hypot(e.x - run.player.x, e.y - run.player.y)).toBeLessThan(SPAWN_RING * 1.5);
      expect(e.hp).toBe(e.maxHp);
    }
    // Rolled mobs come from the current roster, and none is a pack or a slime half.
    const pool = new Set(spawnPool(run.biome(), 5, false, true).map((x) => x.def.id));
    for (const e of swapped) expect(pool.has(e.def.id), e.def.id).toBe(true);
  });

  it('keeps hurt, elite and Charged stragglers as they are (only teleports them)', () => {
    const run = quietRun(12, 5 * 60);
    farZombies(run, 12);
    run.enemies.forEach((e, i) => {
      if (i < 4) e.hp = e.maxHp * 0.5;
      else if (i < 8) e.elite = true;
      else e.charged = true;
    });
    const before = [...run.enemies];
    for (let i = 0; i < 60 * 4; i++) updateSpawner(run, 1 / 60);
    expect(run.enemies).toHaveLength(12);
    run.enemies.forEach((e, i) => expect(e).toBe(before[i]));
    for (const e of run.enemies)
      expect(Math.hypot(e.x - run.player.x, e.y - run.player.y)).toBeLessThan(SPAWN_RING * 1.5);
  });

  it('is deterministic for a seed', () => {
    const ids = (): string[] => {
      const run = quietRun(13, 4 * 60);
      farZombies(run, 30);
      for (let i = 0; i < 60 * 4; i++) updateSpawner(run, 1 / 60);
      return run.enemies.map((e) => `${e.def.id}@${Math.round(e.x)},${Math.round(e.y)}`);
    };
    expect(ids()).toEqual(ids());
  });
});

describe('lesser Warden (audit item 5)', () => {
  it('is a mini-boss on the Warden pattern that never counts as the final boss', () => {
    const def = ENEMIES[WARDEN_ID];
    expect(def?.mini).toBe(true);
    expect(def?.boss).toBe('warden');
    expect(def?.weight).toBe(0); // never from the pool
    const run = new RunState(3);
    const e = makeEnemy(run, WARDEN_ID, 0, 0, false);
    expect(e?.boss).toBe('mini');
    // The final boss stays a boss.
    expect(makeEnemy(run, 'warden', 0, 0, false)?.boss).toBe('boss');
    // Much weaker than the final boss, in the range of the other mini-bosses.
    expect(def?.hp ?? 0).toBeLessThan(ENEMIES['warden']?.hp ?? 0);
    expect(def?.hp ?? 0).toBeLessThanOrEqual(500);
    expect(def?.dmg ?? 99).toBeLessThanOrEqual(26);
  });

  it('appears only after minute 9, at most one alive, far more often in the dark forest', () => {
    const count = (
      biome: BiomeId,
      seed: number,
    ): { spawns: number; maxAlive: number; first: number } => {
      const run = quietRun(seed, WARDEN_FROM - 120);
      run.startInBiome(biome);
      run.enemies.length = 0;
      let spawns = 0;
      let maxAlive = 0;
      let first = Infinity;
      const seen = new Set<number>();
      for (let i = 0; i < 60 * 60 * 6; i++) {
        run.time += 1 / 60;
        updateSpawner(run, 1 / 60);
        const alive = run.enemies.filter((e) => e.def.id === WARDEN_ID && !e.dying);
        maxAlive = Math.max(maxAlive, alive.length);
        for (const w of alive) {
          if (!seen.has(w.id)) {
            seen.add(w.id);
            spawns++;
            first = Math.min(first, run.time);
          }
        }
        // Let the player kill it now and then so the cap is exercised both ways.
        if (i % 3600 === 3599) for (const w of alive) killEnemy(run, w, true);
        run.enemies = run.enemies.filter((e) => !e.dying);
        run.player.hp = run.player.maxHp;
      }
      return { spawns, maxAlive, first };
    };
    let dark = 0;
    let plains = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const d = count('dark_forest', seed);
      const p = count('plains', seed);
      expect(d.maxAlive).toBeLessThanOrEqual(1);
      expect(p.maxAlive).toBeLessThanOrEqual(1);
      expect(d.first).toBeGreaterThanOrEqual(WARDEN_FROM);
      expect(p.first).toBeGreaterThanOrEqual(WARDEN_FROM);
      dark += d.spawns;
      plains += p.spawns;
    }
    expect(dark).toBeGreaterThan(plains);
    expect(plains).toBeGreaterThan(0);
  });

  it('never spawns before the start minute', () => {
    const run = quietRun(5, 0);
    for (let i = 0; i < 60 * 60 * 8; i++) {
      run.time += 1 / 60;
      updateSpawner(run, 1 / 60);
    }
    expect(run.enemies.some((e) => e.def.id === WARDEN_ID)).toBe(false);
  });

  it('has its art: the Warden sheet', () => {
    for (const a of ['idle', 'walk', 'attack', 'hurt', 'death'])
      expect(`${ENEMIES[WARDEN_ID]?.sprite}.${a}` in atlas.anims).toBe(true);
  });
});

describe('Magma Cube splitter (audit item 5)', () => {
  const kids = (run: RunState, id: string): string[] => {
    const e = makeEnemy(run, id, 0, 0, false);
    if (!e) throw new Error(`cannot make ${id}`);
    run.enemies = [e];
    killEnemy(run, e, true);
    return run.enemies.filter((x) => x !== e).map((x) => x.def.id);
  };

  it('splits Big > Medium > Small like the slimes, with a fire trail', () => {
    const run = new RunState(4);
    expect(kids(run, 'magma_cube_big')).toEqual(['magma_cube_medium', 'magma_cube_medium']);
    expect(kids(run, 'magma_cube_medium')).toEqual(['magma_cube_small', 'magma_cube_small']);
    expect(kids(run, 'magma_cube_small')).toEqual([]);
    for (const id of ['magma_cube_big', 'magma_cube_medium', 'magma_cube_small'])
      expect(ENEMIES[id]?.trail).toBe(true);
  });

  it('lives in the badlands (from minute 3) and, as a rift foe, in the Nether', () => {
    const big = ENEMIES['magma_cube_big'];
    expect(big?.biomes).toEqual(['badlands']);
    for (const b of OVERWORLD_BIOMES) {
      const ids = spawnPool(b, 6, false, false).map((e) => e.def.id);
      expect(ids.includes('magma_cube_big'), b).toBe(b === 'badlands');
    }
    expect(spawnPool('badlands', 2.5, false, false).map((e) => e.def.id)).not.toContain(
      'magma_cube_big',
    );
    expect(spawnPool('snowy_taiga', 12, false, false).map((e) => e.def.id)).not.toContain(
      'magma_cube_medium',
    );
  });

  it('a rift with Magma Cube foes is cleared only when every split-off cube is dead', () => {
    let found: RunState | null = null;
    for (let seed = 1; seed < 200 && !found; seed++) {
      const run = new RunState(seed, 10);
      run.rift.portal = { x: run.player.x + 2, y: run.player.y, left: 45 };
      run.update(1 / 60, {
        moveVector: () => ({ x: 0, y: 0 }),
        pausePressed: () => false,
        confirmPressed: () => false,
        cancelPressed: () => false,
        activePressed: () => false,
        endStep() {},
      });
      if (run.rift.active && run.rift.foes[0]?.def.id === 'magma_cube_big') found = run;
    }
    if (!found) throw new Error('no magma rift in 200 seeds');
    const run = found;
    expect(run.rift.foes).toHaveLength(2);
    for (const f of run.rift.foes) killEnemy(run, f, true);
    // The bigs are dead but their children are alive: the rift stays open.
    expect(run.enemies.some((e) => !e.dying && e.def.id === 'magma_cube_medium')).toBe(true);
    updateRift(run, 1 / 60);
    expect(run.rift.active).toBe(true);
    for (const e of run.enemies) killEnemy(run, e, false);
    updateRift(run, 1 / 60);
    expect(run.rift.active).toBe(false);
  });

  it('has its art (Medium sheet drawn larger for the Big)', () => {
    for (const id of ['magma_cube_big', 'magma_cube_medium', 'magma_cube_small'])
      expect(`${ENEMIES[id]?.sprite}.idle` in atlas.anims).toBe(true);
  });
});
