# MineSurvive — v1.0 build brief for Claude Code

You are the lead engineer and technical designer of **MineSurvive**, a browser bullet-heaven / horde-survival game (Vampire Survivors / Survivor.io style) with a Minecraft fan aesthetic, a roguelike layer and a **gacha of companions**. The reference game is **pokesurvivor.com** (open source, MIT; clone it read-only for reference with `git clone --depth 1 https://github.com/JPTER78/pokesurvivor reference/pokesurvivor` — `reference/` is gitignored; if the clone fails, ask me for a copy). This brief is the spec. Work spec-driven: read everything first, produce a plan and a task list, then implement phase by phase, stopping at the checkpoints marked **⛔ CHECKPOINT**.

The game's language is **English** (UI, data, code, comments, docs). Talk to me (the owner) in **Spanish** in chat.

---

## 0. Working agreement

1. **Read first.** Before writing any code: read this brief end to end, skim `reference/pokesurvivor/GDD.md` and `README.md`, and look at `reference/pokesurvivor/js/world/`, `js/systems/spawner.js`, `js/systems/gacha.js`, `js/entities/enemy.js`. You may **port algorithms and ideas** from pokesurvivor (chunked world, spatial grid, swept projectile collision, spawner tides, boss schedule, pity system). Do **not** copy its code wholesale: we rewrite in TypeScript with English identifiers and our own architecture.
2. **Plan → tasks → implement.** Produce `docs/PLAN.md` (architecture + phase plan) and `docs/TASKS.md` (checkbox list with dependencies) before Phase 0 code. Keep `docs/GDD.md` as the living design doc (start by copying the design sections of this brief, then update it whenever a decision changes) and `docs/DECISIONS.md` as a dated decision log.
3. **Checkpoints.** At each ⛔ CHECKPOINT, stop, summarise what was built, show me how to run/see it, list the open decisions, and wait for my answer. Do not continue past a checkpoint on your own.
4. **Decisions.** When something is ambiguous and not covered here, pick the simplest option that keeps the game fun, write it in `docs/DECISIONS.md`, and mention it at the next checkpoint. Only stop mid-phase for decisions that are expensive to reverse (data formats, save schema, asset pipeline).
5. **Small commits**, conventional messages (`feat(world): …`, `fix(combat): …`). Never commit generated atlases larger than ~5 MB without asking.
6. **Quality bar**: TypeScript strict, ESLint + Prettier, Vitest for pure logic (economy, gacha, type/damage math, world generation determinism, save migration). Target 60 FPS with 150 enemies on screen on a 2020 laptop (Chrome). No runtime network calls.

---

## 1. Game identity

- **Title:** MineSurvive. Tagline: *Survive the night. Gear up. Collect every mob.*
- **Genre:** bullet-heaven / horde survival + roguelike run structure + meta-progression + gacha collection.
- **Camera:** 2D top-down open world (like pokesurvivor), but all character sprites are **side-view** (Deltarune battle style), so entities face left/right only (flip horizontally); movement is 8-directional on the ground plane.
- **Signature twist #1 — visible gearing:** the hero's armor and sword tiers are real in-run upgrades and **change the sprite** (No armor → Leather → Chainmail → Iron → Gold → Diamond → Netherite → Enchanted; sword Wood → Stone → Iron → Gold → Diamond → Netherite → Enchanted). You *see* yourself getting stronger.
- **Signature twist #2 — companions from the gacha:** **Pets** (follow you, passive buffs), **Allies** (fight next to you, chosen at run start) and **Heroes** (playable characters). Duplicates level companions up.
- **Mood:** cosy pixel-art Minecraft fan vibe by day, tense at night. No gore, no blood (hurt = red flash frames, which the sheets already have).
- **Non-commercial fan game.** Show a legal notice: not affiliated with Mojang/Microsoft; Minecraft is a trademark of Mojang Synergies AB; sprites credited to their authors (see §3.5). No real-money anything. Never use official Minecraft textures, music or sounds.

---

## 2. Hard constraints

- **Stack:** Vite + TypeScript (strict) + Canvas 2D. No game framework, no React. Minimal deps (allowed: `vite`, `vitest`, `eslint`, `prettier`, `typescript`; ask before adding anything else).
- **Everything local & static:** deployable to GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`). Works offline after first load (simple service worker, add at the end).
- **Save data:** `localStorage` behind a `SaveStore` interface (`load/save/migrate`, versioned schema `saveVersion`, JSON). Design it so a cloud backend can be plugged in later without touching game code. No accounts in v1.0.
- **Platform:** PC first (keyboard + mouse). Input goes through an `InputSource` abstraction (`moveVector`, `pause`, `confirm`, `cancel`, pointer events) so a touch joystick can be added in 1.1 without changes to gameplay. Layout must be responsive (16:9 to 21:9 and down to 4:3; canvas letterboxed with integer pixel scaling).
- **Pixel-perfect rendering:** `imageSmoothingEnabled = false`, integer zoom, everything drawn at the art resolution then scaled. World tile = 16 px of art. Default zoom ×3 (auto ×2 on small viewports).
- **The `Blocks` sprite sheet is NOT used.** All terrain, obstacles, items, icons and UI pixel art are **drawn in code** (procedural pixel art with fixed palettes, cached to offscreen canvases) in the Minecraft look (grass top, dirt, stone, sand, snow, water, lava, netherrack, oak/birch/spruce trees, ores, chests, torches, XP orbs, emeralds, spawn eggs, hearts…). Look at `reference/pokesurvivor/js/world/tiles.js` and `js/ui/icons.js` for the approach.
- **Fonts:** one OFL pixel font (e.g. *Pixelify Sans* or *Press Start 2P*), bundled locally.
- **Audio:** procedural Web Audio synth (chiptune) for music and SFX, no audio files. Compose original themes (see §14). Nothing from Minecraft.

---

## 3. Assets and the Phase 0 sprite pipeline

### 3.1 What you receive (`assets-src/`)

Seven PNG sheets in `assets-src/`, "Deltarune battle-style" customs (the Villagers sheet is "Undertale overworld-style" and is 4-directional; it is used for hub NPCs and for the Villager allies):

| Sheet | Size | Content |
|---|---|---|
| `steve.png` | 2305×7326 | Steve: No armor / Leather / Chainmail / Gold / Iron / Diamond / Netherite / Enchanted. Per armor: Idle (4f), Idle talking, Punch (3f), Idle (sword) per sword tier (Wood/Stone/Gold/Iron/Diamond/Netherite/Enchanted), Sword swing per tier (4f), bow/axe/other weapon poses further down. |
| `alex.png` | 2289×7331 | Same layout as Steve. |
| `rana.png` | 1985×6393 | Same layout, a custom character with a frog hat. Third hero, treat as an original character named **Rana**. |
| `enemies.png` | 3010×20631 | Hostile mobs, many variants, each with walk/attack/hurt (red) frames. Catalogue them. |
| `allies.png` | 2777×6483 | Wolves (variants/collars), horses (colors, armors), donkeys/mules, axolotls, snow golems, iron golems, cats, allays/vexes, and more. Catalogue them. |
| `animals.png` | 3613×12741 | Passive mobs (cow, pig, sheep, chicken, rabbit, fox, bee, frog, turtle, panda, goat, parrot…). Catalogue them. |
| `villagers.png` | 3684×6917 | Villagers by profession, 4-directional overworld style. |

Frame cells are roughly **22×30 px**. The sheets are **not a regular grid**: they are labelled sections.

### 3.2 Sheet structure (measured — use these exact colors)

- Sheet background: `rgb(39,116,119)`.
- Cell/section background: `rgb(121,230,234)`.
- Cell separator lines (1 px): `rgb(55,177,182)`.
- Label bars (dark boxes with pixel text above each section): `rgb(20,58,60)` background with light text.
- Sprites sit inside cells; hurt frames are red-tinted copies.

### 3.3 Slicer tool (`tools/slice_sheets.py`, Python 3 + Pillow)

1. Flood/segment every sheet into **sections** = connected regions of cell-background color (ignore the sheet background). Each section has a label bar directly above it; crop the label bar as a small PNG so a human can read it (no OCR needed).
2. Inside a section, split into **cells** using the separator color; trim transparent/background margins of each cell to get the sprite bounds, but **keep the cell's baseline**: record for every frame `x, y, w, h, originX, originY` where origin = horizontal centre of the cell and the **bottom** of the cell (the feet anchor). All frames of one section share the same origin convention so animations don't jitter.
3. Output `assets-work/<sheet>/sections/<nnn>/` with `label.png`, `frame_<k>.png`, and `assets-work/<sheet>/contact_<page>.png` contact sheets (sections numbered, frames numbered, scaled ×2, with the label image next to each row). These are for human/AI review.
4. Produce `assets-work/<sheet>/sections.json` with the raw geometry.

### 3.4 Catalogue and manifest

Using the contact sheets, **you** (Claude Code, using image reading) assign each section a semantic id: `assets-src/manifest.json` entries like

```json
{ "id": "hero.steve.iron.sword_diamond.swing", "sheet": "Steve", "section": 143, "fps": 10, "loop": false, "tags": ["hero","steve","armor:iron","sword:diamond","anim:swing"] }
{ "id": "mob.creeper.walk", "sheet": "Enemys", "section": 12, "fps": 8, "loop": true, "tags": ["enemy","creeper","anim:walk"] }
```

Naming scheme: `hero.<name>.<armor>.<weapon>.<anim>`, `mob.<name>[.<variant>].<anim>`, `ally.<name>[.<variant>].<anim>`, `pet.<name>[.<variant>].<anim>`, `npc.<name>.<dir>.<anim>`. Anim vocabulary: `idle, walk, attack, hurt, death, special, talk`. If a mob lacks a walk animation, reuse idle with a bob. If it lacks hurt frames, generate a red tint at runtime.

Then `tools/build_atlas.py` packs the frames used by the game into a few power-of-two atlases (`public/atlas/*.png` + `*.json`, max 4096×4096) with 1-px padding. The game only loads atlases. Keep `assets-src/` and `assets-work/` out of the shipped bundle.

Write `docs/ASSET_CATALOG.md`: one table per sheet listing every mob/animal/ally/villager found, frame counts, and which are used in v1.0. **Unused sprites are fine** — catalogue everything, ship what v1.0 needs.

**⛔ CHECKPOINT 0** — after the catalogue: show me the contact sheets, the catalogue table and your proposed v1.0 roster (enemies, bosses, pets, allies) based on what actually exists in the sheets. I will confirm the roster before Phase 1. (The design below assumes a roster; adapt it to the real sprites and flag what's missing as 1.1.)

### 3.5 Credits

The sheets are fan customs from The Spriters Resource–style contributors (the Blocks sheet is signed "AerospaceGoat35" and is not used). Create `CREDITS.md` with the author names you can read on the sheets (or that I provide at Checkpoint 0), plus the font license. Show credits in Settings → About.

---

## 4. Architecture

```
minesurvive/
  index.html                 single page, canvas + DOM overlays for menus
  src/
    main.ts                  boot, asset loading, screen router
    core/        loop (fixed 60 Hz sim, variable render), input, camera, rng (seeded, xorshift),
                 save (SaveStore + migrations), audio (synth engine, sequencer), i18n (en only, but keyed),
                 settings, atlas (sprite lookup, animators), pixelart (procedural drawing helpers)
    data/        heroes.ts, companions.ts (pets+allies), enemies.ts, bosses.ts, weapons.ts,
                 enchantments.ts, potions.ts, items.ts, upgrades.ts, biomes.ts, gacha.ts, events.ts, music.ts
    world/       noise, chunks (16×16 tiles, baked to ImageData per visible chunk), tiles (procedural tiles),
                 props (trees/ores/chests/interactables), collision, pathing (BFS distance field around player)
    entities/    player, companion, enemy, boss, projectile, pickup, fx, vfx (procedural attack sprites)
    systems/     combat (targeting, damage, knockback, status effects), spawner (tides, caps, elites),
                 levelup (card offers), evolution, events, portal (Nether rift), weather, daynight, economy, gacha
    ui/          screens: title, menu(hub), play-setup, run-hud, pause, levelup, results, collection, gacha,
                 upgrades, settings, about; components: pixel buttons, panels, tooltips, icons (code-drawn)
    game.ts      run state machine
  public/atlas/  generated atlases
  tools/         slice_sheets.py, build_atlas.py, balance_sim.ts (headless autoplay for balancing)
  docs/          GDD.md, PLAN.md, TASKS.md, DECISIONS.md, ASSET_CATALOG.md
  tests/         vitest
```

- **Coordinates:** an entity's `(x, y)` is its feet on the ground plane. Depth-sort by `y`. Projectiles fly on the ground plane and are drawn elevated with a shadow.
- **Collision:** circles on the ground plane for entities; tile flags for terrain (`blocks`, `slows`, `burns`, `breakable`). Projectile vs enemy uses **swept** collision (segment vs circle) so point-blank enemies are never immune (pokesurvivor bug, see its GDD "arreglo de combate").
- **Spatial hash** rebuilt each frame for enemies; neighbour queries for targeting and separation.
- **Determinism:** a run has a seed; world generation, spawns, drops and level-up offers come from seeded RNG streams so a run can be replayed in the headless balance simulator.
- **Rendering layers:** terrain chunks → ground decals (telegraphs, puddles) → shadows → entities (y-sorted) → projectiles → VFX → weather → HUD (canvas) → DOM menus.

---

## 5. Screen flow

```
Title ("Click to start" — needed for audio)
  → Main menu (hub): background = a live slice of the world at dusk with the hero idling
        PLAY → Run setup: pick Hero · Pet (1 slot) · Allies (1 slot; 2nd slot via upgrade) · [Start]
        COLLECTION → Heroes / Pets / Allies tabs, levels, buffs, lore line, "equip"
        SPAWNER (gacha) → pull ×1 / ×10, pity meter, rates, results
        UPGRADES → per-hero permanent upgrades (Emeralds)
        SETTINGS → audio, graphics (quality auto/high/med/low, damage numbers, screen shake, FPS counter, fullscreen), controls, data (export/import save JSON, reset), about/credits/legal
  → Run → (pause) → Results (time, kills, level, bosses, Emeralds earned, Spawn Eggs found, new records) → Main menu
```

Controls: `WASD`/arrows move · `Esc`/`P` pause · all weapons auto-fire · `Space` use active item (if it has an active) · mouse for menus. Remappable in Settings.

First run ever: skip setup, start as Steve with a 20-second in-run tutorial overlay (move, auto-attack, XP, level-up cards).

---

## 6. Heroes

Three playable heroes. Steve is unlocked from the start; Alex and Rana come from the Spawner (Legendary tier) — see §12.

| Hero | Base stats (HP / dmg / speed / armor) | Passive |
|---|---|---|
| **Steve** | 100 / ×1.00 / 100% / 0 | *Builder's Grit*: +10% max HP; armor tier upgrades cost one fewer card (first Leather tier is free at minute 1). |
| **Alex** | 90 / ×1.05 / 108% / 0 | *Ranger*: projectile weapons +15% speed and +1 pierce; bow starts at level 2. |
| **Rana** | 85 / ×1.00 / 104% / 0 | *Frog's Luck*: +10% luck (rarer cards & drops), slimes/magma cubes give double XP and never split more than once, water doesn't slow her. |

Hero sprite = `hero.<name>.<armorTier>.<swordTier>.<anim>`. Armor tier and sword tier are run state; the animator picks the right frames. Anim: `idle` when still, `walk` (if the sheets have no walk, use idle + 2-px bob), `swing` when the Sword fires, `hurt` for 150 ms on damage, `punch` only if no sword yet (start of run), `death`.

---

## 7. The run

- **Length:** 15:00 to the final boss; killing it = *Night Survived* (run won). After that, **Endless** continues with escalating difficulty until death (local records: best time, best kills).
- **Day/night cycle:** 5 min period (3 min day, 2 min night). Night = darker vignette, torches/lava glow, spawn rate ×1.4, phantoms possible, better drops. Second night (10:00–12:00) overlaps the Wither.
- **Biomes** (Overworld) rotate every 4 min with a 2.5 s palette crossfade, each with its own music variation and props: **Plains** (0–4) → **Dark Forest** (4–8) → **Snowy Taiga** (8–12) → **Desert** (12–15+) → repeat with mixed biomes in Endless. v1.1: Jungle, Swamp, Mushroom Fields, Nether/End as full biomes.
- **Enemy tides** every ~45 s; soft cap 64 on screen (quality setting can lower to 40); beyond the cap, newcomers are **Elites** (×1.6 HP/XP, ×1.25 dmg, small crown icon). Enemies left far behind despawn and re-spawn ahead of the player.
- **Bosses** at **5:00 Ravager** (Raid Captain, charge + stomp), **10:00 Wither** (flying, 3 heads: fan of wither skulls, blue skull homing, summons wither skeletons; enrages <50% HP with a dash) and **15:00 Warden** (final: blind, telegraphed sonic boom beam, ground shock rings, "darkness" pulses that shrink the view). Bosses drop a **Rare Spawn Egg** and an item. Tides drop to 25% during a boss; boss theme plays.
- **Mini-bosses** (random, 1–2 per run from minute 2, between bosses): Vindicator captain, Piglin Brute, Elder Guardian (in water), Charged Creeper.
- **Charged mobs** ("shiny"): any enemy has **1/1000** chance to spawn *Charged* (blue glow, ×2 HP, ×5 XP, screen-edge arrow); killing it drops a **Spawn Egg** (×1) and 150 Emeralds.

### 7.1 XP, level-up, cards

- XP orbs (green/yellow Minecraft-style orbs) drop from enemies; pickup radius via Magnet.
- Level up = choose **1 of 3 cards** (4 with the *Librarian* ally or Luck ≥ 20%): new weapon, weapon level, enchantment, potion effect, armor tier, sword tier. Rarity weights shift with Luck.
- Caps: **4 weapons + 4 passives** (enchantments/potions) + armor tier + sword tier (these two are separate tracks, not slots).
- **Reroll ×1 per run** (more via upgrade), **Skip** gives 25 Emeralds.

### 7.2 Weapons (auto-fire; v1.0 ship ≥ 12)

Each has 5 levels (level 5 = max) and an evolution when maxed **and** a specific passive is owned (gold card appears).

| Weapon | Behaviour | Evolution (needs) |
|---|---|---|
| **Sword** (starter, tiered) | melee arc in facing direction; tier raises dmg & arc; plays `swing` anim | *Sweeping Blade* (Sweeping Edge): 360° spin |
| **Bow** | arrow at nearest; levels add arrows | *Inferno Bow* (Flame): burning piercing arrows |
| **Crossbow** | slow, high dmg, pierces 3 | *Multishot Crossbow* (Multishot): 5-way |
| **Trident** | boomerang through enemies | *Riptide* (Depth Strider): dashes you along its path; *Channeling* at storm: chain lightning |
| **Splash Potion of Harming** | lobbed AoE | *Lingering Harming* (Infinity): leaves a damage pool |
| **Poison Potion** | lobbed DoT pool | *Wither Cloud* (Protection): bigger, slows |
| **TNT** | drops a mine with 1 s fuse | *Creeper Cluster* (Quick Charge): 3 mines, chain |
| **Snowball** | 3-way fan, slows | *Blizzard* (Frost Walker): 7-way, freeze |
| **Fishing Rod** | hooks the nearest enemy, pulls & damages | *Harpoon* (Knockback): pulls 3, stuns |
| **Lava Bucket** | leaves a burning trail behind you | *Magma Trail* (Fire Aspect): wider, lingering |
| **Blaze Rods** | 2 rods orbit you | *Blaze Crown* (Haste): 5 rods, faster |
| **Axe** | slow heavy hit with crit, knockback | *Diamond Cleaver* (Sharpness): armor-ignoring crits |
| **Shield** (passive-ish weapon) | blocks 1 hit every N s, thorns dmg | *Spiked Shield* (Thorns): reflects projectiles |
| **Lightning Rod** | periodic chain lightning (3 jumps) | *Thunderstorm* (Power): 6 jumps, stuns |

Projectiles and hits get **procedural pixel-art VFX** (arrows, potion bottles & splash, snowballs, TNT, fire, lightning, sweep arcs) in the mob/Minecraft palette with 1-px dark outlines so they match the sprites.

### 7.3 Enchantments & potion effects (passives, 5 levels)

Enchantments (weapon-mod flavour): Sharpness (+dmg), Knockback, Fire Aspect (burn on hit), Looting (+drops/Emeralds), Sweeping Edge (+area), Power (+projectile dmg), Multishot (+1 projectile at lv3/5), Piercing, Quick Charge (−cooldown), Flame, Infinity (+duration), Thorns, Protection (+armor), Depth Strider (water no slow), Frost Walker (freeze water you walk on), Mending (regen on kill).
Potion effects (pure stats): Speed, Strength, Regeneration, Resistance, Haste, Absorption, Luck, Night Vision (+view radius at night).
Ship ≥ 10 of these in v1.0 (pick the ones needed by evolutions first).

### 7.4 Armor & sword tiers (in-run tracks, visible on the sprite)

- **Armor** cards: Leather (+2 armor, +10 HP) → Chainmail → Iron → Gold (+luck instead of armor) → Diamond → Netherite (+knockback resist) → Enchanted (glint, +regen). Each tier changes the sprite set.
- **Sword** cards: Wood → Stone → Iron → Gold (fast, lower dmg) → Diamond → Netherite → Enchanted (glint, Fire Aspect built in).
- Both tracks are offered as cards with rising rarity; an **Anvil** interactable (see §8) can grant a tier for free.

### 7.5 Items (one equipped per run, dropped by bosses, locked chests 50%, chests 8%)

Totem of Undying (revive once at 50% HP), Golden Apple (heal 50% + absorption), Enchanted Golden Apple (heal full + resistance 20 s, rare), Elytra (`Space`: dash 15 s cd), Ender Pearl (`Space`: teleport to cursor, 20 s cd), Turtle Shell (regen when still), Fire Resistance Potion (lava/fire immunity), Lucky Rabbit's Foot (+15% luck). Keep to ~8. Picking a second item lets you choose (game pauses).

---

## 8. World

Infinite deterministic world from seeded noise, chunked 16×16 tiles, art baked to `ImageData` per visible chunk (budget ≤ 4 ms per chunk bake).

| Tile / prop | Effect |
|---|---|
| Grass / dirt / sand / snow / stone paths | walkable; biome palettes |
| Water (ponds, rivers) | slows ×0.6 (×0.55 enemies); Drowned/Guardian faster in it |
| Lava pools (rare in Desert, common near Nether portals) | burns anyone (enemies too — lure them) |
| Ice (Snowy Taiga) | slippery inertia |
| Trees (oak/birch/spruce/dark oak/acacia/cactus) | block movement and **enemy projectiles** (cover); cactus hurts |
| Boulders / stone outcrops | block all |
| **Ore blocks** (coal, iron, gold, lapis, redstone, diamond) | breakable by any attack: coal → XP, iron/gold → Emeralds, lapis → Luck pulse, redstone → Haste 10 s, diamond → Rare Spawn Egg chance |
| **Chests** | breakable: Emeralds, sometimes item; **Locked chest**: stand 3.5 s beside it → Emeralds, 1–3 Spawn Eggs (15% a Rare), a level-up |
| Tall grass / flowers / pumpkins / melons | cut by attacks; melons/pumpkins heal a bit |
| **Beacon** | touch: 25 s of Strength ×2, or Speed +45%, or Magnet ×4, or Haste −40% cd |
| **Campfire** | heal while standing in it; depletes, recharges in ~45 s |
| **Anvil** | touch: +1 armor tier or +1 sword tier (random), single use |
| **Enchanting Table** | touch: a free enchantment card choice, single use |
| **Traps** | TNT trap (explodes, hurts enemies too), cobweb (slow), magma block (burn) |
| **Nether Portal** (rift) | see §10 |

Flying/floating mobs (Phantom, Ghast, Vex, Bee, Allay, Blaze, Wither) ignore terrain. Walkers path around obstacles via a BFS distance field around the player (recomputed every 200 ms, radius ~24 tiles).

---

## 9. Enemies

Desired v1.0 roster (adapt to the sheets at Checkpoint 0). Each run draws a cast of ~6 per tier so runs differ.

| Mob | Tier (minute) | Behaviour / personality |
|---|---|---|
| Zombie | 0+ | chaser; *Pack*: 1 in 6 calls 2 zombies when hurt |
| Skeleton | 1+ | keeps distance, arrows (telegraph line) |
| Spider | 1+ | fast, *leap* with landing marker |
| Creeper | 2+ | *Kamikaze*: approaches, 1 s hiss + flash, explodes (hurts enemies too) |
| Slime | 2+ | splits into 2 smaller on death (max depth 2) |
| Cave Spider | 3+ | poison on hit |
| Husk (Desert) / Stray (Snow) | biome | zombie/skeleton variants: Husk hunger (−regen), Stray slowing arrows |
| Drowned | near water | trident throw, fast in water |
| Enderman | 4+ | teleports near you with telegraph, hits hard, flees on hit |
| Witch | 4+ | throws potions: poison/slow pools; heals allies |
| Silverfish / Endermite | 5+ | swarm, tiny, fast |
| Phantom | night | swoops (telegraphed dive), flying |
| Pillager | 6+ | crossbow volleys; Raid events |
| Vindicator | 6+ | axe, high dmg melee, **Shield**: armored |
| Evoker | 8+ | summons 2 Vexes + fang line telegraph |
| Vex | 8+ | flying, fast, fragile |
| Blaze | Nether rift / 9+ | 3-fireball fan |
| Magma Cube | Nether / 9+ | splits, burning trail |
| Piglin / Zombified Piglin | Nether / 10+ | gold sword; zombified ones aggro as a pack when one is hit |
| Hoglin | Nether / 10+ | charge (telegraphed) |
| Wither Skeleton | 10+ | wither DoT on hit |
| Ghast | Nether rift / 12+ | flying, slow, big fireball (can be hit back by Shield evo) |
| Guardian | water / 12+ | laser beam telegraph 1.2 s |
| Shulker | 13+ | static, homing bullets that levitate (slow you) |
| Ravager · Wither · Warden | bosses | §7 |
| Elder Guardian · Piglin Brute · Vindicator Captain · Charged Creeper | mini-bosses | — |

Enemy AI archetypes to implement generically: `chaser`, `ranged-kiter`, `charger` (telegraphed), `kamikaze`, `splitter`, `summoner`, `healer`, `shielder`, `teleporter`, `flyer-diver`, `turret`, plus boss patterns. Telegraphs are drawn on the ground (red outline shapes) ≥ 0.6 s before damage.

Damage model: simple, no type chart. Status effects: burn, poison, wither, slow, freeze, stun, levitate(slow). Armor = flat reduction with diminishing formula `dmg × 100/(100+armor)`.

---

## 10. Events & Nether portal

- **Nether Portal (rift):** from 1:15, every 30 s a 14% chance a portal opens for 45 s (big pulsing arrow with distance/time). Enter → separate circular arena (netherrack, lava rivers, soul sand slows, basalt pillars for cover), **90 s** vs a Nether mini-boss (Blaze Lord / Ghast / Piglin Brute / Hoglin pack). Win: **Rare Spawn Egg**, 3 Spawn Eggs, Emeralds, return where you were. Lose/time out: back with 30% HP, no reward. Overworld mobs wait meanwhile.
- **Raid** (every 4–5 min, 30 s): horn sound, pillager/vindicator horde from one side, banner carrier drops a chest.
- **Thunderstorm** (weather, rare): rain visuals, lightning strikes telegraphed on the ground (hurt anyone), creepers that get hit become Charged, Trident *Channeling* enabled, fire weapons −30%.
- **Snowfall** (Snowy Taiga only): −10% speed for non-Frost Walker, visual.
- **Golden Hour** (30 s): double XP & Emeralds.
- **Lost Villager**: escort him to the marker (he follows you); reward Emeralds + Spawn Egg; 1 in 5 he joins as a temporary ally.
- **Wandering Trader**: appears with 2 llamas, flees after 20 s; touching him trades 100 Emeralds for a random item.

---

## 11. Companions (the gacha pool)

Companions have **rarity** (Common / Uncommon / Rare / Epic / Legendary) and **level 1–5** (duplicates = shards: 1/2/3/4 dupes for levels 2–5; extra dupes → Emeralds). Level scales the buff (e.g. +10% → +20%). Collection shows a one-line lore quip per companion.

### 11.1 Pets (1 slot, follow with a lazy spring, invulnerable, passive buffs)

| Pet | Rarity | Buff (lv1 → lv5) |
|---|---|---|
| Chicken | C | +5→15% XP |
| Pig | C | +5→15% Emeralds |
| Cow | C | +5→15 max HP |
| Sheep (random wool color per pull, cosmetic) | C | +1→3 armor |
| Rabbit | U | +4→10% speed |
| Cat | U | creepers hiss slower (+0.5→1.5 s fuse), −10→30% explosion dmg |
| Parrot | U | +15→40% pickup radius, squawks 3 s before a boss |
| Bee | U | your hits poison 5→15% of the time |
| Frog | R | eats small slimes/magma cubes instantly; +10→30% XP from them |
| Fox | R | +5→15% luck, enemies drop Emeralds 2→6% more often |
| Turtle | R | shield of 10→30 HP that recharges when standing still 2 s |
| Axolotl | R | heal 2→6% on kill while in water, +regen |
| Allay | E | collects XP orbs & Emeralds for you (strong magnet), carries items to you |
| Wolf pup | E | +10→20% damage, barks when a Charged mob is near |
| Panda | E | −10→25% cooldown (lazy aura… that makes *you* efficient) |
| Strider | L | lava immunity, +speed on lava/netherrack |
| Sniffer | L | digs up a random item at 2:00 and 8:00; +luck |

### 11.2 Allies (fight beside you; have HP; "downed" → respawn after 20 s at 50% HP)

| Ally | Rarity | Role |
|---|---|---|
| Wolf | C | melee chaser, 70% of hero dmg |
| Snow Golem | U | ranged snowballs, slows |
| Trader Llama | U | spit ranged, knockback |
| Villager Fletcher | U | shoots arrows; +1 Bow level at start |
| Villager Cleric | R | heals you 2%/3 s; cleanses poison |
| Villager Weaponsmith | R | you start with Iron sword tier |
| Villager Armorer | R | you start with Chainmail armor tier |
| Villager Librarian | E | level-up offers 4 cards instead of 3 |
| Horse (mount) | E | you move +20%, trample enemies while moving fast; `Space` sprint if no item active |
| Iron Golem | L | tank: slam AoE, taunts enemies within 4 tiles, 300 HP |
| Polar Bear | L | heavy melee, +armor aura in Snowy Taiga |

Ally slot 2 unlocks with the *Leadership* upgrade. Allies use the Allies/Villagers sprites; Villagers (4-dir) use their side frames.

### 11.3 Heroes in the pool

Alex and Rana are **Legendary** pulls. Hero duplicates give 5 hero shards (cosmetic: alternate idle color/glint in 1.1) + 500 Emeralds.

---

## 12. Economy & gacha ("The Spawner")

- **Emeralds** (soft currency): run reward = `time/5 + kills/4 + 80 per boss + 40 per mini-boss + Emeralds picked`, × *Looting* upgrade. New save: 500. Spent on permanent upgrades only.
- **Spawn Eggs** (gacha ticket ×1): 1/400 drop per mob kill, locked chests 1–3, events, Charged mobs, achievements later.
- **Rare Spawn Eggs** (×10 pull ticket): every boss, Nether rift win, 15% of locked chests, diamond ore (5%).
- **Spawner screen:** a pixel-art mob spawner cage in the centre; ×1 = put an egg in, cage spins faster, flames by rarity color, mob pops out; ×10 = ten quick spins falling into a tray; click to skip/accelerate. Rarity colors: Common grey, Uncommon green, Rare blue, Epic purple, Legendary gold with lightning. Sound escalates with rarity; a special sting for Legendary.
- **Rates:** Common 50% · Uncommon 28% · Rare 15% · Epic 5.5% · Legendary 1.5%. ×10 guarantees ≥ 1 Rare; **pity: Legendary guaranteed at 60 pulls** without one (counter visible). One banner in v1.0 ("Overworld Spawner"); make banners data-driven for 1.1 (Nether banner with Strider/Piglin allies etc.).
- All gacha RNG is seeded per save (`gachaSeed` + pull index) so it's testable; unit-test the rates (±1% over 1e6 pulls) and the pity.

### 12.1 Permanent upgrades (per hero, Emeralds, 5–10 ranks, rising costs)

Vitality (+HP), Strength (+dmg), Stride (+speed), Reflexes (+cooldown), Chainmail Training (+armor), Mending (+regen), Magnet (+pickup radius), Wisdom (+XP), Looting (+Emeralds), Repertoire (start with a 2nd weapon), Reroll (+1 reroll), **Leadership** (2nd ally slot; account-wide), **Kennel** (pets' buffs +10%/rank; account-wide).

---

## 13. UI & art direction

- **No emojis anywhere.** All icons are code-drawn pixel art (hearts, emeralds, spawn eggs, XP orb, weapon icons, enchant book, potion bottles, armor/sword tier icons, boss skull, arrows).
- Panels: dark stone / oak-plank style frames with 2-px bevels, Minecraft-ish grey buttons with the hover highlight, but original (don't copy GUI textures). Tooltips on hover for every card and stat.
- HUD: HP bar (hearts style) top-left, XP bar full-width top with level, timer centre, kill counter, Emeralds/Eggs, weapon/passive slots bottom-left with levels, armor & sword tier icons next to the hero portrait, boss HP bar when a boss is alive, pet/ally portraits with ally HP, no minimap (screen-edge arrows for portal/Charged/lost villager instead).
- Damage numbers (toggle), hit flash = pre-tinted white silhouette (not `ctx.filter`), screen shake (toggle), low-HP vignette.
- Results screen with pixel confetti on a win; records highlighted.

---

## 14. Audio (procedural)

Web Audio synth: square/triangle/noise channels, simple ADSR, delay/reverb send. Sequencer plays note data from `data/music.ts` (original compositions, write them as note arrays with tempo & swing):

| Theme | Where |
|---|---|
| *Hub* | menus, calm, C major 90 bpm, marimba-ish |
| *Plains Day* | run, bright |
| *Night* variation | darker chords, same motif |
| *Forest* / *Taiga* / *Desert* | per biome, same motif re-harmonised |
| *Nether* | rift arena, tense phrygian |
| *Boss* | 150 bpm driving |
| *Victory* / *Game over* stings | |

SFX: hit, hurt, sword swing, bow, potion smash, TNT, snowball, lightning, level-up, pickup XP (pitch rises in streaks), emerald, egg, chest, portal, creeper hiss, boss roar, spawner spin/rarity stings, UI clicks. Volume sliders (music/SFX) + mute, persisted.

---

## 15. Balance & simulation

- `tools/balance_sim.ts`: headless autoplay (simple bot: kite nearest, pick highest-value card) running N seeded runs at 10× speed in Node; outputs survival time distribution, kills, bosses reached, weapon pick rates. Use it to tune spawn curves so a new player with Steve survives ~4–6 min, and a decent build reaches the Wither.
- Enemy HP/damage curves: HP = base × (1 + 0.12 × minute) × tier, dmg = base × (1 + 0.06 × minute). Tune from the sim, log results in `docs/BALANCE.md`.
- Level XP curve: `xpToNext = 10 + level × 8`, orbs scale with tier.

---

## 16. Phases & checkpoints

**Phase 0 — Asset pipeline & skeleton** (slicer, catalogue, atlas, Vite project, lint/test setup, empty screens, asset loader, hero idle rendered at ×3). ⛔ CHECKPOINT 0 (roster).

**Phase 1 — World & movement**: noise world, chunks, procedural tiles for Plains + Dark Forest, props, collision, camera, hero walking with flip, day/night tint. Debug overlay (F3-style: FPS, chunk count, entities). ⛔ CHECKPOINT 1: I'll walk around and judge the look of the tiles (they replace the sheet I didn't like — this matters).

**Phase 2 — Combat core**: enemies (zombie, skeleton, spider, creeper, slime), spawner tides, spatial hash, Sword + Bow + TNT, XP, level-up cards, hurt/death, VFX, HUD, pause, results, save of records. ⛔ CHECKPOINT 2: game feel review.

**Phase 3 — Content**: remaining weapons, enchantments/potions, armor & sword tiers with sprite swapping, evolutions, items, all enemies and archetypes, biomes 3–4, world interactables, events, Nether portal + arena, weather, bosses (Ravager, Wither, Warden), Endless. Balance sim. ⛔ CHECKPOINT 3.

**Phase 4 — Meta**: Emeralds, Spawn Eggs, Spawner gacha with animation, collection, companions (pets + allies) in run, heroes Alex/Rana, permanent upgrades, run setup screen, settings, tutorial. ⛔ CHECKPOINT 4.

**Phase 5 — Polish & release**: music/SFX pass, title screen, about/credits/legal, PWA/service worker, GitHub Pages workflow, README (English), `docs/` complete, performance pass (≥ 60 FPS with 150 enemies), save migration test, tag `v1.0.0`.

---

## 17. Definition of done (v1.0)

- A new player can: start, play a run as Steve, die or win at 15:00 (Warden), earn Emeralds & Spawn Eggs, pull on the Spawner, equip a pet and an ally, buy upgrades, and feel their next run is different.
- ≥ 12 weapons, ≥ 10 passives, ≥ 6 evolutions, 7 armor tiers + 7 sword tiers visible on the hero, ≥ 20 enemy types, 3 bosses, 4 mini-bosses, 4 biomes, Nether rift, ≥ 15 pets, ≥ 10 allies, 3 heroes.
- Runs at 60 FPS on a mid laptop; no console errors; offline after first load; deployed at the GitHub Pages URL.
- `docs/GDD.md` matches the shipped game; `docs/DECISIONS.md` lists every deviation from this brief with the reason.

Start by confirming you have read everything, then produce `docs/PLAN.md` and `docs/TASKS.md` and begin Phase 0.
