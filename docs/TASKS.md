# MineSurvive — Tasks

Checkbox list per phase. Each task: `ID — description (deps: …)`. `[haiku]` = suitable to delegate to a Haiku subagent (always reviewed + lint/typecheck/tests before commit). Later phases are at feature granularity and get refined at each checkpoint.

## Pre-Phase 0

- [x] PRE-01 — Read `CLAUDE.md` and `docs/BRIEF.md` end to end
- [x] PRE-02 — Clone `pokesurvivor` into `reference/` (gitignored) and read GDD, README, world, spawner, gacha, enemy, combat, pathing, icons (deps: PRE-01)
- [x] PRE-03 — Write `docs/PLAN.md` and `docs/TASKS.md` (deps: PRE-02)
- [x] PRE-04 — ⛔ Owner review of PLAN/TASKS + answers to PLAN §9 open questions (deps: PRE-03)

## Phase 0 — Asset pipeline & skeleton

Project & docs
- [x] P0-01 — Vite + TypeScript strict scaffold (`index.html`, `src/main.ts`, `tsconfig.json`, npm scripts `dev/build/preview/test/lint/typecheck/format`) (deps: PRE-04)
- [x] P0-02 — ESLint (flat config) + Prettier; rule banning `Math.random` outside `core/rng` and `fx` [haiku] (deps: P0-01)
- [x] P0-03 — Vitest setup + first smoke test [haiku] (deps: P0-01)
- [x] P0-04 — CI workflow `.github/workflows/ci.yml`: install, lint, typecheck, test [haiku] (deps: P0-02, P0-03)
- [x] P0-05 — `docs/GDD.md` seeded from BRIEF design sections (§1, §5–§15) [haiku] (deps: PRE-04)
- [x] P0-06 — `docs/DECISIONS.md` seeded with decisions taken so far (dated) (deps: PRE-04)

Sprite pipeline
- [x] P0-07 — `tools/slice_sheets.py`: section segmentation by cell-bg colour, label-bar crop, cell split on separators, trim + feet origin, `sections.json` (deps: PRE-04)
- [x] P0-08 — Slicer: contact sheets `contact_<page>.png` (×2, numbered, label beside each row) (deps: P0-07)
- [x] P0-09 — Run slicer on all 7 sheets; sanity-check section/frame counts and spot-check odd sections (deps: P0-08)
- [x] P0-10 — (generated from decoded labels)  Catalogue: review contact sheets per sheet, write `docs/ASSET_CATALOG.md` (one table per sheet, frame counts, v1.0 usage) — split per sheet across agents [haiku for first pass, lead reviews] (deps: P0-09)
- [x] P0-11 — (validator: tools/validate_manifest.py, 0 errors)  `assets-src/manifest.json` with semantic ids per naming scheme + schema validator (deps: P0-10)
- [x] P0-12 — `tools/build_atlas.py`: pack manifest frames into ≤ 4096² POT pages, 1 px padding, flash/hurt variants, `atlas.json`; size report (warn > 5 MB) (deps: P0-11)
- [x] P0-13 — `CREDITS.md` draft with authors readable on the sheets + font license (deps: P0-09)

Runtime skeleton
- [x] P0-14 — `core/rng` (xorshift/splitmix, `fork`) + tests [haiku] (deps: P0-03)
- [x] P0-15 — `core/loop` fixed 60 Hz + render, `timeScale`, pause on blur (deps: P0-01)
- [x] P0-16 — Canvas setup: internal art-res canvas, integer scale, letterbox, ×3/×2 zoom rule, `imageSmoothingEnabled=false` (deps: P0-01)
- [x] P0-17 — `core/atlas`: load atlas JSON/PNG, frame lookup, `Animator` with fallbacks (no walk → idle bob), flip (deps: P0-12, P0-16)
- [x] P0-18 — `core/input` `InputSource` (keyboard+mouse impl) (deps: P0-01)
- [x] P0-19 — (Pixelify Sans bundled)  `core/i18n` keyed English table, `core/settings` stub, bundled pixel font (deps: P0-01, PRE-04 font choice)
- [x] P0-20 — Screen router (push/pop/replace) + empty screens: title, hub, run-setup, run, pause, levelup, results, collection, gacha, upgrades, settings, about [haiku for empty screens] (deps: P0-19)
- [x] P0-21 — Hub shows Steve idle at ×3, pixel-perfect (deps: P0-17, P0-20)
- [x] P0-22 — ⛔ CHECKPOINT 0: contact sheets, catalogue, proposed v1.0 roster (enemies, bosses, mini-bosses, pets, allies) + missing → 1.1 (deps: P0-04, P0-05, P0-06, P0-10, P0-13, P0-21)

## Phase 1 — World & movement

- [x] P1-01 — `world/noise` hash2 + value noise + fbm, seed layer offsets; determinism tests (deps: P0-22)
- [x] P1-02 — Tile codes & flags; biome table (Plains, Dark Forest) with palettes [haiku for palette tables] (deps: P1-01)
- [x] P1-03 — `world/chunks`: chunk records (terrain + props), LRU caches, bake queue with ≤ 4 ms budget (deps: P1-02)
- [x] P1-04 — `world/tiles` procedural painters: grass, dirt, stone, water (shore bands), paths; 8-neighbour autotiling (deps: P1-03)
- [x] P1-05 — `core/pixelart` helpers + prop painters: oak/birch/dark oak trees, boulders, tall grass/flowers, ores, chests (deps: P1-04)
- [x] P1-06 — Tile/prop gallery debug screen for look reviews (deps: P1-05)
- [x] P1-07 — `world/collision`: circle vs tile flags and solid props, push-out (deps: P1-03)
- [x] P1-08 — `core/camera` follow + clamp to integer pixels (deps: P0-16)
- [x] P1-09 — Player movement 8-dir, flip, idle/walk anim, water slow (deps: P1-07, P1-08, P0-18)
- [x] P1-10 — `systems/daynight` tint/vignette, 5-min cycle; biome crossfade 2.5 s (deps: P1-04)
- [x] P1-11 — F3 debug overlay: FPS, frame ms, chunks baked/cached, entities [haiku] (deps: P1-03)
- [x] P1-12 — ⛔ CHECKPOINT 1: owner walks around and judges tiles (deps: P1-06, P1-09, P1-10, P1-11)

## Phase 2 — Combat core

- [x] P2-01 — Entity pools; spatial hash (deps: P1-12)
- [x] P2-02 — `world/pathing` BFS distance field (200 ms) + LOS shortcut (deps: P2-01)
- [x] P2-03 — Enemy base + archetypes `chaser`, `ranged-kiter`, `kamikaze`, `splitter`, leap; telegraph system (deps: P2-02)
- [x] P2-04 — Enemies data: zombie, skeleton, spider, creeper, slime [haiku] (deps: P2-03)
- [x] P2-05 — `systems/spawner`: trickle + tides, ring spawn, cap/elites, despawn-behind/respawn-ahead, HP/dmg curves (deps: P2-04)
- [x] P2-06 — `systems/combat`: damage/armor formula, knockback, status effects, swept projectiles; tests (deps: P2-01)
- [x] P2-07 — Weapons framework (levels, cooldowns, data-driven) + Sword (arc, swing anim), Bow, TNT (deps: P2-06)
- [x] P2-08 — Procedural VFX: arrows, sweep arc, TNT + explosion, hit sparks, damage numbers [haiku drafts] (deps: P2-07)
- [x] P2-09 — XP orbs, magnet, level curve; `systems/levelup` card offers (seeded, luck weights), reroll/skip; tests (deps: P2-06)
- [x] P2-10 — Player hurt/death, i-frames, white flash, screen shake, low-HP vignette (deps: P2-06)
- [x] P2-11 — Canvas HUD (hearts, XP bar, timer, kills, slots) + code-drawn icons (`ui/icons`) [haiku for icon maps] (deps: P2-09)
- [x] P2-12 — Pause, level-up and results screens; `core/save` `SaveStore` v1 + records; migration tests (deps: P2-09, P2-10)
- [x] P2-13 — Placeholder SFX (hit, hurt, swing, bow, TNT, pickup, level-up) with the synth core (deps: P2-07)
- [x] P2-14 — ⛔ CHECKPOINT 2: game feel review (deps: P2-05, P2-08, P2-11, P2-12, P2-13)

## Phase 3 — Content

- [x] P3-01 — Remaining weapons to ≥ 12 (Crossbow, Trident, Harming, Poison, Snowball, Fishing Rod, Lava Bucket, Blaze Rods, Axe, Shield, Lightning Rod) [haiku per weapon after framework] (deps: P2-14)
- [x] P3-02 — Enchantments & potions (≥ 10 passives, evolution needs first) (deps: P2-14)
- [x] P3-03 — Armor & sword tier tracks with sprite swapping + glint (deps: P2-14)
- [x] P3-04 — Evolutions (≥ 6) + gold card logic (deps: P3-01, P3-02)
- [x] P3-05 — Items (~8) incl. `Space` actives, second-item choice (deps: P2-14)
- [x] P3-06 — Remaining archetypes (`charger`, `summoner`, `healer`, `shielder`, `teleporter`, `flyer-diver`, `turret`) and enemies to ≥ 20 per confirmed roster (deps: P2-14)
- [x] P3-07 — Biomes Snowy Taiga + Desert (tiles, props, ice, cactus, lava) (deps: P2-14)
- [x] P3-08 — Interactables: ores, chests/locked chests, melons/pumpkins, beacon, campfire, anvil, enchanting table, traps (deps: P3-07)
- [x] P3-09 — Events: Raid, Golden Hour, Lost Villager, Wandering Trader (deps: P3-06)
- [x] P3-10 — Weather: Thunderstorm, Snowfall (deps: P3-07)
- [x] P3-11 — Nether rift: portal spawning, arena gen, 90 s fight, rewards/return (deps: P3-06)
- [x] P3-12 — Bosses Ravager, Wither, Warden + boss HP bar + boss theme hook (deps: P3-06)
- [x] P3-13 — Mini-bosses (4) + Charged mobs (deps: P3-06)
- [x] P3-14 — Win at 15:00 + Endless scaling + records (deps: P3-12)
- [x] P3-15 — `tools/balance_sim.ts` headless bot + `docs/BALANCE.md`; tune curves (deps: P3-14)
- [x] P3-16 — ⛔ CHECKPOINT 3 (deps: P3-01…P3-15)

## Phase 4 — Meta

- [x] P4-01 — `systems/economy`: run rewards, Spawn Egg / Rare Egg drops; tests (deps: P3-16)
- [x] P4-02 — `systems/gacha` data-driven banners, rates, ×10 guarantee, pity 60, dupes; tests (±1% over 1e6, pity) (deps: P3-16)
- [x] P4-03 — Spawner screen with cage animation, rarity flames, ×1/×10, skip (deps: P4-02)
- [x] P4-04 — Companions data: ≥ 15 pets, ≥ 10 allies, lore quips [haiku] (deps: P3-16)
- [x] P4-05 — Pets in run (lazy spring follow, buffs by level) (deps: P4-04)
- [x] P4-06 — Allies in run (AI, HP, downed/respawn, villager side frames, special roles) (deps: P4-04)
- [x] P4-07 — Heroes Alex & Rana with passives (deps: P3-16)
- [x] P4-08 — Permanent upgrades screen + effects (per hero + Leadership/Kennel) (deps: P4-01)
- [x] P4-09 — Collection screen (tabs, levels, equip) (deps: P4-04)
- [x] P4-10 — Run setup screen (hero, pet, allies) (deps: P4-05, P4-06, P4-07)
- [x] P4-11 — Settings screen (audio, graphics, controls remap, data export/import/reset) (deps: P2-12)
- [x] P4-12 — First-run tutorial overlay (deps: P4-10)
- [x] P4-13 — ⛔ CHECKPOINT 4 (deps: P4-01…P4-12)

## Phase 5 — Polish & release

- [x] P5-01 — Music: themes in `data/music.ts` + sequencer (hub, plains, night, forest, taiga, desert, nether, boss, stings) (deps: P4-13)
- [x] P5-02 — Full SFX pass, volume sliders + mute persisted (deps: P5-01)
- [x] P5-03 — Title screen, hub live world background at dusk (deps: P4-13)
- [x] P5-04 — About/credits/legal screen, final `CREDITS.md` (deps: P4-13)
- [x] P5-05 — Service worker / offline (deps: P4-13)
- [x] P5-06 — GitHub Pages deploy workflow `.github/workflows/deploy.yml` (deps: P5-05)
- [x] P5-07 — Performance pass: 150 enemies at 60 FPS, quality tiers (deps: P4-13)
- [x] P5-08 — Save migration test with fixtures; README (English); docs complete (GDD matches game, DECISIONS complete) (deps: P5-01…P5-07)
- [x] P5-09 — Tag `v1.0.0` (the owner asked for continuous progress to the tag instead of a sign-off stop) (deps: P5-08)

## Phase 6 — v1.1 (owner feedback round; waves 0-4, details in `docs/DECISIONS.md`)

Feel and input
- [x] P6-01 — Tiny5 1-bit glyph-atlas text layer replaces Pixelify Sans (`ui/font.ts`, `drawText`/`wrapText`/`fitText`, damage-number cache)
- [x] P6-02 — Movement: render interpolation (`Loop` alpha, `prevX/rx`), acceleration/braking, integer camera with look-ahead, aim facing, distance-driven walk cycle, dust and footsteps
- [x] P6-03 — Hero ability framework (`src/abilities`, Q / Left Shift, HUD slot with cooldown, `abilityCd`/`abilityPower`) with Iron Resolve, Arrow Rain, Frog Leap (deps: P6-02)
- [x] P6-04 — `MergedInput`: gamepad (standard mapping) and touch (floating joystick, ability/item/pause buttons) beside the keyboard
- [x] P6-05 — Repository hygiene: `CLAUDE.md` and `.claude/` untracked and ignored, secrets patterns ignored, `.env.example`

World and content
- [x] P6-06 — Spatial biome map: 10 overworld biomes from a climate noise map, per-tile biome painting, "Entering" banner, `?biome=` debug start
- [x] P6-07 — 16x16 Minecraft-style block textures (21 materials), per-biome animated water and lava (deps: P6-06)
- [x] P6-08 — Voxel-style props per biome; gallery pages for props and block textures (deps: P6-06)
- [x] P6-09 — Per-biome rosters and danger (`data/rosters.ts`), 37 newly packaged mob sheets (35 enemy defs), contact slow, lobbed pools, turrets, charger rams; left-facing sprite fix, `?mobs=` gallery (deps: P6-06)
- [x] P6-10 — Ambient particles per biome, five new music themes (13 total) with biome-following `MusicDirector`, minimap with fog of war (M) (deps: P6-06)
- [x] P6-11 — 8 new playable heroes (Skeleton, Wandering Trader, Village Smith, Enderman, Witch, Illusioner, Piglin, Creeper) with kits, abilities and a sprite hero renderer (deps: P6-03)
- [x] P6-12 — Pets 15 → 30 and allies 10 → 22 with real effects and AI; portraits fit by atlas frame size
- [x] P6-13 — Balance tooling: bot can start in any biome, `BAL_BIOMES=1` per-biome table; re-run recorded in `docs/BALANCE_RESULTS.md` (deps: P6-09)

Accounts
- [x] P6-14 — `src/net`: auth, cloud save with revision/conflict handling, leaderboards, Firebase backend plus in-memory twin, Firestore rules and indexes, `docs/FIREBASE_SETUP.md`, deploy workflow variables (`VITE_FIREBASE_*`)
- [x] P6-15 — Accounts UI: Profile and Ranking canvas screens, DOM auth/nickname dialogs, cloud status wired into the app (deps: P6-14)

Meta and UI
- [x] P6-16 — Tabbed Settings with accessibility (colour-blind cue palettes, reduce flash, text size 2x for HUD and dialogs, camera look-ahead, touch mode) applied in game
- [x] P6-17 — Missions (27 daily / 12 weekly templates, rerolls), 7-day daily reward, 55 achievements, run statistics and a detailed Results screen, toast queue
- [x] P6-18 — Title logo, hub, collection, run setup (with start biome), upgrades and Spawner redesigned in inventory style; version bumped to 1.1.0

Hardening
- [x] P6-19 — Keyboard and gamepad navigation on every canvas screen (`PadNav`, focus rings), Spawner layout down to 213x120, minimap touch toggle, two-step save import
- [x] P6-20 — Two independent reviews (gameplay/performance and security) and their fixes (see Checkpoint 6)
- [x] P6-21 — Docs refresh: README, GDD, CHECKPOINTS (Checkpoint 6), TASKS, CREDITS
- [ ] P6-22 — ⛔ Owner sign-off of v1.1, merge to `main`, tag `v1.1.0` (deps: P6-21)

Not verified yet (carried from Checkpoint 6)
- [ ] P6-23 — Try accounts, cloud save and leaderboards against a real Firebase project with a real Google login; test the Firestore rules in the emulator
- [ ] P6-24 — Play with a real gamepad and on a real touch device; listen to the new music themes and stings
- [ ] P6-25 — Measure performance on real hardware (the headless runs are software-rendered and vsync-capped)

Deferred
- [ ] P6-26 — Online co-op (next milestone, not started)
- [ ] P6-27 — Firebase App Check (reCAPTCHA v3) and an in-game "delete account" button
- [ ] P6-28 — Content-Security-Policy for the page
- [ ] P6-29 — Hot-path allocation pooling (`Fx` objects, `collide()` results)
- [ ] P6-30 — Generated or hand-drawn art for the new heroes (needs walk/attack/hurt/death frames and a pixel-art cleanup; the single generated still was not shipped)
- [ ] P6-31 — Refresh `docs/BALANCE.md` and re-tune toward the 10:00 Wither target (the last simulator run reaches few bosses) and the newbie median (2:51, below the 4-6 minute target)

## Phase 7 — v1.4 (structures, the End, manual aim; details in `docs/DECISIONS.md`, evidence in Checkpoint 7)

Input
- [x] P7-01 — Optional manual aim: `settings.aim` (auto / manual), mouse, right stick and touch aim stick, reticle, 1.5 s fall-back to auto-aim (`core/aim.ts`, no save version bump)

World structures
- [x] P7-02 — Structure framework: stamps, deterministic placement, walls as collision, pathing around walls, overlay painting, `poiMarkers`, `?struct=` debug start
- [x] P7-03 — Village (services, crops, chest, Iron Golem) and Desert Temple (TNT plate trap, four chests)
- [x] P7-04 — Jungle Temple (tripwires, lever puzzle, ranged-weapon chest), Trial Chamber (sealed wave, key, Vault), Pillager Outpost (Captain, cage, Bad Omen), Witch Hut (cauldron, Black Cat)
- [x] P7-05 — Village raid (three waves) and the Hero of the Village effect with its legendary chest; HUD tags Bad Omen / Hero / Regen
- [x] P7-06 — Structure stats, 4 achievements (Jungle Raider, Trial Passed, Village Defender, Witch's Brew) and the daily mission "Open 3 structure chests"
- [x] P7-07 — Minimap icons for explored structures (shaped, colour-blind-safe), the End portal marker; the raid achievement renamed to Village Defender (unique achievement names are tested)

The End
- [x] P7-08 — Warden opens a permanent End portal (the win is unchanged); the End dimension, void rule and Totem exception
- [x] P7-09 — Ender Dragon (three phases), End Crystals, Dragon Egg, exit portal, final victory scroll and `THE END` Results; `?end`, `?endportal`, `?dragon=` debug starts
- [x] P7-10 — Dragon Slayer and The End? achievements, weekly mission "Defeat the Ender Dragon", `end` music theme, procedural (code-drawn) art for the End

Docs
- [x] P7-11 — README, GDD, CHECKPOINTS (Checkpoint 7), TASKS, CREDITS (code-drawn End and structure art, nothing AI-generated), About screen "Art" entry and pagination
- [ ] P7-12 — Per-biome FPS table for v1.4 (lead's measurement, Checkpoint 7)
- [ ] P7-13 — ⛔ Owner sign-off of v1.4, version bump (`GAME_VERSION`), merge to `main`

Not verified yet (carried from Checkpoint 7)
- [ ] P7-14 — Listen to the End theme and the new sound cues; play the dragon fight and the Trial Chamber wave as a human; play a full 15-minute run into the End and the final victory
- [ ] P7-15 — Real gamepad and touch with manual aim and the structure interactions
- [ ] P7-16 — Fix or accept the known risks: damage over time bypassing the dragon's immunity, the untuned 2.5x HP multiplier, the Trial wave for humans, the Witch Hut not visibly on stilts

Deferred
- [ ] P7-17 — Online co-op (still the next milestone, not started)
- [ ] P7-18 — Baby Dragon pet (needs atlas art; the egg pays 1000 Emeralds meanwhile)
- [ ] P7-19 — Firebase App Check and a Content-Security-Policy (carried from P6-27 / P6-28)
- [ ] P7-20 — Hand-drawn art to replace the provisional code-drawn End and structure art
