# MineSurvive

Survive the night. Gear up. Collect every mob.

A browser bullet-heaven (horde survival) with a blocky, Minecraft-inspired look, roguelike runs and a gacha of companions. Vite + strict TypeScript + Canvas 2D, installable and playable offline after the first load. The only runtime dependency is the Firebase SDK, which is loaded lazily and only when a deployment is configured for cloud accounts (see [Accounts and cloud save](#accounts-and-cloud-save-optional)).

> Non-commercial fan project. Not affiliated with Mojang or Microsoft. Minecraft is a trademark of Mojang Synergies AB. See [CREDITS.md](CREDITS.md).

Status: version 1.1.0 (in the game's About screen). v1.1 is on a work branch; it has not been signed off by the owner and is not merged to `main` yet (see `docs/CHECKPOINTS.md`, Checkpoint 6).

## Features

- **A spatial world.** 10 overworld biomes laid out on a climate map (Plains around the spawn, then Forest, Dark Forest, Snowy Taiga, Desert, Badlands, Swamp, Jungle, Cherry Grove, Mushroom Fields) plus the Nether rift arena. 16x16 block textures, animated water and lava, voxel-style props, ambient particles, a music theme and a mob roster per biome.
- **11 heroes with an active ability (Q).** Steve, Alex and Rana use the layered armor/sword sprites; Skeleton, Wandering Trader, Village Smith, Enderman, Witch, Illusioner, Piglin and Creeper play from mob/NPC sprite sets. Each has a passive and an ability whose rank grows with hero shards.
- **30 pets and 22 allies** from the Spawner (gacha) with levels 1-5, per-level buffs and real in-run effects; permanent upgrades bought with Emeralds.
- **Runs:** 14 weapons with evolutions, 24 passives, visible armor and sword tiers, items, interactables, events (raids, thunderstorms, Golden Hour, trader, lost villager), the Nether rift, three bosses (5:00 / 10:00 / 15:00) and Endless mode after the Warden. The Warden also opens a permanent End portal: the optional final fight against the Ender Dragon (v1.4).
- **Meta:** daily and weekly missions, achievements, a 7-day daily reward, run statistics and a detailed results screen, profile and ranking screens.
- **Accounts (optional):** guest, local profile, or a Firebase account (Google or email) with cloud save and global leaderboards. Without Firebase everything works locally.
- **Minimap (M)** with fog of war, biome colours and markers.
- **Input:** keyboard, touch (floating joystick plus ability, item and pause buttons) and gamepad, all usable in menus too.
- **Accessibility:** colour-blind cue palettes (protanopia, deuteranopia, tritanopia), reduce-flash mode, text size 2x for the in-run HUD and account dialogs, camera look-ahead toggle, touch controls auto/on/off, remappable keys.
- **Pixel-perfect text and movement:** a 1-bit glyph atlas of the Tiny5 font, render interpolation, acceleration/braking and an integer-snapped camera.

## Play

Open the deployed page (GitHub Pages) or run it locally:

```sh
npm ci
npm run dev        # http://localhost:5173
```

| Input | Action |
|---|---|
| WASD / arrows | Move |
| Q / Left Shift | Hero ability |
| Space | Use the active item (or sprint with a Horse) |
| M | Toggle the minimap (tapping or clicking the map does the same) |
| Esc / P | Pause |
| F3 | Debug overlay |
| Mouse | Menus, aimed abilities and items |
| Gamepad (standard mapping) | Left stick / d-pad move, A item, X or RB ability, Start pause, B back |
| Touch | Floating joystick on the left, ability / item / pause buttons |

Menus work without a mouse: arrows or d-pad move the focus ring, Enter or A presses, Q / E or LB / RB switch tabs, Esc or B goes back. All weapons fire automatically. Movement, pause, item and ability keys can be remapped in Settings.

## A run in one paragraph

Survive 15 minutes and defeat the Warden to win, or keep going in Endless. Collect XP gems, pick a card on every level-up (weapons, enchantments, armor and sword tiers, evolutions), use your hero's ability, fight bosses at 5:00 / 10:00 / 15:00, enter Nether rifts, trade with wanderers and rescue villagers. Runs pay Emeralds and Spawn Eggs: spend Emeralds on permanent upgrades and Eggs at the Spawner to collect heroes, pets and allies. In the run setup you can pick the biome you start in.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm test` | Vitest suite (rng, world, biomes, combat, weapons, abilities, bosses, saves, gacha, companions, meta, net, UI logic, accessibility) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint + Prettier check |
| `npm run format` | Prettier write |
| `node tools/dev-save-fixture.mjs` | Prints a DevTools-console snippet that seeds `localStorage['minesurvive.save']` with a rich save (5000 Emeralds, 50 + 20 eggs, several heroes / pets / allies) and reloads; `--key minesurvive.save.<uid>` for a cloud account |
| `npm run balance` | Headless balance simulator, writes `docs/BALANCE_RESULTS.md` (`BAL_BIOMES=1` adds the per-start-biome table) |

## Debug URL parameters

Most of these only work together with `debug`, and debug runs never touch the save or the leaderboard.

- Run: `?run&debug&t=<sec>&seed=<n>&weapons=a,b,c&xp=<n>&hp=<n>&hero=alex&pet=cat&ally=wolf,horse&lv=3&kennel=<n>&biome=<biome id>&portal&trader&villager`
- The End: `?run&debug&end[&dragon=<hp percent>][&t=960]` starts inside the End (the Ender Dragon at that percent of its HP: 100 = phase 1, 70 = phase 2, 30 = phase 3 perched, `0` = it is already dying: XP shower, Dragon Egg, exit portal); `?run&debug&endportal` opens the overworld End portal next to the hero. `t=960` gives the dragon its real minute-16 HP and damage (the default `t=0` makes it weak)
- World structures: `?run&debug&struct=village|desert_temple[&structAt=door|in|mid][&seed=<n>]` starts next to the nearest one (in front of its door by default, just inside, or in its middle; `seed=11` is a desert village, `seed=1` a desert temple)
- Stress test: `?crowd=<n>` (with `?run&debug`; half of the mobs come from the start biome's own roster)
- Galleries: `?gallery=<page>` (prop pages per biome, then block-texture pages), `?mobs=<biome|new|all>[:page]` (every mob walking left and right)
- Screens: `?screen=collection|spawner|upgrades|settings|setup|about|profile|ranking|missions|achievements`, and `results` together with `debug`
- Menu backdrop: `?menubiome=<biome id>` (default `plains`, unknown ids fall back to it; only the first menu opened reads it)
- Accounts demo: `?cloud=memory&debug` runs an in-memory backend that fakes Google/email accounts, nicknames, cloud saves and leaderboards inside the browser
- `F3` toggles the debug overlay.

## Project layout

```
src/core       loop, rng, input (keyboard, gamepad, touch, merged), canvas, camera, atlas, audio, music, save (versioned SaveStore), settings, accessibility
src/world      spatial biome map, biomes, noise terrain, 16x16 block textures (blocks), per-tile painting, props and prop sprites, chunks, collision
src/entities   player, enemy, projectile, pickup, ally, fx
src/data       enemies, rosters (per-biome spawn pools), upgrades, tiers, items, companions (heroes, pets, allies), heroKits, meta upgrades, missions, achievements, music
src/systems    combat, AI, spawner, director, bosses, rift, npcs, gacha, allies, meta, missions, achievements, run stats, economy
src/abilities  one module per hero ability (data-driven registry, like weapons)
src/weapons    one module per weapon (data-driven registry)
src/net        accounts, cloud save, leaderboard; Firebase and in-memory backends behind one interface
src/render     entity drawing and ambient particles
src/ui         router, hub and meta screens, HUD, minimap, text layer (font), overlays, account dialogs
tests          Vitest suites (see `npm test`)
tools          Python sprite pipeline (slicer, catalogue, atlas), the balance bot, the screenshot helper
docs           BRIEF (spec), GDD, PLAN, TASKS, DECISIONS, CHECKPOINTS, BALANCE, BALANCE_RESULTS, FIREBASE_SETUP, ASSET_CATALOG
```

## Art pipeline

`assets-src/` holds the source sprite sheets (never edited). `tools/` (Python 3 + Pillow + numpy, tool-only) slices them, decodes the bitmap-font labels, writes `assets-src/manifest.json` and packs the shipped subset (`tools/ship_*.json` lists plus the v1.0 defaults) into `public/atlas/`. Terrain, block textures, props and icons are drawn in code. No AI-generated art is included.

## Accounts and cloud save (optional)

Accounts, cloud saves and leaderboards use Firebase (Authentication + Cloud Firestore) straight from the browser. Nothing is required: a build without Firebase settings plays fully offline with guest and local profiles.

- Step-by-step setup, security rules, privacy notes and a hardening checklist: [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md).
- Local development: copy `.env.example` to `.env.local` (gitignored) and fill in `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` and optionally `VITE_FIREBASE_MESSAGING_SENDER_ID`. These are public web-app identifiers, not secrets.
- Deployment: set the repository **Variables** (not secrets) `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID` and optionally `FIREBASE_MESSAGING_SENDER_ID` under Settings > Secrets and variables > Actions > Variables; the deploy workflow passes them to the build as `VITE_FIREBASE_*`. If a required value is missing, the build has no cloud features.
- Verification status: the cloud logic is covered by unit tests against an in-memory backend that mirrors the security rules. It has not been tried against a real Firebase project or a real Google login yet.

## Saves

Progress lives in `localStorage` behind a versioned `SaveStore` (save version 2) with a migration chain from the v0 prototype and v1 saves. Settings can export, import and reset it; an import needs a second confirming click and keeps the replaced save under `minesurvive.save.pre-import.bak`. An unreadable or newer-version save is kept under `minesurvive.save.bak` and is never overwritten silently. With a cloud account the save is also mirrored to Firestore, with revision checks and a conflict dialog.

## Deploy

`.github/workflows/deploy.yml` lints, tests, builds and publishes `dist/` to GitHub Pages on pushes to `main` and on `v*` tags. The Vite `base` is `./`, so any Pages path works.

## Next milestone

Online co-op (not started).
