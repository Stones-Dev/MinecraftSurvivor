import { describe, expect, it } from 'vitest';
import type { InputSource } from '../src/core/input';
import { defaultSave, MAX_COUNT, MAX_SECONDS, tryMigrate } from '../src/core/save';
import { RunState } from '../src/game';
import { makeEnemy } from '../src/systems/spawner';
import { damageEnemy, hurtPlayer } from '../src/systems/combat';
import { runReward, runRewardBreakdown } from '../src/systems/economy';
import { finishRun } from '../src/systems/runEnd';
import {
  biomesVisited,
  bumpCounter,
  maxCounter,
  mergeRunIntoSave,
  RunStats,
  type RunLike,
  type RunRecord,
} from '../src/systems/runStats';
import { syncMeta } from '../src/systems/metaSync';
import { missionViews } from '../src/systems/missions';

const NOW = new Date(2026, 9, 12, 12).getTime();

class Still implements InputSource {
  moveVector(): { x: number; y: number } {
    return { x: 0, y: 0 };
  }
  pausePressed(): boolean {
    return false;
  }
  confirmPressed(): boolean {
    return false;
  }
  cancelPressed(): boolean {
    return false;
  }
  activePressed(): boolean {
    return false;
  }
  endStep(): void {}
}

function fake(over: Partial<RunLike> = {}): RunLike {
  return {
    time: 120,
    kills: 40,
    level: 6,
    bossKills: 0,
    miniKills: 0,
    won: false,
    spawnEggs: 1,
    rareSpawnEggs: 0,
    emeraldsPicked: 30,
    armorTier: 1,
    swordTier: 1,
    item: null,
    ability: { castCount: 4 },
    rift: { active: false },
    loadout: { hero: 'steve' },
    biome: () => 'plains',
    ...over,
  };
}

function rec(over: Partial<RunRecord> = {}): RunRecord {
  const st = new RunStats();
  st.kill('zombie', 'plains');
  st.kill('zombie', 'plains');
  st.kill('creeper', 'forest');
  st.damageDealt = 1234.6;
  st.damageTaken = 55.2;
  st.timeByBiome = { plains: 90, forest: 30 };
  return { ...st.snapshot(fake(), NOW), ...over };
}

describe('RunStats tracker', () => {
  it('counts kills by type and biome, damage and time per biome', () => {
    const st = new RunStats();
    st.kill('zombie', 'plains');
    st.kill('zombie', 'desert');
    st.kill('creeper', 'desert');
    expect(st.killsByType).toEqual({ zombie: 2, creeper: 1 });
    expect(st.killsByBiome).toEqual({ plains: 1, desert: 2 });
    let biome = 'plains';
    const run = fake({ biome: () => biome });
    st.tick(run, 1);
    st.tick(run, 1);
    biome = 'desert';
    st.tick(run, 0.5);
    expect(st.timeByBiome['plains']).toBe(2);
    expect(st.timeByBiome['desert']).toBe(0.5);
  });

  it('counts rift entries once per visit and items when a new one is picked up', () => {
    const st = new RunStats();
    const run = fake();
    st.tick(run, 0.1);
    run.rift.active = true;
    st.tick(run, 0.1);
    st.tick(run, 0.1);
    run.rift.active = false;
    st.tick(run, 0.1);
    run.rift.active = true;
    st.tick(run, 0.1);
    expect(st.rifts).toBe(2);
    run.item = 'totem';
    st.tick(run, 0.1);
    st.tick(run, 0.1);
    run.item = null;
    st.tick(run, 0.1);
    run.item = 'totem';
    st.tick(run, 0.1);
    expect(st.itemsFound).toBe(2);
  });

  it('snapshots a run into a record', () => {
    const st = new RunStats();
    st.damageDealt = 99.6;
    st.trades = 2;
    st.rescues = 1;
    const r = st.snapshot(fake({ won: true, bossKills: 2, miniKills: 3 }), NOW);
    expect(r).toMatchObject({
      hero: 'steve',
      timeSec: 120,
      kills: 40,
      level: 6,
      bosses: 2,
      minis: 3,
      won: true,
      damageDealt: 100,
      abilityCasts: 4,
      eggsFound: 1,
      trades: 2,
      rescues: 1,
      endedAt: NOW,
    });
  });

  it('lists a biome as visited only after a few seconds', () => {
    expect(biomesVisited({ plains: 100, desert: 2, jungle: 8 }).sort()).toEqual([
      'jungle',
      'plains',
    ]);
  });
});

describe('RunState integration', () => {
  it('records time per biome, kills, damage dealt and taken in a real run', () => {
    const run = new RunState(11);
    const input = new Still();
    for (let i = 0; i < 120; i++) run.update(1 / 60, input);
    const total = Object.values(run.stats.timeByBiome).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(run.time, 1);

    const e = makeEnemy(run, 'zombie', 0, 0, false);
    expect(e).not.toBeNull();
    if (!e) return;
    run.enemies.push(e);
    const hp = e.hp;
    damageEnemy(run, e, 5, 0, 0, 0);
    expect(run.stats.damageDealt).toBeCloseTo(5);
    damageEnemy(run, e, 9999, 0, 0, 0);
    // Overkill is not counted: at most the HP that was left.
    expect(run.stats.damageDealt).toBeCloseTo(hp, 3);
    expect(run.kills).toBe(1);
    expect(run.stats.killsByType['zombie']).toBe(1);

    run.player.iframes = 0;
    const dealt = hurtPlayer(run, 10);
    expect(dealt).toBeGreaterThan(0);
    expect(run.stats.damageTaken).toBe(dealt);
  });

  it('snapshots a RunState', () => {
    const run = new RunState(5);
    const r = run.stats.snapshot(run, NOW);
    expect(r.hero).toBe(run.loadout.hero);
    expect(r.timeSec).toBe(0);
  });
});

describe('counters', () => {
  it('rejects bad keys, non-positive and non-finite values, and caps at MAX_COUNT', () => {
    const s = defaultSave(NOW);
    bumpCounter(s, 'ok.key', 5);
    bumpCounter(s, 'ok.key', 2.9);
    bumpCounter(s, 'bad key!', 5);
    bumpCounter(s, '__proto__', 5);
    bumpCounter(s, 'neg', -1);
    bumpCounter(s, 'nan', Number.NaN);
    bumpCounter(s, 'inf', Number.POSITIVE_INFINITY);
    bumpCounter(s, 'x'.repeat(65), 1);
    expect(s.stats.counters).toEqual({ 'ok.key': 7 });
    bumpCounter(s, 'ok.key', 1e99);
    expect(s.stats.counters['ok.key']).toBe(MAX_COUNT);
    maxCounter(s, 'best.x', 4);
    maxCounter(s, 'best.x', 2);
    expect(s.stats.counters['best.x']).toBe(4);
  });

  it('stops adding new keys when the table is full but keeps updating existing ones', () => {
    const s = defaultSave(NOW);
    for (let i = 0; i < 600; i++) bumpCounter(s, `k${i}`, 1);
    expect(Object.keys(s.stats.counters).length).toBeLessThanOrEqual(480);
    bumpCounter(s, 'k0', 1);
    expect(s.stats.counters['k0']).toBe(2);
  });

  it('the save sanitizer keeps clean counters and drops unsafe ones', () => {
    const raw = JSON.parse(JSON.stringify(defaultSave(NOW)));
    raw.stats.counters = { fine: 3, huge: 1e99, neg: -4, str: 'x', 'bad key': 1, constructor: 9 };
    const s = tryMigrate(raw);
    expect(s?.stats.counters['fine']).toBe(3);
    expect(s?.stats.counters['huge']).toBe(MAX_COUNT);
    expect(s?.stats.counters['neg']).toBe(0);
    expect(s?.stats.counters['str']).toBe(0);
    expect(Object.keys(s?.stats.counters ?? {})).not.toContain('bad key');
    expect(Object.keys(s?.stats.counters ?? {})).not.toContain('constructor');
  });
});

describe('mergeRunIntoSave', () => {
  it('adds the run to lifetime stats, per-hero bests, records and counters', () => {
    const s = defaultSave(NOW);
    const m1 = mergeRunIntoSave(
      s,
      rec({ timeSec: 200.7, kills: 80, level: 9, bosses: 1, minis: 2, won: true }),
    );
    expect(m1).toEqual({ newBestTime: true, newBestKills: true });
    expect(s.stats).toMatchObject({
      runs: 1,
      wins: 1,
      kills: 80,
      bosses: 1,
      minis: 2,
      bestTimeSec: 200,
      bestKills: 80,
    });
    expect(s.stats.playSeconds).toBeCloseTo(200.7);
    expect(s.stats.perHero['steve']).toEqual({ runs: 1, bestTimeSec: 200, bestKills: 80 });
    expect(s.records).toMatchObject({ runs: 1, wins: 1, bestTimeSec: 200, bestKills: 80 });
    expect(s.stats.counters).toMatchObject({
      'kills.zombie': 2,
      'kills.creeper': 1,
      'sec.plains': 90,
      damageDealt: 1235,
      damageTaken: 55,
      abilityCasts: 4,
      'wins.steve': 1,
      'best.level': 9,
    });
    const m2 = mergeRunIntoSave(s, rec({ timeSec: 100, kills: 30, level: 4 }));
    expect(m2).toEqual({ newBestTime: false, newBestKills: false });
    expect(s.stats.bestTimeSec).toBe(200);
    expect(s.stats.runs).toBe(2);
    expect(s.stats.perHero['steve']?.runs).toBe(2);
    expect(s.stats.counters['best.level']).toBe(9); // a best, not a sum
    expect(s.stats.counters['kills.zombie']).toBe(4);
  });

  it('keeps a separate record per hero', () => {
    const s = defaultSave(NOW);
    mergeRunIntoSave(s, rec({ hero: 'alex', timeSec: 400, kills: 10 }));
    mergeRunIntoSave(s, rec({ hero: 'steve', timeSec: 100, kills: 90 }));
    expect(s.stats.perHero['alex']).toEqual({ runs: 1, bestTimeSec: 400, bestKills: 10 });
    expect(s.stats.perHero['steve']).toEqual({ runs: 1, bestTimeSec: 100, bestKills: 90 });
  });

  it('clamps everything below MAX_COUNT / MAX_SECONDS even with absurd inputs', () => {
    const s = defaultSave(NOW);
    s.stats.kills = MAX_COUNT - 5;
    s.stats.playSeconds = MAX_SECONDS - 1;
    mergeRunIntoSave(s, rec({ kills: 1e15, timeSec: 1e12, damageDealt: 1e15 }));
    expect(s.stats.kills).toBe(MAX_COUNT);
    expect(s.stats.playSeconds).toBe(MAX_SECONDS);
    expect(s.stats.bestTimeSec).toBeLessThanOrEqual(MAX_SECONDS);
    expect(s.stats.bestKills).toBe(MAX_COUNT);
    expect(s.stats.counters['damageDealt']).toBe(MAX_COUNT);
    expect(s.stats.perHero['steve']?.bestTimeSec).toBeLessThanOrEqual(MAX_SECONDS);
  });
});

describe('finishRun', () => {
  const summary = { timeSec: 300, kills: 200, bosses: 1, miniBosses: 0, picked: 50 };

  it('pays the run out and records stats, missions and achievements in one go', () => {
    const s = defaultSave(NOW);
    const earned = runReward(summary);
    const em = s.currencies.emeralds;
    const out = finishRun(
      s,
      rec({ eggsFound: 2, rareEggsFound: 1, timeSec: 300, kills: 200 }),
      earned,
      NOW,
    );
    expect(out.earned).toBe(earned);
    expect(s.currencies.emeralds).toBeGreaterThanOrEqual(em + earned);
    expect(s.currencies.spawnEggs).toBeGreaterThanOrEqual(2);
    expect(s.currencies.rareSpawnEggs).toBe(1);
    expect(s.flags.tutorialDone).toBe(true);
    expect(s.stats.runs).toBe(1);
    expect(s.stats.emeraldsEarned).toBe(earned);
    expect(out.newBestTime).toBe(true);
    expect(out.unlocked.map((a) => a.id)).toEqual(
      expect.arrayContaining(['first_blood', 'dawn_patrol']),
    );
    expect(s.missions.daily).toHaveLength(3);
    expect(missionViews(s, 'daily').length).toBe(3);
  });

  it('a second run only adds its own numbers', () => {
    const s = defaultSave(NOW);
    finishRun(s, rec(), 100, NOW);
    const before = s.stats.runs;
    const out = finishRun(s, rec(), 100, NOW + 60000);
    expect(s.stats.runs).toBe(before + 1);
    expect(out.unlocked.map((a) => a.id)).not.toContain('first_blood'); // already earned
  });
});

describe('economy breakdown', () => {
  it('sums to the run reward', () => {
    for (const mult of [1, 1.15, 1.5]) {
      const sum = { timeSec: 437, kills: 311, bosses: 2, miniBosses: 3, picked: 77 };
      const b = runRewardBreakdown(sum, mult);
      expect(b.total).toBe(runReward(sum, mult));
      expect(b.time + b.kills + b.bosses + b.miniBosses + b.picked + b.bonus).toBe(b.total);
    }
  });
});

describe('syncMeta', () => {
  it('first sync only records the baseline; later growth in eggs opened advances missions', () => {
    const s = defaultSave(NOW);
    s.pullCount = 4;
    const first = syncMeta(s, NOW);
    expect(first.missions).toEqual([]);
    expect(s.stats.counters['seen.eggs']).toBe(4);
    s.missions.daily = [
      { id: 'd_eggs_3', progress: 0, claimed: false },
      { id: 'd_kills_150', progress: 0, claimed: false },
      { id: 'd_level_12', progress: 0, claimed: false },
    ];
    s.pullCount = 6;
    const second = syncMeta(s, NOW);
    expect(second.missions.find((m) => m.id === 'd_eggs_3')).toMatchObject({ before: 0, after: 2 });
    expect(first.unlocked.map((a) => a.id)).toContain('first_egg'); // 4 pulls already made
    expect(second.changed).toBe(true);
    const third = syncMeta(s, NOW);
    expect(third.changed).toBe(false);
    expect(third.unlocked).toEqual([]);
  });
});
