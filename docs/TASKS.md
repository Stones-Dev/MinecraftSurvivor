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
- [x] P5-04 — About/credits/legal screen, final `CREDITS.md` (sprite author names still pending from the owner) (deps: P4-13)
- [x] P5-05 — Service worker / offline (deps: P4-13)
- [x] P5-06 — GitHub Pages deploy workflow `.github/workflows/deploy.yml` (deps: P5-05)
- [x] P5-07 — Performance pass: 150 enemies at 60 FPS, quality tiers (deps: P4-13)
- [x] P5-08 — Save migration test with fixtures; README (English); docs complete (GDD matches game, DECISIONS complete) (deps: P5-01…P5-07)
- [ ] P5-09 — Tag `v1.0.0` after owner sign-off (deps: P5-08)
