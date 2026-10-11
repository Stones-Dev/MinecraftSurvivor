# MineSurvive — Plan (v1.0)

Status: draft for owner review, before Phase 0. Source of truth for scope is `docs/BRIEF.md`; this file is the *how*. Task breakdown lives in `docs/TASKS.md`.

---

## 1. Goals and hard constraints (recap)

- Browser bullet-heaven, Minecraft fan aesthetic, roguelike runs, meta-progression, companion gacha. 15:00 run to the Warden, then Endless.
- **Stack:** Vite + TypeScript strict + Canvas 2D. Runtime deps: none. Dev deps: `vite`, `vitest`, `eslint` (+ `typescript-eslint` config, see §9), `prettier`, `typescript`.
- **Static & offline:** GitHub Pages via Actions; service worker added in Phase 5. No runtime network calls.
- **Save:** `localStorage` behind `SaveStore` with versioned schema and migrations; cloud-pluggable later.
- **Input:** `InputSource` abstraction; PC keyboard + mouse in v1.0.
- **Rendering:** pixel-perfect (`imageSmoothingEnabled = false`), integer zoom (×3 default, ×2 on small viewports), letterboxed, 16 px tiles. All terrain/props/icons/UI art drawn in code; only character sprites come from the sheets.
- **Audio:** procedural Web Audio chiptune, original compositions only.
- **Perf:** 60 FPS with 150 enemies on screen on a 2020 laptop in Chrome.
- **Quality:** ESLint + Prettier clean, Vitest for pure logic.

---

## 2. Architecture

### 2.1 Directory layout

As in BRIEF §4, at the repo root (the repo *is* `minesurvive/`):

```
index.html
src/
  main.ts            boot → load atlases/fonts → screen router
  game.ts            run state machine (setup → playing ⇄ paused/levelup/rift → results)
  core/              loop, input, camera, rng, save, audio, i18n, settings, atlas, pixelart, events (tiny typed emitter)
  data/              pure data tables (heroes, companions, enemies, bosses, weapons, enchantments, potions,
                     items, upgrades, biomes, gacha, events, music)
  world/             noise, chunks, tiles, props, collision, pathing
  entities/          player, companion, enemy, boss, projectile, pickup, fx, vfx
  systems/           combat, spawner, levelup, evolution, events, portal, weather, daynight, economy, gacha
  ui/                screens/* and components/*; DOM overlays for menus, canvas for HUD
public/atlas/        generated atlases (*.png + *.json)
public/fonts/        bundled OFL pixel font + license
tools/               slice_sheets.py, build_atlas.py, balance_sim.ts
tests/               vitest
docs/                BRIEF, GDD, PLAN, TASKS, DECISIONS, ASSET_CATALOG, BALANCE
```

`assets-src/` is outside `public/` so Vite never ships it; `assets-work/` and `reference/` are gitignored.

### 2.2 Layering rules

- `data/` imports nothing but types. `core/` imports nothing from `world/`, `entities/`, `systems/`, `ui/`.
- `systems/*` contain logic that is testable without a canvas: they read/write plain state objects and receive an `Rng` stream. Rendering is a separate pass that only reads state.
- Every pure system that the brief asks to test (economy, gacha, damage/armor math, world-gen determinism, save migration, level-up offers) lives in a module with **no DOM access**, so it runs in Vitest and in `tools/balance_sim.ts` under Node.

### 2.3 Main loop

- Fixed-step simulation at **60 Hz** (`dt = 1/60`), accumulator capped at 5 steps per frame (no spiral of death); render once per `requestAnimationFrame` with interpolation alpha for camera only (entities snap to sim positions — at pixel scale interpolation is not visible enough to justify the complexity; revisit if motion looks juddery at 144 Hz).
- `Loop` exposes `timeScale` so the balance sim can run headless at N× without rendering.
- Pause on `visibilitychange`/blur.

### 2.4 Determinism and RNG

- `Rng` = xorshift128+ (or xoshiro128**) on 32-bit ints, seeded via splitmix32. `rng.fork(name)` derives independent streams from the run seed: `world`, `spawn`, `drops`, `levelup`, `ai`, `fx` (fx is cosmetic and may diverge).
- World generation never consumes a stream: it uses **stateless hashes** `hash2(x, y, seed + layerOffset)` so any chunk can be generated in any order (idea ported from pokesurvivor `world.js`, which offsets the seed per layer).
- Gacha: `rng(gachaSeed, pullIndex)` stateless per pull, so rates and pity are reproducible in tests. (pokesurvivor uses `Math.random()` here; we deliberately don't.)

### 2.5 Rendering pipeline

Layers (BRIEF §4): terrain chunks → ground decals (telegraphs, pools) → shadows → y-sorted entities + tall props → projectiles (drawn lifted with shadow) → VFX → weather → day/night tint + vignette → canvas HUD → DOM menus.

- Internal canvas at art resolution (viewport / zoom), drawn to the visible canvas with an integer scale; letterbox bars fill the remainder.
- **Chunk baking:** 16×16 tiles = 256×256 art px per chunk, painted into a `Uint32Array` view of `ImageData`, put on an `OffscreenCanvas`/canvas, LRU-cached (~48 images, ~400 data records — the pokesurvivor numbers, tuned later). Budget ≤ 4 ms per bake; at most 1–2 bakes per frame (queue), pre-bake the ring around the camera.
- **Biome crossfade:** 2.5 s, by drawing old and new chunk images with alpha during the fade (both cached).
- **Hit flash:** pre-baked white silhouettes per frame in the atlas build (never `ctx.filter`; pokesurvivor measured it ~95× slower). Red hurt tint generated at atlas build time when a sheet lacks hurt frames.
- Sprites face left/right only: a horizontal flip via `ctx.scale(-1,1)` around the feet origin.

### 2.6 World

- **Noise:** value noise + fbm (2 octaves to start) from hashes; separate fields for biome-local features (lakes, stone outcrops, dirt patches, groves, ore veins). Spawn area (radius ~9 tiles) is kept clear, features ramp in by distance (ported idea).
- **Biomes** are *time-based* (every 4 min), not spatial: the biome changes the palette and the feature/prop tables, and the world regenerates *visually* via crossfade. Chunk records are keyed by `(cx, cy, biomeId)`.
- **Tiles:** codes + flags (`blocks`, `slows`, `burns`, `breakable`, `slippery`, `water`). Procedural painters per tile kind with 8-neighbour autotiling (shore bands, wall faces, contact shadows — approach from `tiles.js`), Minecraft-look palettes per biome.
- **Props:** trees (oak/birch/spruce/dark oak/acacia/cactus), boulders, ores, chests, locked chests, tall grass/flowers, pumpkins/melons, interactables (beacon, campfire, anvil, enchanting table), traps. Placement requires a clear 3×3 floor. Prop sprites painted once per `(biome, type, variant)` and cached.
- **Collision:** entities are circles; terrain via tile flags; two-pass push-out against blocking tiles and solid props. Enemy projectiles are blocked by trees/boulders (cover).
- **Pathing:** BFS distance field over a (2R+1)² grid around the player (R ≈ 24–28 tiles), rebuilt every 200 ms into preallocated `Int16Array`/`Int32Array` buffers, 8-neighbour with corner-cutting check. Enemies with line of sight walk straight (LOS cached 200 ms per enemy); others step down the gradient. Flyers ignore the field.

### 2.7 Entities and combat

- Struct-of-objects with **pooled** entities (enemies, projectiles, pickups, fx) to avoid GC; `alive` flag + free lists.
- **Spatial hash** (cell ≈ 2 tiles) rebuilt every frame for enemies; used for targeting, separation, AoE and pickups.
- **Swept projectiles:** projectiles spawn at the shooter's centre; hit test is segment(prev→curr) vs circle using distance-to-segment² (pokesurvivor's fix for point-blank immunity). Pierce tracks a small set of already-hit ids. Unlike pokesurvivor, enemy projectiles are swept too (vs. the player and allies), since fast enemy shots would otherwise tunnel.
- **Targeting:** touching enemies first for melee; ranged prefers boss in range, then nearest; then breakable props.
- **Damage model:** `final = base × mods × 100 / (100 + armor)`; status effects (burn, poison, wither, slow, freeze, stun, levitate) as timed components with stacking rules defined in `systems/combat.ts`.
- **Enemy AI:** data-driven archetypes (`chaser`, `ranged-kiter`, `charger`, `kamikaze`, `splitter`, `summoner`, `healer`, `shielder`, `teleporter`, `flyer-diver`, `turret`) composed from small behaviour steps; every damaging special goes through a `Telegraph` (ground shape, ≥ 0.6 s) first. Bosses are scripted pattern lists with phase thresholds (enrage < 50%).
- **Spawner:** a continuous trickle (rate rising with time) plus tides every ~45 s (random 38–56 s, one arc of the spawn ring), spawn points on a ring just outside the view and rejected if blocked; soft cap 64 (40 on low), and spawns once the count is ≥ ~85% of the cap become Elites; enemies unseen for > 2.5 s while the player runs away (or very far) are teleported ahead of the player's velocity — all ideas from pokesurvivor `spawner.js`/`enemy.js`, constants re-tuned with our sim; per-run cast of ~6 enemy types per tier drawn from the `spawn` stream; tide ×0.25 during bosses; night ×1.4. HP/dmg curves from BRIEF §15.

### 2.8 Hero gearing

`hero.<name>.<armor>.<weapon>.<anim>` resolved by an `Animator` that takes `(hero, armorTier, swordTier, anim)` and falls back gracefully (e.g. no walk → idle + 2 px bob; no sword yet → `punch`). Armor and sword tiers are run state; changing them swaps the frame set with a short glint VFX.

### 2.9 Meta, save and gacha

- `SaveStore` interface: `load(): SaveData`, `save(data)`, `migrate(raw): SaveData`, plus `export()/import(json)`. `LocalSaveStore` implements it; writes debounced. `SaveData.saveVersion` starts at 1; `migrations: Record<number, (old) => new>` applied in order, each one unit-tested.
- Save v1 content (fixed now because it's expensive to change): `saveVersion`, `createdAt`, `gachaSeed`, `pullCount`, `pity` (per banner id), `currencies {emeralds, spawnEggs, rareSpawnEggs}`, `owned` (companion/hero id → `{level, shards, obtainedAt}`), `loadout {hero, pet, allies[]}`, `upgrades` (per hero + account-wide), `records` (best time, kills, wins per hero), `settings`, `flags` (tutorialDone…).
- Gacha: banners are data (`data/gacha.ts`: id, name, pool, rates, ten-pull guarantee, pity). v1.0 rates: C 50 / U 28 / R 15 / E 5.5 / L 1.5; ×10 guarantees ≥ 1 Rare; Legendary at 60 pulls; duplicates level 2–5 at 1/2/3/4 dupes, extra → Emeralds. Pull logic is pure and returns a result list; the Spawner screen only animates it.
- Economy formulas (run reward, drops) in `systems/economy.ts`, pure and tested.

### 2.10 UI

- Menus are DOM overlays styled with CSS (pixel font, 2-px bevel panels, Minecraft-ish but original buttons) and code-drawn icons injected as data-URL images; the in-run HUD is drawn on canvas.
- Screen router with a stack (`push/pop/replace`) so pause/level-up overlay the run.
- i18n: every string through `t('key')` with an English table only.

### 2.11 Audio

Small synth: square/triangle/noise voices, ADSR, delay/reverb send, master/music/SFX gains. Sequencer reads note arrays (tempo, swing, patterns) from `data/music.ts`; themes share a motif, re-harmonised per biome/night. SFX voice caps and minimum spacing (pokesurvivor learned this). Audio context unlocked by the title-screen click.

---

## 3. Asset pipeline

```
assets-src/*.png ──slice_sheets.py──▶ assets-work/<sheet>/{sections/NNN/{label.png,frame_k.png}, contact_<p>.png, sections.json}
                                         │
                       (Claude reviews contact sheets, assigns ids)
                                         ▼
                              assets-src/manifest.json
                                         │
                              build_atlas.py (frames used by the game, 1 px padding,
                              ≤ 4096² power-of-two pages, + white-flash & red-hurt variants)
                                         ▼
                              public/atlas/atlas_<n>.png + atlas.json
```

- **Slicer** (Python 3 + Pillow 12, already available in this environment): segment sections as connected regions of `rgb(121,230,234)`; find the label bar (`rgb(20,58,60)`) directly above each section and crop it; split cells on the 1-px separator `rgb(55,177,182)`; trim each cell to sprite bounds but keep the cell origin = (horizontal centre, cell bottom). Outputs as in BRIEF §3.3. Deterministic section numbering (top-to-bottom, left-to-right) so manifest references are stable.
- **Manifest** entries: `{ id, sheet, section, frames?: number[], fps, loop, tags }` — `frames` optional subset/order override. Validated by a small TS/py schema check.
- **Atlas JSON:** `{ version, pages: [file], frames: { "<id>#<k>": {page, x, y, w, h, ox, oy} }, anims: { "<id>": {frames: [...], fps, loop} } }`. Flash/hurt variants as `<id>#<k>@flash` / `@hurt`.
- Atlas size check: warn and ask if total > ~5 MB (BRIEF §0.5).
- Since the sheets are huge (enemies.png is 20 631 px tall) the slicer works on the full image in numpy-free Pillow ops; if it's too slow we'll consult the owner before adding numpy.

---

## 4. Ported from pokesurvivor (ideas only, rewritten in TS)

| Idea | Reference file | Notes |
|---|---|---|
| Chunked infinite world, per-layer seed offsets, value-noise fbm, clear spawn ring | `js/world/world.js` | 16×16 chunks, LRU caches |
| Packed-pixel chunk painting, 8-neighbour autotiling, shore bands, prop sprite cache | `js/world/tiles.js` | our palettes are Minecraft-style |
| Char-map pixel icons with outline, cached canvases/data URLs | `js/ui/icons.js` | |
| BFS distance field around player, LOS shortcut | `js/systems/pathing.js` | rebuild 200 ms (theirs 350 ms) |
| Spatial grid rebuilt per frame | `js/systems/combat.js` | |
| Swept segment-vs-circle projectile hits, spawn at centre | `js/systems/combat.js` (`segDist2`) | fixes point-blank immunity |
| Tides, cap → elites, despawn-behind/respawn-ahead, per-run cast per tier | `js/systems/spawner.js`, `GDD.md` | |
| Boss phases with telegraphs, tides ×0.25 during boss, enrage < 50% | `js/entities/enemy.js`, `GDD.md` | our bosses are fixed (Ravager/Wither/Warden) |
| Rarity rolls, ten-pull guarantee, pity counter reset on top rarity | `js/systems/gacha.js` | ours is seeded and data-driven |
| White-silhouette hit flash instead of `ctx.filter` | `GDD.md` | |
| Audio unlock click, SFX voice caps | `GDD.md` | |

Not ported: Firebase/accounts/ranking/coop/net, type chart, shiny gacha roll.

---

## 5. Phase plan

Each phase ends at a ⛔ CHECKPOINT: stop, summarise, explain how to run it, list open decisions, wait for the owner.

| Phase | Deliverables | Exit criteria |
|---|---|---|
| **0 — Asset pipeline & skeleton** | Vite/TS/ESLint/Prettier/Vitest project; `docs/GDD.md`, `docs/DECISIONS.md`; slicer + contact sheets; `ASSET_CATALOG.md`; `manifest.json`; atlas builder; atlas loader + animator; screen router with empty screens; Steve idle rendered at ×3 pixel-perfect; CI lint/test workflow | `npm run dev` shows title → empty hub with Steve idling; `npm test`, `npm run lint` clean. **⛔ CHECKPOINT 0:** contact sheets, catalogue, proposed v1.0 roster |
| **1 — World & movement** | Noise world, chunks, Plains + Dark Forest tiles and props, collision, camera, hero walk + flip, day/night tint, F3 debug overlay; world-gen determinism tests | Walk around smoothly at 60 FPS; chunks bake within budget. **⛔ CHECKPOINT 1:** owner judges the tile look |
| **2 — Combat core** | Enemies (zombie, skeleton, spider, creeper, slime), spawner tides, spatial hash, swept collision, Sword + Bow + TNT, XP orbs, level-up cards, hurt/death, VFX, HUD, pause, results, records save; damage/levelup tests | A full playable (if short) run. **⛔ CHECKPOINT 2:** game feel review |
| **3 — Content** | Remaining weapons, ≥ 10 passives, tiers with sprite swap, evolutions, items, all enemies/archetypes, biomes 3–4, interactables, events, Nether rift + arena, weather, 3 bosses + 4 mini-bosses, Endless; `balance_sim.ts` + `docs/BALANCE.md` | DoD content counts met in-run; sim gives ~4–6 min for a new Steve. **⛔ CHECKPOINT 3** |
| **4 — Meta** | Emeralds/Spawn Eggs economy, Spawner gacha + animation, collection, pets + allies in run, Alex/Rana, permanent upgrades, run setup, settings, tutorial; gacha/economy/save tests | DoD player journey works end to end. **⛔ CHECKPOINT 4** |
| **5 — Polish & release** | Music/SFX pass, title, about/credits/legal, `CREDITS.md`, service worker, Pages deploy workflow, README, docs complete, perf pass (150 enemies), save migration test, tag `v1.0.0` | BRIEF §17 Definition of Done |

---

## 6. Testing strategy

- **Vitest (Node, no DOM):** rng (stream independence, reproducibility), world-gen determinism (same seed → same chunk hash; order-independence), damage/armor formula, status effects, level-up offer weights vs. luck, spawner curve math, economy reward formula, gacha (rates ±1% over 1e6 pulls, ten-pull guarantee, pity at 60, dupes → levels/Emeralds), save migrations (v1 fixtures → current).
- **Balance sim** (`tools/balance_sim.ts`, run with `vite-node`-free plain `tsc`/Node or `vitest`'s runner — see open question) for tuning; results in `docs/BALANCE.md`.
- **Manual/visual:** checkpoints; F3 overlay for FPS/chunks/entities; a `?debug` URL flag to spawn N enemies for perf testing.
- CI (GitHub Actions): `lint`, `typecheck`, `test` on every push; deploy workflow added in Phase 5.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Sheets are irregular (labelled sections, not a grid); separators may be missing or broken | Segment by colour regions, review contact sheets, allow manual overrides in the manifest (`frames`, crop fixes) |
| Roster in the brief doesn't match available sprites | Catalogue first; propose roster at Checkpoint 0; missing mobs → 1.1 |
| Atlas too big (7 huge sheets) | Ship only frames in the manifest; split atlases by usage (heroes / mobs / companions); ask before > 5 MB |
| Procedural tiles don't look good enough (owner disliked the Blocks sheet) | Iterate early at Checkpoint 1 with a tile gallery debug screen |
| 60 FPS with 150 enemies + chunk baking | Pools, spatial hash, baked chunks, bake queue, quality tiers, profile at end of Phases 2 and 5 |
| Scope (≥ 12 weapons, ≥ 20 enemies, 3 bosses…) | Data-driven weapons/enemies/archetypes so content is mostly tables |
| Determinism drift breaks the balance sim | All gameplay randomness through named streams; lint rule banning `Math.random` outside `core/rng` and `fx` |

---

## 8. Working method

- Spec-driven: BRIEF → PLAN/TASKS → implementation; `docs/GDD.md` kept in sync; every deviation logged in `docs/DECISIONS.md` (dated).
- Small conventional commits (`feat(world): …`), pushed to the working branch.
- **Subagents:** the owner allows Haiku subagents for planning and coding. The lead (Claude) keeps architecture, data formats, integration and review; Haiku agents get well-scoped mechanical tasks (boilerplate, data tables, procedural tile/icon drafts, unit tests for pure logic, catalogue grunt work). Every delegated result is reviewed and passes lint/typecheck/tests before commit. Tasks suitable for delegation are tagged `[haiku]` in `docs/TASKS.md`.

---

## 9. Open questions for the owner (before Phase 0)

1. **Python + Pillow for tools** (`slice_sheets.py`, `build_atlas.py`) as the brief says — fine as a tool-only dependency (not shipped)? Pillow 12 is available here.
2. **ESLint for TypeScript** needs `typescript-eslint` (parser + rules) on top of `eslint`. OK to add it as a dev dependency?
3. **Font:** *Pixelify Sans* (more readable, variable weights) or *Press Start 2P* (classic, wide)? Proposal: Pixelify Sans for UI text, bundled as WOFF2 with its OFL.
4. **Running `balance_sim.ts` in Node:** use Vitest's runner (no new dep) or allow `tsx`? Proposal: a Vitest "bench-style" entry, no new dep.
5. **Deploy URL:** GitHub Pages under `stones-dev.github.io/MinecraftSurvivor/` (Vite `base` = `/MinecraftSurvivor/`)?
