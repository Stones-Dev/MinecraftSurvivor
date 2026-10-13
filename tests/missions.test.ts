import { describe, expect, it } from 'vitest';
import { DRAGON_DEF } from '../src/entities/bossDragon';
import { defaultSave, type SaveData } from '../src/core/save';
import { HEROES } from '../src/data/companions';
import {
  ALL_MISSIONS,
  DAILY_MISSIONS,
  ENEMY_GROUPS,
  HERO_CLASSES,
  MISSION_BY_ID,
  WEEKLY_MISSIONS,
} from '../src/data/missions';
import { ENEMIES } from '../src/data/enemies';
import { ICON_NAMES } from '../src/ui/icons';
import {
  applyMetaToMissions,
  applyRunToMissions,
  claimMission,
  DAILY_COUNT,
  DAILY_REROLLS,
  dayNumber,
  ensureMissions,
  localDayKey,
  localWeekKey,
  missionPreview,
  missionsClaimable,
  missionViews,
  msUntilReset,
  rerollMission,
  rollMissionIds,
  runSample,
  WEEKLY_COUNT,
} from '../src/systems/missions';
import type { RunRecord } from '../src/systems/runStats';

/** A local-time timestamp (the tests must pass in any time zone). */
const at = (y: number, m: number, d: number, h = 12, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime();

function rec(over: Partial<RunRecord> = {}): RunRecord {
  return {
    hero: 'steve',
    timeSec: 300,
    kills: 200,
    level: 10,
    bosses: 1,
    minis: 1,
    won: false,
    damageDealt: 20000,
    damageTaken: 500,
    abilityCasts: 12,
    emeraldsPicked: 80,
    emeraldsEarned: 100,
    eggsFound: 1,
    rareEggsFound: 0,
    itemsFound: 1,
    itemsUsed: 1,
    trades: 0,
    rescues: 0,
    rifts: 0,
    armorTier: 1,
    swordTier: 1,
    killsByType: { zombie: 90, skeleton: 30, creeper: 20 },
    killsByBiome: { plains: 140 },
    timeByBiome: { plains: 200, forest: 60, desert: 40 },
    endedAt: at(2026, 10, 12, 12),
    ...over,
  };
}

const NOON = at(2026, 10, 12);

describe('mission data', () => {
  it('has ~24 daily and ~12 weekly templates with unique ids', () => {
    expect(DAILY_MISSIONS.length).toBeGreaterThanOrEqual(24);
    expect(WEEKLY_MISSIONS.length).toBe(13);
    expect(new Set(ALL_MISSIONS.map((m) => m.id)).size).toBe(ALL_MISSIONS.length);
    for (const m of ALL_MISSIONS) {
      expect(m.target).toBeGreaterThan(0);
      expect(Number.isInteger(m.target)).toBe(true);
      expect(ICON_NAMES).toContain(m.icon);
      const r = m.reward;
      expect((r.emeralds ?? 0) + (r.spawnEggs ?? 0) + (r.rareSpawnEggs ?? 0)).toBeGreaterThan(0);
      expect(m.id).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('weekly targets are bigger than their daily cousins and every kind matches its list', () => {
    for (const m of DAILY_MISSIONS) expect(m.kind).toBe('daily');
    for (const m of WEEKLY_MISSIONS) expect(m.kind).toBe('weekly');
    const d = MISSION_BY_ID.get('d_kills_400');
    const w = MISSION_BY_ID.get('w_kills_3000');
    expect(w?.target ?? 0).toBeGreaterThan(d?.target ?? 0);
  });

  it('only references enemies, heroes and biomes that exist', () => {
    for (const ids of Object.values(ENEMY_GROUPS))
      for (const id of ids) expect(ENEMIES[id]).toBeDefined();
    const heroIds = HEROES.map((h) => h.id);
    for (const h of [...HERO_CLASSES.ranged, ...HERO_CLASSES.melee]) expect(heroIds).toContain(h);
    for (const m of ALL_MISSIONS) {
      if (m.metric.startsWith('kills.') && !(m.metric.slice(6) in ENEMY_GROUPS)) {
        // The Ender Dragon is drawn by code and lives in entities/bossDragon.ts, not in the atlas-backed table.
        const id = m.metric.slice(6);
        expect(ENEMIES[id] ?? (id === DRAGON_DEF.id ? DRAGON_DEF : undefined)).toBeDefined();
      }
      for (const h of m.heroes ?? []) expect(heroIds).toContain(h);
    }
  });
});

describe('date keys (local time)', () => {
  it('uses the local calendar day, not UTC', () => {
    expect(localDayKey(at(2026, 10, 12, 0, 1))).toBe('2026-10-12');
    expect(localDayKey(at(2026, 10, 12, 23, 59))).toBe('2026-10-12');
    expect(localDayKey(at(2026, 1, 1, 0, 0))).toBe('2026-01-01');
  });

  it('uses ISO weeks that start on Monday', () => {
    expect(localWeekKey(at(2026, 10, 12))).toBe('2026-W42'); // Monday
    expect(localWeekKey(at(2026, 10, 18, 23, 59))).toBe('2026-W42'); // Sunday
    expect(localWeekKey(at(2026, 10, 19, 0, 0))).toBe('2026-W43');
    expect(localWeekKey(at(2026, 1, 1))).toBe('2026-W01');
    expect(localWeekKey(at(2027, 1, 1))).toBe('2026-W53'); // a Friday that belongs to the old ISO year
  });

  it('counts calendar days across month ends and leap days', () => {
    expect(dayNumber('2026-03-01') - dayNumber('2026-02-28')).toBe(1);
    expect(dayNumber('2028-03-01') - dayNumber('2028-02-28')).toBe(2);
    expect(Number.isNaN(dayNumber('garbage'))).toBe(true);
  });

  it('reset countdowns end at the next local midnight / Monday', () => {
    const ms = msUntilReset('daily', at(2026, 10, 12, 23, 0));
    expect(ms).toBeGreaterThan(59 * 60000);
    expect(ms).toBeLessThanOrEqual(61 * 60000);
    const w = msUntilReset('weekly', at(2026, 10, 18, 12, 0)); // Sunday noon
    expect(w).toBeGreaterThan(11 * 3600000);
    expect(w).toBeLessThan(13 * 3600000);
  });
});

describe('rolling', () => {
  it('is deterministic from the date key', () => {
    const owned = ['steve'];
    const a = rollMissionIds('daily', '2026-10-12', owned, 3);
    const b = rollMissionIds('daily', '2026-10-12', owned, 3);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    const other = rollMissionIds('daily', '2026-10-13', owned, 3);
    const days = Array.from({ length: 10 }, (_, i) =>
      rollMissionIds('daily', `2026-11-${String(i + 1).padStart(2, '0')}`, owned, 3).join(),
    );
    expect(new Set(days).size).toBeGreaterThan(5);
    expect(other).toHaveLength(3);
  });

  it('prefers three different kinds of mission', () => {
    for (let d = 1; d <= 28; d++) {
      const ids = rollMissionIds('daily', `2026-09-${String(d).padStart(2, '0')}`, ['steve'], 3);
      const metrics = ids.map((id) => MISSION_BY_ID.get(id)?.metric);
      expect(new Set(metrics).size).toBe(3);
    }
  });

  it('never rolls a class mission for a player without such a hero', () => {
    for (let d = 1; d <= 28; d++) {
      const ids = rollMissionIds('daily', `2026-09-${String(d).padStart(2, '0')}`, ['steve'], 3);
      for (const id of ids) {
        const heroes = MISSION_BY_ID.get(id)?.heroes;
        if (heroes) expect(heroes).toContain('steve');
      }
    }
    // A ranged hero can see ranged missions at least once in a month.
    const seen = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      for (const id of rollMissionIds(
        'daily',
        `2026-09-${String(d).padStart(2, '0')}`,
        ['alex'],
        3,
      ))
        seen.add(id);
    }
    expect(seen.has('d_ranged_5')).toBe(true);
  });

  it('gives every player the same missions on the same day', () => {
    const a = defaultSave(NOON);
    const b = defaultSave(NOON + 5000);
    ensureMissions(a, NOON);
    ensureMissions(b, NOON + 5000);
    expect(a.missions.daily.map((m) => m.id)).toEqual(b.missions.daily.map((m) => m.id));
    expect(a.missions.weekly.map((m) => m.id)).toEqual(b.missions.weekly.map((m) => m.id));
  });
});

describe('ensureMissions (rollover)', () => {
  it('rolls 3 daily + 2 weekly on first use and is idempotent', () => {
    const s = defaultSave(NOON);
    const r = ensureMissions(s, NOON);
    expect(r.changed).toBe(true);
    expect(s.missions.daily).toHaveLength(DAILY_COUNT);
    expect(s.missions.weekly).toHaveLength(WEEKLY_COUNT);
    expect(s.missions.day).toBe('2026-10-12');
    expect(s.missions.weekKey).toBe('2026-W42');
    expect(s.missions.rerollsLeft).toBe(DAILY_REROLLS);
    const snap = JSON.stringify(s.missions);
    expect(ensureMissions(s, NOON + 60000).changed).toBe(false);
    expect(JSON.stringify(s.missions)).toBe(snap);
  });

  it('keeps the set until local midnight and rolls right after it', () => {
    const s = defaultSave(NOON);
    ensureMissions(s, at(2026, 10, 12, 0, 1));
    const first = s.missions.daily.map((m) => m.id);
    ensureMissions(s, at(2026, 10, 12, 23, 59));
    expect(s.missions.daily.map((m) => m.id)).toEqual(first);
    const r = ensureMissions(s, at(2026, 10, 13, 0, 1));
    expect(r.dailyRolled).toBe(true);
    expect(r.weeklyRolled).toBe(false); // Tuesday is still the same ISO week
    expect(s.missions.day).toBe('2026-10-13');
    expect(s.missions.daily.every((m) => m.progress === 0 && !m.claimed)).toBe(true);
  });

  it('rolls the weekly set on Monday only, and refills the rerolls on a new day', () => {
    const s = defaultSave(NOON);
    ensureMissions(s, at(2026, 10, 18, 12));
    const weekly = s.missions.weekly.map((m) => m.id);
    s.missions.rerollsLeft = 0;
    const sun = ensureMissions(s, at(2026, 10, 18, 23, 59));
    expect(sun.weeklyRolled).toBe(false);
    const mon = ensureMissions(s, at(2026, 10, 19, 0, 5));
    expect(mon.weeklyRolled).toBe(true);
    expect(mon.dailyRolled).toBe(true);
    expect(s.missions.weekKey).toBe('2026-W43');
    expect(s.missions.weekly.map((m) => m.id)).not.toEqual(weekly);
    expect(s.missions.rerollsLeft).toBe(DAILY_REROLLS);
  });

  it('survives a year boundary', () => {
    const s = defaultSave(NOON);
    ensureMissions(s, at(2026, 12, 31, 23, 30));
    const r = ensureMissions(s, at(2027, 1, 1, 0, 30));
    expect(r.dailyRolled).toBe(true);
    expect(s.missions.day).toBe('2027-01-01');
  });

  it('auto-claims finished missions of an expired set instead of losing them', () => {
    const s = defaultSave(NOON);
    ensureMissions(s, NOON);
    const first = s.missions.daily[0];
    if (!first) throw new Error('no mission');
    const def = MISSION_BY_ID.get(first.id);
    first.progress = def?.target ?? 0;
    const before = s.currencies.emeralds;
    const r = ensureMissions(s, at(2026, 10, 14));
    expect(r.autoClaimed.emeralds ?? 0).toBe(def?.reward.emeralds ?? 0);
    expect(s.currencies.emeralds).toBe(before + (def?.reward.emeralds ?? 0));
    expect(s.stats.counters['missionsClaimed']).toBeGreaterThanOrEqual(1);
  });

  it('never rewinds when the clock goes back, and ignores absurd clocks', () => {
    const s = defaultSave(NOON);
    ensureMissions(s, at(2026, 10, 12));
    const snap = JSON.stringify(s.missions);
    ensureMissions(s, at(2026, 10, 10)); // two days back
    expect(JSON.stringify(s.missions)).toBe(snap);
    ensureMissions(s, 0); // unset clock
    ensureMissions(s, Number.NaN);
    ensureMissions(s, at(2150, 1, 1)); // absurd future
    expect(JSON.stringify(s.missions)).toBe(snap);
  });

  it('recovers from a stored day that is far in the future (a clock that was set ahead)', () => {
    const s = defaultSave(NOON);
    ensureMissions(s, NOON);
    s.missions.day = '2031-01-01';
    ensureMissions(s, NOON);
    expect(s.missions.day).toBe('2026-10-12');
  });
});

describe('tamper resistance', () => {
  it('drops unknown ids, duplicates and wrong-kind entries, then refills the set', () => {
    const s = defaultSave(NOON);
    s.missions = {
      day: '2026-10-12',
      weekKey: '2026-W42',
      daily: [
        { id: 'nope', progress: 5, claimed: false },
        { id: 'd_kills_150', progress: 1, claimed: false },
        { id: 'd_kills_150', progress: 99, claimed: true },
        { id: 'w_win', progress: 1, claimed: false }, // weekly id in the daily list
      ],
      weekly: [],
      rerollsLeft: 1,
    };
    ensureMissions(s, NOON);
    expect(s.missions.daily).toHaveLength(DAILY_COUNT);
    expect(s.missions.daily.map((m) => m.id)).toContain('d_kills_150');
    expect(s.missions.daily.every((m) => MISSION_BY_ID.get(m.id)?.kind === 'daily')).toBe(true);
    expect(new Set(s.missions.daily.map((m) => m.id)).size).toBe(DAILY_COUNT);
    expect(s.missions.weekly).toHaveLength(WEEKLY_COUNT);
  });

  it('clamps absurd progress to the target and never lets progress be negative or NaN', () => {
    const s = defaultSave(NOON);
    ensureMissions(s, NOON);
    const [a, b, c] = s.missions.daily;
    if (!a || !b || !c) throw new Error('missing');
    a.progress = 1e12;
    b.progress = -50;
    c.progress = Number.NaN;
    ensureMissions(s, NOON);
    const now = Object.fromEntries(s.missions.daily.map((m) => [m.id, m.progress]));
    expect(now[a.id]).toBe(MISSION_BY_ID.get(a.id)?.target);
    expect(now[b.id]).toBe(0);
    expect(now[c.id]).toBe(0);
  });

  it('a claimed flag implies completion; an incomplete mission cannot be claimed', () => {
    const s = defaultSave(NOON);
    ensureMissions(s, NOON);
    const e = s.missions.daily[0];
    if (!e) throw new Error('missing');
    const before = s.currencies.emeralds;
    expect(claimMission(s, 'daily', e.id)).toEqual({ ok: false, reason: 'not-done' });
    expect(claimMission(s, 'daily', 'nope')).toEqual({ ok: false, reason: 'unknown' });
    expect(claimMission(s, 'weekly', e.id)).toEqual({ ok: false, reason: 'unknown' });
    expect(s.currencies.emeralds).toBe(before);
  });

  it('ignores unknown metrics and non-finite samples when applying progress', () => {
    const s = defaultSave(NOON);
    ensureMissions(s, NOON);
    const moved = applyMetaToMissions(s, { bogus: 5, kills: Number.NaN, runs: -3 }, NOON);
    expect(moved).toEqual([]);
  });
});

describe('progress', () => {
  function withMissions(ids: string[], hero = 'steve'): SaveData {
    const s = defaultSave(NOON);
    ensureMissions(s, NOON);
    s.missions.daily = ids.map((id) => ({ id, progress: 0, claimed: false }));
    // Weekly missions that the sample runs below never touch.
    s.missions.weekly = ['w_win', 'w_trade_5'].map((id) => ({ id, progress: 0, claimed: false }));
    s.owned[hero] ??= { level: 1, shards: 0, obtainedAt: 0 };
    return s;
  }

  it('sums "slay N" missions over runs and takes the best run for "in one run" ones', () => {
    const s = withMissions(['d_kills_400', 'd_survive_8', 'd_emeralds_200']);
    applyRunToMissions(s, rec({ kills: 150, timeSec: 300, emeraldsPicked: 80 }), NOON);
    applyRunToMissions(s, rec({ kills: 150, timeSec: 200, emeraldsPicked: 80 }), NOON);
    const v = Object.fromEntries(missionViews(s, 'daily').map((m) => [m.def.id, m.progress]));
    expect(v['d_kills_400']).toBe(300);
    expect(v['d_survive_8']).toBe(300); // best, not 500
    expect(v['d_emeralds_200']).toBe(160);
  });

  it('caps at the target and reports the moment of completion once', () => {
    const s = withMissions(['d_kills_150']);
    const first = applyRunToMissions(s, rec({ kills: 100 }), NOON);
    expect(first[0]).toMatchObject({ before: 0, after: 100, completedNow: false });
    const second = applyRunToMissions(s, rec({ kills: 500 }), NOON);
    expect(second[0]).toMatchObject({ before: 100, after: 150, target: 150, completedNow: true });
    expect(applyRunToMissions(s, rec({ kills: 500 }), NOON)).toEqual([]);
    expect(missionViews(s, 'daily')[0]?.progress).toBe(150);
  });

  it('counts groups, biomes and the biome-visit metric from a run', () => {
    const sample = runSample(rec());
    expect(sample['kills.undead']).toBe(120); // zombie + skeleton
    expect(sample['kills.creeper']).toBe(20);
    expect(sample['sec.desert']).toBe(40);
    expect(sample['biomes']).toBe(3);
    expect(sample['runs']).toBe(1);
    expect(sample['wins']).toBe(0);
    expect(runSample(rec({ won: true }))['wins']).toBe(1);
    // Passing through a biome for a few seconds is not a visit.
    expect(runSample(rec({ timeByBiome: { plains: 100, desert: 3 } }))['biomes']).toBe(1);
  });

  it('class missions only count runs played with a matching hero', () => {
    const s = withMissions(['d_ranged_5'], 'alex');
    const only = <T extends { id: string }>(c: T[]): T[] => c.filter((m) => m.id === 'd_ranged_5');
    expect(only(applyRunToMissions(s, rec({ hero: 'steve', timeSec: 400 }), NOON))).toEqual([]);
    const moved = only(applyRunToMissions(s, rec({ hero: 'alex', timeSec: 400 }), NOON));
    expect(moved[0]?.completedNow).toBe(true);
  });

  it('meta events (eggs opened) advance matching missions', () => {
    const s = withMissions(['d_eggs_3']);
    const moved = applyMetaToMissions(s, { eggsOpened: 2 }, NOON);
    expect(moved[0]).toMatchObject({ before: 0, after: 2 });
  });

  it('previews without mutating the save', () => {
    const s = withMissions(['d_kills_150']);
    const before = JSON.stringify(s.missions);
    const p = missionPreview(s, rec({ kills: 90 }));
    expect(p.find((x) => x.def.id === 'd_kills_150')?.projected).toBe(90);
    expect(JSON.stringify(s.missions)).toBe(before);
  });
});

describe('claim and reroll', () => {
  function done(): { s: SaveData; id: string } {
    const s = defaultSave(NOON);
    ensureMissions(s, NOON);
    const e = s.missions.daily[0];
    if (!e) throw new Error('missing');
    e.progress = MISSION_BY_ID.get(e.id)?.target ?? 0;
    return { s, id: e.id };
  }

  it('claims once: the reward is granted a single time', () => {
    const { s, id } = done();
    const reward = MISSION_BY_ID.get(id)?.reward ?? {};
    const em = s.currencies.emeralds;
    const eggs = s.currencies.spawnEggs;
    expect(missionsClaimable(s, NOON)).toBeGreaterThanOrEqual(1);
    const r1 = claimMission(s, 'daily', id);
    expect(r1.ok).toBe(true);
    expect(s.currencies.emeralds).toBe(em + (reward.emeralds ?? 0));
    expect(s.currencies.spawnEggs).toBe(eggs + (reward.spawnEggs ?? 0));
    const r2 = claimMission(s, 'daily', id);
    expect(r2).toEqual({ ok: false, reason: 'claimed' });
    expect(s.currencies.emeralds).toBe(em + (reward.emeralds ?? 0));
    expect(s.stats.counters['missionsClaimed']).toBe(1);
  });

  it('missionsClaimable counts finished unclaimed missions and the login reward', () => {
    const s = defaultSave(NOON);
    ensureMissions(s, NOON);
    expect(missionsClaimable(s, NOON)).toBe(1); // only today's login reward
    s.dailyReward = { lastClaimDay: '2026-10-12', streak: 1 };
    expect(missionsClaimable(s, NOON)).toBe(0);
    const e = s.missions.weekly[0];
    if (!e) throw new Error('missing');
    e.progress = MISSION_BY_ID.get(e.id)?.target ?? 0;
    expect(missionsClaimable(s, NOON)).toBe(1);
    claimMission(s, 'weekly', e.id);
    expect(missionsClaimable(s, NOON)).toBe(0);
  });

  it('rerolls an unfinished mission, deterministically, using up the allowance', () => {
    const make = (): SaveData => {
      const s = defaultSave(NOON);
      ensureMissions(s, NOON);
      return s;
    };
    const a = make();
    const b = make();
    const id = a.missions.daily[1]?.id ?? '';
    expect(rerollMission(a, 'daily', id)).toBe(true);
    expect(rerollMission(b, 'daily', id)).toBe(true);
    expect(a.missions.daily.map((m) => m.id)).toEqual(b.missions.daily.map((m) => m.id));
    expect(a.missions.daily[1]?.id).not.toBe(id);
    expect(a.missions.daily[1]?.progress).toBe(0);
    expect(new Set(a.missions.daily.map((m) => m.id)).size).toBe(DAILY_COUNT);
    expect(a.missions.rerollsLeft).toBe(DAILY_REROLLS - 1);
    const id2 = a.missions.daily[2]?.id ?? '';
    expect(rerollMission(a, 'daily', id2)).toBe(true);
    expect(a.missions.rerollsLeft).toBe(0);
    expect(rerollMission(a, 'daily', a.missions.daily[0]?.id ?? '')).toBe(false);
  });

  it('cannot reroll finished, claimed or unknown missions', () => {
    const { s, id } = done();
    expect(rerollMission(s, 'daily', id)).toBe(false);
    expect(rerollMission(s, 'daily', 'nope')).toBe(false);
    expect(rerollMission(s, 'weekly', id)).toBe(false);
    expect(s.missions.rerollsLeft).toBe(DAILY_REROLLS);
  });
});
