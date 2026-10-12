# MineSurvive

Survive the night. Gear up. Collect every mob.

A browser bullet-heaven (horde survival) with a blocky, Minecraft-inspired look, roguelike runs and a gacha of companions. Vite + strict TypeScript + Canvas 2D, no runtime dependencies, installable and playable offline after the first load.

> Non-commercial fan project. Not affiliated with Mojang or Microsoft. Minecraft is a trademark of Mojang Synergies AB. See [CREDITS.md](CREDITS.md).

## Play

Open the deployed page (GitHub Pages) or run it locally:

```sh
npm ci
npm run dev        # http://localhost:5173
```

| Key | Action |
|---|---|
| WASD / arrows | Move |
| Space | Use the active item (or sprint with a Horse) |
| Esc / P | Pause |
| Mouse | Menus, aimed items |

All weapons fire automatically. Controls can be remapped in Settings.

## A run in one paragraph

Survive 15 minutes and defeat the Warden to win, or keep going in Endless. Collect XP gems, pick a card on every level-up (weapons, enchantments, armor and sword tiers, evolutions), fight bosses at 5:00 / 10:00 / 15:00, enter Nether rifts, trade with wanderers and rescue villagers. Runs pay Emeralds and Spawn Eggs: spend Emeralds on permanent upgrades and Eggs at the Spawner to collect heroes, pets and allies.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm test` | Vitest suite (rng, world, combat, weapons, bosses, saves, gacha, companions) |
| `npm run lint` | ESLint + Prettier check |
| `npm run balance` | Headless balance simulator, writes `docs/BALANCE_RESULTS.md` |

Debug URL parameters: `?run&debug&t=<sec>&seed=<n>&weapons=a,b,c&xp=<n>&hp=<n>&hero=alex&pet=cat&ally=wolf,horse&lv=3&portal&trader&villager`, `?gallery=<0|1>`, `?screen=collection|spawner|upgrades|settings|setup`. `F3` toggles the debug overlay.

## Project layout

```
src/core      loop, rng, input, canvas, atlas, audio, save (versioned SaveStore)
src/world     noise terrain, biomes, chunks, props, collision
src/entities  player, enemy, projectile, pickup, ally, fx
src/data      enemies, upgrades, tiers, items, companions, meta upgrades, music
src/systems   combat, AI, spawner, director, bosses, rift, npcs, gacha, allies, meta
src/weapons   one module per weapon (data-driven registry)
src/ui        router, hub and meta screens, HUD, overlays
tools         Python sprite pipeline (slicer, catalogue, atlas) and the balance bot
docs          BRIEF (spec), GDD, PLAN, TASKS, DECISIONS, CHECKPOINTS, BALANCE, ASSET_CATALOG
```

## Art pipeline

`assets-src/` holds the source sprite sheets (never edited). `tools/` (Python 3 + Pillow + numpy, tool-only) slices them, decodes the bitmap-font labels, writes `assets-src/manifest.json` and packs the shipped subset into `public/atlas/`. Terrain, props and icons are drawn in code.

## Saves

Progress lives in `localStorage` behind a versioned `SaveStore` with a migration chain; Settings can export, import and reset it. An unreadable or newer-version save is kept under `minesurvive.save.bak` and is never overwritten silently.

## Deploy

`.github/workflows/deploy.yml` lints, tests, builds and publishes `dist/` to GitHub Pages on pushes to `main` and on `v*` tags. The Vite `base` is `./`, so any Pages path works.
