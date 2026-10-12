import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LocalSaveStore, migrate, SAVE_VERSION } from '../src/core/save';
import { loadoutFromSave } from '../src/systems/meta';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('save migration fixtures', () => {
  it('upgrades the v0 prototype save and keeps its progress', () => {
    const s = migrate(fixture('save-v0.json'));
    expect(s.saveVersion).toBe(SAVE_VERSION);
    expect(s.currencies.emeralds).toBe(345);
    expect(s.records.bestTimeSec).toBe(251);
    expect(s.records.bestKills).toBe(120);
    expect(s.owned['steve']).toBeDefined();
    expect(s.settings.controls).toEqual({});
  });

  it('fills the fields an early v1 save lacks and keeps everything it had', () => {
    const s = migrate(fixture('save-v1-early.json'));
    expect(s.pullCount).toBe(12);
    expect(s.currencies).toEqual({ emeralds: 800, spawnEggs: 2, rareSpawnEggs: 1 });
    expect(s.owned['wolf']?.level).toBe(2);
    expect(s.upgrades['steve']).toEqual({ vitality: 3 });
    expect(s.settings.musicVolume).toBe(0.3);
    expect(s.settings.damageNumbers).toBe(true); // added later: default
    expect(s.settings.controls).toEqual({});
    expect(s.flags.tutorialDone).toBe(false);
    expect(loadoutFromSave(s).allies.map((a) => a.id)).toEqual(['wolf']);
  });

  it('round-trips through export and import unchanged', () => {
    const store = new LocalSaveStore(null);
    const imported = store.import(JSON.stringify(fixture('save-v1-early.json')));
    const again = new LocalSaveStore(null).import(store.export());
    expect(again).toEqual(imported);
  });
});
