import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  defaultSave,
  LocalSaveStore,
  MAX_COUNT,
  migrate,
  SAVE_VERSION,
  summarizeSave,
  tryMigrate,
} from '../src/core/save';
import { loadoutFromSave } from '../src/systems/meta';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('save v2 migration', () => {
  it('is version 2 with safe defaults for every new field', () => {
    const d = defaultSave(1000);
    expect(SAVE_VERSION).toBe(2);
    expect(d.lastModified).toBe(1000);
    expect(d.profile).toEqual({ id: expect.any(String), name: '', avatar: 'steve' });
    expect(d.stats.perHero).toEqual({});
    expect(d.achievements).toEqual({});
    expect(d.missions).toEqual({ day: '', weekKey: '', daily: [], weekly: [], rerollsLeft: 0 });
    expect(d.dailyReward).toEqual({ lastClaimDay: '', streak: 0 });
    expect(d.cloud).toEqual({ uid: null, rev: 0, lastSyncedAt: 0 });
    expect(d.settings.accessibility).toEqual({
      colorblind: 'off',
      textScale: 1,
      reduceFlash: false,
      touchControls: 'auto',
    });
    expect(d.settings.cameraLead).toBe(false);
    expect(defaultSave(1000)).toEqual(d); // deterministic
    expect(migrate(JSON.parse(JSON.stringify(d)))).toEqual(d); // fixed point
  });

  it('migrates the v0 prototype save into stats', () => {
    const s = migrate(fixture('save-v0.json'));
    expect(s.saveVersion).toBe(2);
    expect(s.stats.bestTimeSec).toBe(251);
    expect(s.stats.bestKills).toBe(120);
    expect(s.records.bestTimeSec).toBe(251);
    expect(s.lastModified).toBe(1700000000000);
    expect(s.currencies.emeralds).toBe(345);
  });

  it('migrates an early v1 save', () => {
    const s = migrate(fixture('save-v1-early.json'));
    expect(s.stats).toMatchObject({ runs: 7, wins: 1, bestTimeSec: 500, bestKills: 300 });
    expect(s.records).toEqual({ bestTimeSec: 500, bestKills: 300, wins: 1, runs: 7 });
    expect(s.profile.avatar).toBe('steve');
    expect(s.lastModified).toBe(1700000100000);
    expect(s.settings.accessibility.colorblind).toBe('off');
  });

  it('migrates a late v1 save keeping all progress and settings', () => {
    const s = migrate(fixture('save-v1-late.json'));
    expect(s.pullCount).toBe(47);
    expect(s.currencies.emeralds).toBe(12840);
    expect(Object.keys(s.owned)).toHaveLength(6);
    expect(s.loadout).toEqual({ hero: 'alex', pet: 'cat', allies: ['wolf', 'iron_golem'] });
    expect(s.upgrades['account']).toEqual({ leadership: 1, kennel: 2 });
    expect(s.stats).toMatchObject({ runs: 58, wins: 2, bestTimeSec: 1023.6, bestKills: 2410 });
    expect(s.profile.avatar).toBe('alex'); // the hero they play
    expect(s.settings).toMatchObject({
      musicVolume: 0.45,
      damageNumbers: false,
      showFps: true,
      quality: 'medium',
      controls: { up: ['KeyZ', 'ArrowUp'], item: ['KeyE'] },
    });
    expect(s.flags.tutorialDone).toBe(true);
    expect(loadoutFromSave(s).hero).toBe('alex');
    const sum = summarizeSave(s);
    expect(sum).toMatchObject({ runs: 58, owned: 6, emeralds: 12840 });
    expect(sum.progress).toBe(58 + 47 + 5);
  });

  it('round-trips a migrated save through the store unchanged', () => {
    const store = new LocalSaveStore(null);
    const imported = store.import(JSON.stringify(fixture('save-v1-late.json')));
    expect(new LocalSaveStore(null).import(store.export())).toEqual(imported);
  });
});

describe('save v2 sanitize hardening', () => {
  it('drops mistyped v2 fields to defaults', () => {
    const s = migrate({
      saveVersion: 2,
      lastModified: 'yesterday',
      profile: { id: 7, name: ['x'], avatar: 'ghast' },
      stats: { kills: '5', runs: -3, perHero: [] },
      achievements: { first_blood: { at: 'x' }, good: { at: 5 }, bad: 3 },
      missions: {
        day: 'monday',
        weekKey: '2026-W41',
        daily: 'x',
        weekly: [{ id: 'w', progress: -1 }],
      },
      dailyReward: { lastClaimDay: '2026-10-12', streak: 1.7 },
      cloud: { uid: 42, rev: 'x' },
      settings: {
        cameraLead: 'yes',
        accessibility: { colorblind: 'sepia', textScale: 3, reduceFlash: 1, touchControls: 'on' },
      },
    });
    expect(s.profile.name).toBe('');
    expect(s.profile.avatar).toBe('steve');
    expect(typeof s.profile.id).toBe('string');
    expect(s.stats.kills).toBe(0);
    expect(s.stats.runs).toBe(0);
    expect(s.achievements).toEqual({ first_blood: { at: 0 }, good: { at: 5 } });
    expect(s.missions.day).toBe('');
    expect(s.missions.weekKey).toBe('2026-W41');
    expect(s.missions.daily).toEqual([]);
    expect(s.missions.weekly).toEqual([{ id: 'w', progress: 0, claimed: false }]);
    expect(s.dailyReward).toEqual({ lastClaimDay: '2026-10-12', streak: 1 });
    expect(s.cloud).toEqual({ uid: null, rev: 0, lastSyncedAt: 0 });
    expect(s.settings.cameraLead).toBe(false);
    expect(s.settings.accessibility).toEqual({
      colorblind: 'off',
      textScale: 1,
      reduceFlash: false,
      touchControls: 'on',
    });
  });

  it('clamps huge values and strips control characters', () => {
    const s = migrate({
      saveVersion: 2,
      pullCount: 1e300,
      currencies: { emeralds: 1e20, spawnEggs: Infinity },
      stats: {
        kills: 1e30,
        playSeconds: 1e30,
        perHero: { steve: { runs: 1e99, bestTimeSec: 1e99 } },
      },
      missions: {
        rerollsLeft: 1e6,
        daily: Array.from({ length: 50 }, (_, i) => ({ id: `m${i}` })),
      },
      profile: { name: '  Ana\u0000\u0007 Banana Splitter Supreme  ' },
      settings: { musicVolume: 5 },
    });
    expect(s.pullCount).toBe(MAX_COUNT);
    expect(s.currencies.emeralds).toBe(1e9);
    expect(s.currencies.spawnEggs).toBe(0);
    expect(s.stats.kills).toBe(MAX_COUNT);
    expect(s.stats.playSeconds).toBe(1e9);
    expect(s.stats.perHero['steve']).toEqual({ runs: MAX_COUNT, bestTimeSec: 1e9, bestKills: 0 });
    expect(s.missions.rerollsLeft).toBe(99);
    expect(s.missions.daily).toHaveLength(12);
    expect(s.profile.name).toBe('Ana Banana Split');
    expect([...s.profile.name].length).toBeLessThanOrEqual(16);
    expect(s.settings.musicVolume).toBe(1);
  });

  it('never lets prototype keys through', () => {
    const raw = JSON.parse(
      '{"saveVersion":2,"achievements":{"__proto__":{"at":1},"constructor":{"at":1},"ok":{"at":2}},' +
        '"stats":{"perHero":{"__proto__":{"runs":1},"prototype":{"runs":2},"alex":{"runs":3}}},' +
        '"missions":{"daily":[{"id":"__proto__","progress":1},{"id":"kill_100","progress":4}]}}',
    ) as unknown;
    const s = tryMigrate(raw);
    expect(s).not.toBeNull();
    expect(Object.keys(s?.achievements ?? {})).toEqual(['ok']);
    expect(Object.keys(s?.stats.perHero ?? {})).toEqual(['alex']);
    expect(s?.missions.daily.map((m) => m.id)).toEqual(['kill_100']);
    expect(({} as Record<string, unknown>).at).toBeUndefined();
  });

  it('drops map keys Firestore cannot store (empty or reserved)', () => {
    const s = migrate({
      saveVersion: 2,
      owned: { '': { level: 1 }, __x__: { level: 1 }, alex: { level: 1 } },
      pity: { '': 3, overworld: 2 },
      settings: { controls: { '': ['KeyA'], up: ['KeyW'] } },
    });
    expect(Object.keys(s.owned).sort()).toEqual(['alex', 'steve']);
    expect(s.pity).toEqual({ overworld: 2 });
    expect(s.settings.controls).toEqual({ up: ['KeyW'] });
  });

  it('keeps stats at least as high as the legacy records that older code still writes', () => {
    const s = migrate({
      saveVersion: 2,
      records: { runs: 10, wins: 2, bestTimeSec: 300, bestKills: 400 },
      stats: { runs: 4, wins: 1, bestTimeSec: 100, bestKills: 50, kills: 900 },
    });
    expect(s.stats).toMatchObject({
      runs: 10,
      wins: 2,
      bestTimeSec: 300,
      bestKills: 400,
      kills: 900,
    });
  });

  it('refuses saves from a newer build', () => {
    expect(tryMigrate({ saveVersion: 3 })).toBeNull();
  });
});
