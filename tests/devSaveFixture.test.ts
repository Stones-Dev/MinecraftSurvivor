import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs tool without type declarations
import * as tool from '../tools/dev-save-fixture.mjs';
import { COMPANION_BY_ID } from '../src/data/companions';
import { defaultSave, LocalSaveStore, migrate, SAVE_VERSION } from '../src/core/save';
import { loadoutFromSave } from '../src/systems/meta';

interface Tool {
  STORAGE_KEY: string;
  SAVE_VERSION: number;
  FIXTURE_HEROES: string[];
  FIXTURE_PETS: string[];
  FIXTURE_ALLIES: string[];
  buildFixture(now?: number): Record<string, unknown>;
  buildSnippet(key?: string, now?: number): string;
}
const t = tool as unknown as Tool;

describe('tools/dev-save-fixture.mjs', () => {
  it('uses the real storage key and save version', () => {
    expect(t.STORAGE_KEY).toBe(new LocalSaveStore(null).key);
    expect(t.SAVE_VERSION).toBe(SAVE_VERSION);
    expect(t.buildSnippet()).toContain('"minesurvive.save"');
    expect(t.buildSnippet()).not.toContain('minesurvive-save');
  });

  it('every companion id exists with the right kind', () => {
    for (const id of t.FIXTURE_HEROES) expect(COMPANION_BY_ID.get(id)?.kind, id).toBe('hero');
    for (const id of t.FIXTURE_PETS) expect(COMPANION_BY_ID.get(id)?.kind, id).toBe('pet');
    for (const id of t.FIXTURE_ALLIES) expect(COMPANION_BY_ID.get(id)?.kind, id).toBe('ally');
  });

  it('is a rich save that survives the game own migration untouched', () => {
    const raw = t.buildFixture(1_760_000_000_000);
    const s = migrate(JSON.parse(JSON.stringify(raw)));
    expect(s.currencies).toEqual({ emeralds: 5000, spawnEggs: 50, rareSpawnEggs: 20 });
    expect(s.flags.tutorialDone).toBe(true);
    expect(Object.keys(s.owned).sort()).toEqual(Object.keys(raw.owned as object).sort());
    expect(s.loadout).toEqual(raw.loadout);
    expect(s.upgrades).toEqual(raw.upgrades);
    expect(loadoutFromSave(s).pet?.id).toBe('cat');
    // Same top-level shape as a real default save, nothing added or dropped by sanitize.
    expect(Object.keys(raw).sort()).toEqual(Object.keys(defaultSave(1)).sort());
    expect(migrate(raw)).toEqual(s);
  });

  it('the snippet writes that fixture under the key it was given', () => {
    const store = new Map<string, string>();
    const fake = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    store.set('minesurvive.save', '{"old":true}');
    let reloaded = false;
    new Function('localStorage', 'location', t.buildSnippet('minesurvive.save', 5))(fake, {
      reload: () => (reloaded = true),
    });
    expect(reloaded).toBe(true);
    expect(store.get('minesurvive.save.dev-fixture.bak')).toBe('{"old":true}');
    const loaded = new LocalSaveStore(fake).load();
    expect(loaded.currencies.spawnEggs).toBe(50);
    expect(loaded.currencies.rareSpawnEggs).toBe(20);
    expect(loaded.createdAt).toBe(5);
  });
});
