import { describe, expect, it } from 'vitest';
import { defaultSave, tryMigrate, type SaveData } from '../src/core/save';
import { ACHIEVEMENT_BY_ID, ACHIEVEMENT_CATEGORIES, ACHIEVEMENTS } from '../src/data/achievements';
import { COMPANIONS, HEROES } from '../src/data/companions';
import {
  achievementCounts,
  achievementProgress,
  achievementsUnlockable,
  evaluateAchievements,
  isUnlocked,
} from '../src/systems/achievements';
import type { RunRecord } from '../src/systems/runStats';
import { ICON_NAMES } from '../src/ui/icons';

const NOW = new Date(2026, 9, 12, 12).getTime();

function run(over: Partial<RunRecord> = {}): RunRecord {
  return {
    hero: 'steve',
    timeSec: 100,
    kills: 50,
    level: 5,
    bosses: 0,
    minis: 0,
    won: false,
    damageDealt: 1000,
    damageTaken: 100,
    abilityCasts: 1,
    emeraldsPicked: 10,
    emeraldsEarned: 30,
    eggsFound: 0,
    rareEggsFound: 0,
    itemsFound: 0,
    itemsUsed: 0,
    trades: 0,
    rescues: 0,
    rifts: 0,
    armorTier: 1,
    swordTier: 1,
    killsByType: {},
    killsByBiome: {},
    timeByBiome: {},
    endedAt: new Date(2026, 9, 12, 12).getTime(),
    ...over,
  };
}

describe('achievement catalogue', () => {
  it('has around forty-plus achievements with unique ids, valid icons and every category', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    // Player-facing names are unique too (the raid buff achievement is 'Village Defender', the escort one 'Hero of the Village').
    expect(new Set(ACHIEVEMENTS.map((a) => a.name)).size).toBe(ACHIEVEMENTS.length);
    const cats = new Set(ACHIEVEMENTS.map((a) => a.cat));
    for (const c of ACHIEVEMENT_CATEGORIES) expect(cats.has(c.id)).toBe(true);
    for (const a of ACHIEVEMENTS) {
      expect(ICON_NAMES).toContain(a.icon);
      expect(a.id).toMatch(/^[a-z0-9_]+$/);
      expect(a.name.length).toBeGreaterThan(2);
      expect(a.desc.length).toBeGreaterThan(5);
      expect(a.goal).toBeGreaterThan(0);
      if (a.reward) {
        expect(
          (a.reward.emeralds ?? 0) + (a.reward.spawnEggs ?? 0) + (a.reward.rareSpawnEggs ?? 0),
        ).toBeGreaterThan(0);
      }
    }
    expect(ACHIEVEMENTS.filter((a) => a.hidden).length).toBeGreaterThanOrEqual(5);
    // Hidden ones live in Secrets, and Secrets are hidden.
    for (const a of ACHIEVEMENTS) expect(!!a.hidden).toBe(a.cat === 'secrets');
  });

  it('counts completion goals from the real rosters', () => {
    expect(ACHIEVEMENT_BY_ID.get('completionist')?.goal).toBe(COMPANIONS.length);
    expect(ACHIEVEMENT_BY_ID.get('full_roster')?.goal).toBe(HEROES.length);
  });

  it('a fresh save starts with nothing earned (or in reach of the starter hero)', () => {
    const s = defaultSave(NOW);
    expect(evaluateAchievements(s, NOW)).toEqual([]);
    expect(achievementCounts(s)).toEqual({ unlocked: 0, total: ACHIEVEMENTS.length });
  });
});

describe('evaluateAchievements', () => {
  it('unlocks from lifetime stats once, grants the reward once, and is idempotent', () => {
    const s = defaultSave(NOW);
    s.stats.kills = 1200;
    const em = s.currencies.emeralds;
    const first = evaluateAchievements(s, NOW);
    const ids = first.map((a) => a.id);
    expect(ids).toContain('first_blood');
    expect(ids).toContain('mob_hunter');
    expect(ids).not.toContain('exterminator');
    expect(s.achievements['mob_hunter']).toEqual({ at: NOW });
    expect(s.currencies.emeralds).toBe(em + 20 + 60);
    expect(evaluateAchievements(s, NOW + 1000)).toEqual([]);
    expect(s.achievements['mob_hunter']?.at).toBe(NOW); // the unlock time never changes
    expect(s.currencies.emeralds).toBe(em + 80);
  });

  it('grants egg rewards to the wallet', () => {
    const s = defaultSave(NOW);
    const eggs = s.currencies.spawnEggs; // the 5 starter eggs of a new save
    s.stats.kills = 10000;
    evaluateAchievements(s, NOW);
    expect(s.currencies.spawnEggs).toBe(eggs + 1); // Exterminator
  });

  it('reads best time, wins and counters', () => {
    const s = defaultSave(NOW);
    s.stats.bestTimeSec = 640;
    s.stats.wins = 1;
    s.stats.counters['rifts'] = 3;
    s.stats.counters['kills.creeper'] = 100;
    const ids = evaluateAchievements(s, NOW).map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'dawn_patrol',
        'long_night',
        'night_survived',
        'into_the_fire',
        'creeper_nope',
      ]),
    );
    expect(ids).not.toContain('endless_night');
    expect(ids).not.toContain('rift_runner');
  });

  it('collection achievements follow what is owned and the eggs opened (stat or pull counter)', () => {
    const s = defaultSave(NOW);
    s.pullCount = 60;
    s.owned['alex'] = { level: 1, shards: 0, obtainedAt: 0 };
    s.owned['wolf'] = { level: 5, shards: 0, obtainedAt: 0 };
    const ids = evaluateAchievements(s, NOW).map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining(['first_egg', 'egg_hunter', 'legend', 'fully_grown']),
    );
    expect(ids).not.toContain('spawner_addict');
  });

  it('economy achievements read upgrades and the daily streak', () => {
    const s = defaultSave(NOW);
    s.upgrades['steve'] = { vitality: 8, strength: 2 };
    s.dailyReward = { lastClaimDay: '2026-10-12', streak: 7 };
    const ids = evaluateAchievements(s, NOW).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['investor', 'maxed_out', 'loyal_customer']));
    expect(ids).not.toContain('magnate');
  });

  it('unknown upgrade ids and unknown stored achievements are ignored', () => {
    const s = defaultSave(NOW);
    s.upgrades['steve'] = { not_a_real_upgrade: 99 };
    s.achievements['made_up'] = { at: 5 };
    evaluateAchievements(s, NOW);
    expect(s.achievements['maxed_out']).toBeUndefined();
    expect(isUnlocked(s, 'made_up')).toBe(false);
    expect(achievementCounts(s).unlocked).toBe(0);
  });

  it('run-only secrets need the run that just ended', () => {
    const s = defaultSave(NOW);
    expect(evaluateAchievements(s, NOW, null).map((a) => a.id)).not.toContain('untouchable');
    const got = evaluateAchievements(s, NOW, run({ timeSec: 200, damageTaken: 0 })).map(
      (a) => a.id,
    );
    expect(got).toContain('untouchable');
    expect(got).not.toContain('bare_bones'); // armor tier 1
    const bare = evaluateAchievements(s, NOW, run({ timeSec: 301, armorTier: 0 })).map((a) => a.id);
    expect(bare).toContain('bare_bones');
    const fast = evaluateAchievements(s, NOW, run({ won: true, timeSec: 930 })).map((a) => a.id);
    expect(fast).toContain('speed_demon');
  });

  it('the night owl reads the local hour of the run end', () => {
    const s = defaultSave(NOW);
    const noon = evaluateAchievements(
      s,
      NOW,
      run({ endedAt: new Date(2026, 9, 12, 12).getTime() }),
    );
    expect(noon.map((a) => a.id)).not.toContain('night_owl');
    const night = evaluateAchievements(
      s,
      NOW,
      run({ endedAt: new Date(2026, 9, 12, 3, 30).getTime() }),
    );
    expect(night.map((a) => a.id)).toContain('night_owl');
  });

  it('the emerald hoard secret chains off other rewards without looping forever', () => {
    const s = defaultSave(NOW);
    s.currencies.emeralds = 99990;
    s.stats.kills = 1; // First Blood pays 20, then Scrooge unlocks on the next pass
    const ids = evaluateAchievements(s, NOW).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['first_blood', 'scrooge']));
  });
});

describe('progress helpers', () => {
  it('caps progress at the goal and flags hidden ones', () => {
    const s = defaultSave(NOW);
    s.stats.kills = 500;
    const p = achievementProgress(s, 'combat');
    const hunter = p.find((x) => x.def.id === 'mob_hunter');
    expect(hunter).toMatchObject({ unlocked: false, cur: 500 });
    s.stats.kills = 1e9;
    expect(achievementProgress(s, 'combat').find((x) => x.def.id === 'exterminator')?.cur).toBe(
      10000,
    );
    expect(achievementProgress(s, 'secrets').every((x) => x.def.hidden)).toBe(true);
  });

  it('achievementsUnlockable counts met-but-not-unlocked conditions, 0 after evaluation', () => {
    const s: SaveData = defaultSave(NOW);
    s.stats.kills = 1000;
    expect(achievementsUnlockable(s)).toBe(2);
    evaluateAchievements(s, NOW);
    expect(achievementsUnlockable(s)).toBe(0);
  });

  it('survives a save round-trip (counters and unlock times are kept)', () => {
    const s = defaultSave(NOW);
    s.stats.kills = 1000;
    s.stats.counters['kills.creeper'] = 7;
    evaluateAchievements(s, NOW);
    const back = tryMigrate(JSON.parse(JSON.stringify(s)));
    expect(back?.achievements['mob_hunter']).toEqual({ at: NOW });
    expect(back?.stats.counters['kills.creeper']).toBe(7);
  });
});
