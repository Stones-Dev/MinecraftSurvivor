# Checkpoints

Non-blocking checkpoint summaries, newest last. Screenshots live in `docs/screenshots/`.

## Checkpoint 0 — asset pipeline, catalogue, roster (approved)

See `docs/CHECKPOINT_0.md`. The owner approved the roster and its substitutions.

## Checkpoint 1 — world and movement

Built: seeded noise world in 16x16-tile chunks painted procedurally (Minecraft-style grass/dirt/sand/water, no sheet art), Plains and Dark Forest palettes with a 2.5 s crossfade every 4 minutes, props (oak/birch/dark oak trees, boulders, coal/iron ore, chests, tall grass, flowers) with y-sorted drawing and shadows, circle collision against solid props, water slowdown, follow camera with integer pixel positions, hero walking with flip and a bob (the sheets have no walk cycle), day/night tint + vignette (5-minute cycle), F3 debug overlay (FPS, bake ms, chunks, props, biome, time), and a `?gallery` page for tile/prop look reviews. URL flags for reviews: `?run&debug&t=<seconds>&seed=<n>`.

Screenshots (headless Chromium via `tools/screenshot.mjs`): `docs/screenshots/p1-gallery.png`, `p1-plains.png`, `p1-biome-fade.png`, `p1-forest-night.png`, `p1-dusk.png`. Headless run: 60 FPS with the debug overlay on.

Notes:
- Chunk baking is held under the budget by a precomputed noise lattice and per-pixel noise table; steady-state painting is a few ms in this (slow) container, cold-start bakes are higher. Tests keep a generous CI limit; re-measure on real hardware in Phase 5.
- The look is a first pass; owner feedback on the tiles is welcome (palettes live in `src/world/biomes.ts`, painters in `src/world/tilePaint.ts` and `src/world/propSprites.ts`).

## Checkpoint 2 — combat core

Built: five enemy types with distinct behaviours and ground telegraphs (zombie chaser; skeleton kiter with a 0.7 s aim line and arrows that trees and rocks block; spider leaper with a landing marker; creeper kamikaze with a 1 s hiss and a blast that also hurts enemies; slime that splits twice), BFS distance-field pathing around trees (rebuilt every 200 ms), spawner with a trickle, tides every 38-56 s, a soft cap of 64 with Elites above 85% (x1.6 HP/XP, crown), far enemies moved back onto the spawn ring, spatial hash, swept projectile collision (no point-blank immunity, tested), Sword (arc) / Bow / TNT with 5 levels each, XP orbs with magnet, level-up cards (3 choices, reroll x1, skip = 25 emeralds, queued level-ups), 5 passives (Sharpness, Quick Charge, Swiftness, Protection, Magnet), hit flash with pre-baked white silhouettes, damage numbers, screen shake, low-HP vignette, canvas HUD with code-drawn icons (hearts, XP bar, timer, kills, emeralds, weapon/passive slots), pause, results (records and emeralds saved through the versioned `SaveStore`), procedural SFX (hit, hurt, swing, bow, TNT, explosion, creeper hiss, XP pickup with a rising pitch streak, emerald, level-up, death).

Tests (85 total): swept collision, spatial hash, save migration/round-trip, economy formulas, armor formula, spawner curves, level-up offers (distinct, reproducible, chained), and a deterministic 3-minute headless run (same seed gives the same outcome).

Screenshots: `docs/screenshots/p2-combat.png` (night, crowd, sword swing, damage numbers), `p2-levelup.png`. Headless run holds 60 FPS with ~40 enemies.

Notes for later phases:
- The hero has no walk cycle in the sheets, so walking is idle plus a 1 px bob; there is no hero death animation, so the hero fades at 50% before Results.
- The 150-enemy performance target is measured in Phase 5 (the sim here is capped at 64 + 10).

## Checkpoint 3 — content

Built: 14 weapons (Sword, Bow, TNT plus Crossbow, Trident, Snowball, Fishing Rod, Harming and Poison potions, Lava Bucket, Lightning Rod, Blaze Rods, Axe, Shield; every one has 5 levels, an evolution and tests), 24 passives (enchantments and potion effects), armor tiers (7) and sword tiers (7) that swap the hero sprite plus an enchanted glint, 8 items with `Space` actives and the second-item swap prompt, 31 enemy types over 11 data-driven archetypes (chaser, kiter, leaper, kamikaze, charger, summoner, healer, teleporter, diver, turret, boss), 4 biomes (Plains, Dark Forest, Snowy Taiga with ice and snowfall, Desert with cacti and lava) on a 4-minute rotation, interactables (ores, chests, locked chests, melons/pumpkins, beacon, campfire, anvil, enchanting table, TNT traps, cobwebs, magma), events (Raid, Golden Hour, Lost Villager escort, Wandering Trader with llamas, thunderstorms that Charge creepers), the Nether rift (portal, walled arena as its own `World`, 90 s fight, rewards), three scripted bosses at 5:00 / 10:00 / 15:00 (Raid Captain, Wither, Warden with a boss bar), four mini-bosses, Charged mobs, the win at 15:00 and Endless scaling.

Balance (`docs/BALANCE.md`, `npm run balance`): a headless bot plays real `RunState`s with two policies. Findings that changed the game: a base regeneration of 0.4 HP/s and a stronger Sword. Fresh Steve with only the sword dies around 5:00 for a competent bot; the v1.0 claim that ranged starters reach the Wither at a 9-10 minute median was later found to be 4-seed noise (see Checkpoint 6, Balance).

Self code review (independent read-only pass, 27 findings, all verified by reading the code). Fixed: lightning left "undead" enemies; Endless bosses could spawn in a burst; rift kill rewards (XP/emeralds) were discarded and rift foes also paid mini-boss rewards; reroll at an enchanting table produced an exploitable normal offer; scheduled callbacks (lightning) survived the rift swap; a death and a win in the same frame counted as a loss; old fleeing villagers broke the next escort and doubled its timer; module-level NPC id counter broke determinism; the last DoT tick was lost; two banner carriers per raid; a second item prompt overwrote the first; the anvil was consumed when nothing could be upgraded; save loading kept mistyped fields, silently replaced unreadable or newer saves (now backed up under `.bak` and never overwritten), imports accepted anything, "NEW RECORD" compared floats, and `?t=` inflated rewards without `debug`. Performance fixes: numeric chunk keys and a cached removed-prop check in the collision path, an allocation-free biome lookup, memoised enemy animation ids, tighter spatial-hash query bounds plus bucket cleanup, pre-rendered pool discs, batched damage text with a cap, off-screen culling and a 300-orb cap (the oldest are banked as XP), hazard props refreshed 3 times a second, early-out in prop overlays. Not done (low value or large): pooling `Fx` objects, pre-rendering damage digits, a `collide()` output object reuse.

Tests: 264 (weapons, world events, rifts, bosses, saves, gacha, meta).

Screenshots: `p3-gallery-a/b.png` (props), `p3-taiga.png`, `p3-desert.png`, `p3-boss.png`, `p3-npcs-portal.png`, `p3-rift.png`, `p3-weapons-a..d.png`. Headless run: 60 FPS with ~80 enemies.

## Checkpoint 4 — meta

Built: data-driven Spawner (`systems/gacha.ts`, banner list ready for 1.1): rates 50/28/15/5.5/1.5, a x10 that always holds a Rare or better, Legendary pity at 60, seeded per save (`gachaSeed` + pull index), duplicates level a companion with 1/2/3/4 copies and refund Emeralds past level 5, hero duplicates give 5 shards and 500 Emeralds. 3 heroes (Steve, Alex and Rana with their passives), 15 pets and 10 allies with per-level buffs and lore quips. Pets follow with a lazy spring; allies fight (wolf, snow golem, trader llama, fletcher, cleric, weaponsmith, armorer, librarian, horse with trample and a `Space` sprint, iron golem with taunt and slam), take contact damage, go downed and return after 20 s at 50% HP. Permanent upgrades (11 per hero plus Leadership and Kennel account-wide), Collection (tabs, level pips, shard progress, buffs, lore, equip), Run setup, Settings (audio, graphics, remappable controls, export/import/reset), a first-run tutorial overlay and a hub with the equipped hero and companions. Spawner screen: caged spawner with flames by rarity, lightning for Legendary, spin / reveal for x1, tray for x10, click to skip.

Tests added: 9 gacha tests (1e6 rate check within 1%, pity, x10, dupes, determinism), 8 meta tests (hero passives, upgrades, Kennel scaling, loadout from save, ally lifecycle), 3 save-hardening tests.

Screenshots: `p4-hub.png`, `p4-collection.png`, `p4-spawner.png`, `p4-spawner-spin.png`, `p4-spawner-reveal.png`, `p4-spawner-x10.png`, `p4-upgrades.png`, `p4-settings.png`, `p4-setup.png`, `p4-run-companions.png`.

Carried to Phase 5 and done there: the About/credits screen, render quality tiers, music and the Legendary sting.

## Checkpoint 5 — polish and release

Built: 8 procedural music themes (hub, plains, night, dark forest, taiga, desert, nether, boss) on a look-ahead sequencer with crossfades, chosen by moment (boss > rift > night > biome), plus stings (legendary, victory, game over, boss, portal, trade) and the remaining SFX (potion splash, snowball, thunder, chest, egg, spawner spin); music and SFX volume sliders and mute persist and apply live. Hub with a live dusk slice of the world behind the menu, About / credits / legal screen, first-run tutorial. Quality tiers (auto adapts to frame time; low/medium/high change particles, weather and shadows). Installable PWA: service worker (offline reload verified in headless Chromium), web manifest, icons. `.github/workflows/deploy.yml` (lint, test, build, publish to GitHub Pages on `main` and `v*` tags). README (English), GDD "as shipped" section, save-migration fixtures (v0 prototype and early v1) with export/import round-trip tests.

Performance: 120-150 enemies on screen hold 60 FPS (16.7 ms frames) in headless Chromium (software rendering, conservative); screenshot `p5-crowd150.png`. Review-driven hot-path fixes are listed under Checkpoint 3.

Reviews: a second independent read-only review of the Phase 4 code found 13 issues, all fixed: Esc could not un-pause (the key also re-triggered pause), key auto-repeat skipped offers and dismissed results, Looting and Pig were counted twice (now a payout-only multiplier), debug URL parameters granted real rewards (now `debug`-only and debug runs never save), 4-card offers and the Spawner overflowed at 320x180, unsanitised upgrade ranks and loadout ids in saves, companions placed before the rift teleport, and smaller UI and Turtle issues.

Open item for the owner: enabling GitHub Pages (Settings > Pages > GitHub Actions) once `main` is merged so the workflow can deploy. Sprite credits are complete (Askywalker, with the seven source links, in `CREDITS.md` and About).

Screenshots: `p5-title.png`, `p5-hub.png`, `p5-hub-small.png`, `p5-crowd150.png`, `p4-tutorial.png`.

## Checkpoint 6 — v1.1

Status: **the owner has not signed off v1.1 yet, and nothing is merged to `main`.** `main` (local and `origin/main`) is still at `42c6948` (v1.0 plus the sprite credits); the v1.1 work is the commits after it on the branch `claude/sleepy-bardeen-wme7gt` (`git log 42c6948..HEAD`, 31 commits including work-in-progress checkpoints). The game reports version 1.1.0 in About.

Built (the v1.1 waves 0-4 by area; details in `docs/DECISIONS.md`, entries dated 2026-10-13):
- Feel and input: Tiny5 pixel text layer, render interpolation, acceleration/braking, integer camera with look-ahead, procedural walk cycle, data-driven hero abilities on Q, keyboard + gamepad + touch input, repository hygiene (`CLAUDE.md` and `.claude/` untracked, `.env.example`).
- Content: spatial biome map with 10 overworld biomes, per-biome rosters (35 new enemy defs from 37 newly packaged sheets), 16x16 block textures with animated water and lava, voxel-style props, ambient particles, five new music themes (13 in total), minimap (M), 8 new heroes (11 in total) with kits and abilities, 15 new pets (30) and 12 new allies (22).
- Accounts: `src/net` (auth, cloud save with conflict handling, leaderboards, Firebase backend plus an in-memory twin), Firestore rules and indexes, `docs/FIREBASE_SETUP.md`.
- Meta and UI: profile, ranking and tabbed settings, accessibility (colour-blind cues, reduce flash, text size, camera lead, touch mode), missions, achievements (55), 7-day daily reward, run statistics and a detailed results screen, hub/collection/run setup/upgrades/Spawner redesigned.
- Hardening and polish: two independent reviews (below), keyboard and gamepad navigation on every canvas screen, Spawner layout down to 213x120, two-step save import, minimap touch toggle.

### Evidence (run on the committed state `8dba03e`, working tree clean apart from docs)

| Check | Result |
|---|---|
| `npx vitest run` | 51 test files, **715 tests passed**, 0 failed (about 12 s) |
| `npx tsc --noEmit` (`npm run typecheck`) | clean |
| `npm run lint` (ESLint + Prettier check) | clean |
| `npm run build` | succeeds; Vite warns that the lazily loaded Firebase chunk (578 kB, 172 kB gzip) is over 500 kB; the main bundle is 462 kB (165 kB gzip) |
| `public/atlas` | two pages, about 2.3 MiB (budget 5 MiB) |

### Performance

- Reported by the lead: 60 fps with `?run&debug&crowd=150` in each of the 10 overworld biomes, in a headless browser. That browser is software-rendered and vsync-capped at 60 fps, so the result says "no frames dropped below 60", not how much headroom there is, and it is not a measurement on real hardware.
- Earlier uncapped headless readings with 150 enemies (biome-content round): 136-270 fps, minimap on or off within noise. Minimap repaint 0.4-0.7 ms about every 2 s; ambient particles update in about 0.01 ms.
- Screenshots: `docs/screenshots/` (prefixes `a1`, `a2`, `b`, `c2`, `w0`-`w2`, `p`; for example `w1-biome-jungle-crowd150.png`, `p-focus-*.png`).

### Balance (`docs/BALANCE_RESULTS.md`, `BAL_RUNS=48 BAL_BIOMES=1 npm run balance`, bot plays a fresh Steve)

A balance hunt found that the v1.0 per-weapon medians quoted in earlier checkpoints (bow 9:27 and so on) were 4-seed noise; re-measured with 24 seeds v1.0 gave bow 6:28. Two real losses were found in v1.1 (the bot re-planned too slowly for the new acceleration model, and wandered into lava) and fixed in the bot; base regeneration was raised from 0.4 to 0.7 HP/s (a real game change, picked by a sweep on held-out seeds). Medians with 48 seeds (+/- 0:25 to 0:40 per cell):

| Cell | Median survival |
|---|---|
| smart policy, sword | 5:41 |
| newbie policy (150 seeds) | 3:08 (3:19 at 48 seeds), same as v1.0 (3:15) |
| smart, per starting weapon | bow 10:03, lightning rod 10:10, TNT 9:00, blaze rods 8:40, crossbow 8:16, snowball 7:01, axe 5:05, sword 5:27; p90 above 10:00 for 12 of 14 starters |
| smart, sword, all 10 start biomes | 5:00 to 5:54 (plains 5:09) |

Caveats: the numbers are fitted to the bot, which does not use companions, upgrades, abilities, chests, rifts or trades, so real runs (which have all of those) may be easier than these medians say; the newbie median sits at the low end of the 3:15-4:15 target and was not tuned; smart-sword medians are near the top of the 4-6 minute band.

### Reviews

Two independent reviews were run on the v1.1 code, one for gameplay and performance and one for security. Fixes that came out of them (commits `2be561c` and `f2bede9`, tests in `tests/reviewFixes.test.ts`, `tests/loop.test.ts`, `tests/save-v2.test.ts`, `tests/serviceWorker.test.ts`, `tests/abilities.test.ts` and `tests/net-leaderboard.test.ts`):

Gameplay and performance:
- The game loop survives an exception in update or render (the rAF chain stays alive, the error is reported and throttled).
- A temporary resistance now triggers the stat recompute when it expires; hits queued in a frame where the hero is dead no longer pile up; orbiting weapons forget re-hit memory per entry instead of all at once.
- Rift edge cases: a hero who dies on the same step as the last foe escapes alive without reward; overworld decoys wait in the stash and return after the rift; callbacks queued in the arena are flushed on leave without touching the overworld queue.
- The spawn ring never offers lava, or water to land mobs; the debug/setup start biome puts the hero on dry ground; a teleport (a NaN on either axis of the previous position) snaps instead of interpolating a streak.
- Importing a save keeps the replaced one under `minesurvive.save.pre-import.bak`, and the import needs a second confirming click.

Security:
- Nickname squatting: deleting a profile must release its nickname claim in the same write (Firestore rules).
- Save hardening: import capped at 512 KiB, caps on the number of owned/pity/upgrade/control entries, timestamps clamped to year 2100 so a huge value cannot freeze cloud sync.
- Leaderboard: kill plausibility bound tightened from 100 + 30/s to 20 + 10/s (client and rules), board ids restricted to valid weeks and days.
- Service worker: an error page is never cached as the offline shell; hashed assets are cache-first, everything else stale-while-revalidate (cache `v3`); a test requires every atlas page to be precached.
- Deploy workflow: read-only default permissions, `pages: write` and `id-token: write` only on the deploy job.
- Account dialog: keys cannot leak to the game while the modal is open (focus is pulled back inside); autocomplete attributes corrected.
- A hardening checklist (restrict the API key, App Check, budget alert, email enumeration protection, dedicated Pages origin) was added to `docs/FIREBASE_SETUP.md`.

### What is NOT verified

- **Real Firebase and real Google login.** Nothing was tried against a real Firebase project. The cloud code is exercised only against the in-memory backend, which mirrors the rules; the Firestore rules themselves are not unit-tested (that needs the Firebase emulator).
- **Real gamepad.** Gamepad input and menu navigation are unit-tested with mocked pad objects only; no physical controller was used.
- **Audio by ear.** The music is covered by note-range tests only; nobody has listened to the new themes, the crossfades or the stings.
- **Touch on a real device.** Touch logic is unit-tested; no phone or tablet was used.
- **Real hardware performance.** See Performance above (headless, software rendering, vsync-capped).
- **Cross-browser behaviour.** Only headless Chromium was used.

### Known gaps and deferred

- Online co-op is not started (the next milestone).
- Firebase App Check is not implemented (the hardening checklist says so); there is no in-game "delete account" button; the leaderboard anti-cheat is bounded by elapsed time but a determined cheater can still submit a time up to the real elapsed time.
- No Content-Security-Policy is set on the page.
- Hot-path allocation pooling is still open (`Fx` objects and `collide()` results are allocated per use); pre-rendered damage digits were solved by the text-layer cache.
- Generated hero art was tried once and not shipped (`docs/DECISIONS.md`); no AI-generated art is in the game.
- Layered armor/sword sprites exist only for Steve, Alex and Rana; the eight sprite heroes show tiers as stats only.
- Colour-blind support remaps the critical cues only (telegraphs, boss bar, low-HP vignette, card borders, rarity colours), not the whole canvas; text size 2x covers the in-run HUD and account dialogs, not the other canvas menus.
- The minimap is not drawn on views under 150 px high; the supported minimum view is 320x180.
- The balance bot is a fresh-Steve baseline (see Balance).
- GitHub Pages must be enabled for the repository (Settings > Pages > GitHub Actions) and, for cloud features, the `FIREBASE_*` repository variables must be set; `v*` tags cannot be pushed from the build session.


### Checkpoint 6b — v1.3 (audit waves 2-3)

Authentic 4-direction walk cycles for Steve, Alex and Rana with a held-weapon overlay; hero capsule hurtbox with hostile-shooter compensation; waist aim and full-height tall bosses; hit-stop, trauma shake, clearer telegraphs; pad navigation in collection, upgrades and pause; pad rebinding; HUD key prompts; touch suspended under modals; spawner fixes; 5 starter eggs and the Wolf replacement rule; more minute-0 variety. Evidence: lint, `tsc` and 951 tests green; browser smoke test over 25 pages with 0 errors and about 60 fps in all 10 biomes at `?crowd=150` (headless, vsync-capped); balance as in `docs/BALANCE.md` (v1.3 final tuning). Not verified: audio by ear, real gamepad, real touch, real Firebase login, human play feel.
