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


## Checkpoint 7 — v1.4 (structures, the End and the Ender Dragon, manual aim)

Built on the work branch (not merged, not signed off by the owner; the About screen and `GAME_VERSION` still say 1.1.0, no version bump was decided):

- **Manual aim** (optional, Settings > Controls > Aim, default Auto and unchanged): mouse, right stick or touch aim stick point the directional weapons and the melee swings; reticle; falls back to auto-aim 1.5 s after a stick (or, on a pad or touch device, the mouse) goes quiet.
- **World structures:** six stamps on a shared framework (Village with services, crops, Iron Golem and chest; Desert Temple with the TNT plate; Jungle Temple with tripwires and the lever puzzle; Trial Chamber with a sealed wave, key and Vault; Pillager Outpost with Captain, cage and Bad Omen; Witch Hut with cauldron and Black Cat), the village **raid** and the Hero of the Village effect, structure enemies outside the spawn cap, loot tables, 7 + 10 new materials, 28 prop kinds, 4 achievements (Jungle Raider, Trial Passed, **Village Defender**, Witch's Brew), a daily mission, debug starts `?struct=`.
- **The End:** the Warden's death opens a permanent End portal (the win is unchanged); the End island, six crystal pillars, void rule with the Totem exception, the **Ender Dragon** in three phases, Dragon Egg, exit portal, the final victory scroll and the `THE END` Results; achievements Dragon Slayer and The End?, a weekly mission, an `end` music theme; debug `?end`, `?endportal`, `?dragon=`.
- **This wave (docs and UI):** the minimap shows explored structures as shaped icons (solid square, plus, X, ring, T, roof; colour-blind-safe colours) built from `poiMarkers`, with the End portal and the other live markers as before; the raid achievement was renamed to **Village Defender** (the id `raid_hero` is unchanged, so saves are untouched; the escort achievement keeps "Hero of the Village") and a test now requires unique achievement names; banners, the dragon's status line and the HUD status tags are fitted to the view (tags wrap to a second row instead of running into the counters); the About screen paginates its sections and gained an "Art" entry; README, GDD (§1/§5/§7/§8.2/§16/§18), TASKS (Phase 7) and CREDITS were brought up to date.

### Evidence (run on 2026-10-13 on the working tree on top of commit `4c0c7d4`: the merged v1.4 content plus this wave, the last doc and UI edits uncommitted; the machine was shared with other agents, so timings are indicative)

- `npm run lint` (ESLint + Prettier check): clean, no warnings.
- `npx tsc --noEmit`: exit 0, no errors.
- `npx vitest run`: **78 files, 1129 tests, all passed** (24.8 s in the last run). Two CPU-bound tests (`biomes.test.ts` "always lands on dry, walkable ground" 3.6 s and `endDimension.test.ts` "opens where the Warden falls" 4.5 s, both alone on the machine) sit close to Vitest's 5 s default and timed out once while three other agents were running the suite; both now carry a 30 s timeout. That was the only red seen, and it was load, not logic.
- `npm run build` (tsc + Vite): built in about 2 s; `index` chunk 600.26 kB (gzip 214.75 kB), lazy Firebase chunk 577.61 kB (gzip 172.30 kB); Vite warns about chunks over 500 kB (not new, not acted on).
- Minimap cost (`tests/minimap.test.ts`, a stub canvas, so this is script time only and says nothing about real raster cost): a steady frame with 36 `fillRect` calls (frame, hero, markers and several structure icons) costs about 0.006-0.01 ms (the test limit is 0.3 ms); the existing window repaint on a cell crossing, about every 2 s, costs about 0.35 ms when every cell is explored; the structure query is moved to the frame after the repaint and costs about 0.02 ms warm and 0.26 ms the first time a new area is looked at. The map is 44x44 px with its frame, top right, and fits a 320x180 view (`minimapSlot`, tested).
- Per-biome FPS with the new content (`?run&debug&crowd=150` in each biome, plus a structure and the End): **to be filled in by the lead's own measurement** `[ FPS table: pending ]`. For reference only, the agents reported in `docs/DECISIONS.md` 60 fps at 1280x720 and 640x360 in the End with the dragon, six crystals and the starfield, 60.1 fps at the middle of each new structure with 150 enemies, a stamped chunk bake of 2.4-2.9 ms (limit 14 ms) and a structure lookup of 0.01-0.04 ms per chunk; none of that was re-measured here.

### What is NOT verified

- **Audio by ear.** The new sounds (tripwire click, TNT fuse, the Warden-to-End portal cue, the dragon's roar and death, the exit portal) reuse existing events, and the `end` theme is covered by note-range tests only; nobody has listened.
- **Real gamepad and real touch.** Manual aim with a right stick and the touch aim stick, walking through village doors, and the structure interactions are tested with mocked input only.
- **Human feel.** The dragon fight and the Trial Chamber wave are balanced with scripted heroes (`tests/helpers/endFight.ts`, `trialFight.ts`) that dodge perfectly; no human has played either. A full 15-minute run into the End by a person (Warden, portal, dragon, exit portal, victory scroll) has not been done; the pieces are tested and the path was walked with `?endportal`, not played through.
- **Real Firebase.** Still never tried against a real project or a real Google login (as in Checkpoint 6); the new run-record fields (`struct`, `endDragon`, `dragonEgg`) go through the same sync code and are covered only by the in-memory backend.
- **Looks.** Only static screenshots of the End and the structures were read; the flap animation, the telegraph readability on small phones, a raid in progress and the Hero chest were not seen on screen (no debug entry for Bad Omen). The minimap icons were verified by tests (shapes, colour distances) and a stub canvas, not by looking at them on a real screen.
- **Other browsers and real hardware.** Chromium headless only.

### Known risks (from the agents' entries in `docs/DECISIONS.md`)

- Damage over time (poison, burning) goes through the "quiet" path of the dragon's damage gate and bypasses its melee immunity and the perch deflection; a pure-DoT build is stronger against the dragon than intended.
- The dragon's 2.5x HP multiplier and the crystals' 15 HP/s heal were tuned on two scripted builds (STRONG kills it in 101-126 s, MID in 827-867 s); real builds will land somewhere else. Allies attack the dragon while it flies and waste bites on "Out of reach!".
- The Trial Chamber wave uses plain mob stats and is untuned for humans: a hero that never dodges kept 60-75% HP at level 1, which may be too easy or, for a weak build, too hard.
- The Witch Hut is not visibly on stilts: it is a planks floor that reads as ground over shallow water; the "on stilts" look is not drawn.
- Art is provisional and code-drawn (dragon, crystals, End tiles, the 18 structure props); Breeze, Bogged, Allay and Ravager are stand-ins (Spider, mossy skeletons, a caged Toucan or Bat, Hoglin). There is no Baby Dragon pet: the egg pays 1000 Emeralds instead.
- The raid and the outpost's captain use the Pillager's 130 px range; a raid pauses while a rift is open; each village raids once per run.
- The balance bot never opens chests or uses villagers and never reaches the End, so `docs/BALANCE.md` was not re-run for v1.4; the village chest at 77-114 tiles is a small early boost for humans.
- The About screen and `GAME_VERSION` still read 1.1.0, and the About list does not mention v1.4 features beyond the "Art" entry.

### Deferred

Online co-op, the Baby Dragon pet (needs atlas art), Firebase App Check, a Content-Security-Policy, hot-path allocation pooling and hand-drawn art for the hero set carry over from Checkpoint 6 (see `docs/TASKS.md`, Phase 6 and 7).
