// Prints a snippet for the browser console that seeds localStorage with a rich save, so the Spawner, the
// collection and the upgrades can be tried without grinding first.
//
//   node tools/dev-save-fixture.mjs                 # snippet for the guest / local profile (key minesurvive.save)
//   node tools/dev-save-fixture.mjs --key minesurvive.save.<uid>   # a signed-in cloud account uses a per-uid key
//   node tools/dev-save-fixture.mjs | pbcopy        # or pipe it to the clipboard of your choice
//
// Open the game (`npm run dev`), paste the snippet into the DevTools console: it overwrites the save under
// the real storage key `minesurvive.save` (NOT `minesurvive-save`, which the game never reads) and reloads the page.
// The previous save is kept under `<key>.dev-fixture.bak`. The object follows save version 2 (src/core/save.ts);
// tests/devSaveFixture.test.ts runs it through the game's own migrate() so it cannot drift from the schema.
import { pathToFileURL } from 'node:url';

export const STORAGE_KEY = 'minesurvive.save';
export const SAVE_VERSION = 2;

/** Companions owned by the fixture (ids from src/data/companions.ts; the test checks each one exists). */
export const FIXTURE_HEROES = ['steve', 'alex', 'rana', 'skeleton', 'witch'];
export const FIXTURE_PETS = ['cat', 'fox', 'parrot', 'wolf_pup', 'axolotl', 'panda'];
export const FIXTURE_ALLIES = ['wolf', 'snow_golem', 'cleric', 'horse', 'iron_golem'];

/** A complete save-version-2 object: 5000 emeralds, 50 eggs, 20 rare eggs, a spread of companions, tutorial done. */
export function buildFixture(now = Date.now()) {
  const gachaSeed = (now ^ 0x5bd1e995) >>> 0;
  const owned = {};
  const own = (id, level, shards) => {
    owned[id] = { level, shards, obtainedAt: now };
  };
  FIXTURE_HEROES.forEach((id, i) => own(id, 1, i === 1 ? 5 : 0));
  FIXTURE_PETS.forEach((id, i) => own(id, 1 + (i % 3), i % 3));
  FIXTURE_ALLIES.forEach((id, i) => own(id, 1 + (i % 2), 0));
  return {
    saveVersion: SAVE_VERSION,
    createdAt: now,
    lastModified: now,
    gachaSeed,
    pullCount: 40,
    pity: { overworld: 12 },
    currencies: { emeralds: 5000, spawnEggs: 50, rareSpawnEggs: 20 },
    owned,
    loadout: { hero: 'steve', pet: 'cat', allies: ['wolf'] },
    // A few ranks so there is something to see; plenty of room left to buy more.
    upgrades: { steve: { vitality: 2, strength: 1, looting: 1 } },
    records: { bestTimeSec: 612, bestKills: 540, wins: 0, runs: 14 },
    profile: { id: `p-dev-${gachaSeed.toString(36)}`, name: 'Dev', avatar: 'steve' },
    stats: {
      kills: 2400,
      runs: 14,
      wins: 0,
      playSeconds: 5200,
      bosses: 3,
      minis: 5,
      eggsOpened: 40,
      emeraldsEarned: 3200,
      bestTimeSec: 612,
      bestKills: 540,
      perHero: { steve: { runs: 14, bestTimeSec: 612, bestKills: 540 } },
      counters: {},
    },
    achievements: {},
    missions: { day: '', weekKey: '', daily: [], weekly: [], rerollsLeft: 0 },
    dailyReward: { lastClaimDay: '', streak: 0 },
    cloud: { uid: null, rev: 0, lastSyncedAt: 0 },
    settings: {
      musicVolume: 0.6,
      sfxVolume: 0.8,
      muted: false,
      damageNumbers: true,
      screenShake: true,
      showFps: false,
      quality: 'auto',
      cameraLead: true,
      accessibility: {
        colorblind: 'off',
        textScale: 1,
        reduceFlash: false,
        touchControls: 'auto',
      },
      controls: {},
    },
    flags: { tutorialDone: true },
  };
}

/** The console snippet: backs up the current save, writes the fixture and reloads. */
export function buildSnippet(key = STORAGE_KEY, now = Date.now()) {
  const json = JSON.stringify(buildFixture(now));
  return [
    `(() => {`,
    `  const key = ${JSON.stringify(key)};`,
    `  const old = localStorage.getItem(key);`,
    `  if (old) localStorage.setItem(key + '.dev-fixture.bak', old);`,
    `  localStorage.setItem(key, ${JSON.stringify(json)});`,
    `  location.reload();`,
    `})();`,
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--key');
  const key = i > 0 && process.argv[i + 1] ? process.argv[i + 1] : STORAGE_KEY;
  console.log(buildSnippet(key));
}
