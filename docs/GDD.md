# MineSurvive — Game Design Document (living)

Seeded from the design sections of `docs/BRIEF.md` (sections 1 and 5-15). Update this file whenever a decision changes; deviations are logged in `docs/DECISIONS.md`. Updated for v1.1 (version 1.1.0): sections 2-4 and 17-19 are new, 5-16 were brought in line with the game, and section 16 lists the shipped numbers.

## 1. Game identity

- **Title:** MineSurvive. Tagline: *Survive the night. Gear up. Collect every mob.*
- **Genre:** bullet-heaven / horde survival + roguelike run structure + meta-progression + gacha collection.
- **Camera:** 2D top-down open world (like pokesurvivor), but all character sprites are **side-view** (Deltarune battle style), so entities face left/right only (flip horizontally); movement is 8-directional on the ground plane.
- **Signature twist #1 — visible gearing:** the hero's armor and sword tiers are real in-run upgrades and **change the sprite** (No armor → Leather → Chainmail → Iron → Gold → Diamond → Netherite → Enchanted; sword Wood → Stone → Iron → Gold → Diamond → Netherite → Enchanted). You *see* yourself getting stronger.
- **Signature twist #2 — companions from the gacha:** **Pets** (follow you, passive buffs), **Allies** (fight next to you, chosen at run start) and **Heroes** (playable characters). Duplicates level companions up.
- **Mood:** cosy pixel-art Minecraft fan vibe by day, tense at night. No gore, no blood (hurt = red flash frames, which the sheets already have).
- **Non-commercial fan game.** Show a legal notice: not affiliated with Mojang/Microsoft; Minecraft is a trademark of Mojang Synergies AB; sprites credited to their authors (see §3.5). No real-money anything. Never use official Minecraft textures, music or sounds.

---

## 2. Movement model and camera (v1.1)

The simulation runs at a fixed 60 Hz (`core/loop`, at most 5 catch-up steps per frame); the renderer interpolates between the last two steps (`alpha`), so motion is smooth at any refresh rate. Entities keep `prevX/prevY` (NaN right after a spawn or teleport, so there is no streak) and the interpolated `rx/ry`.

- **Acceleration:** the hero accelerates at 720 px/s² and brakes at 1100 px/s² (full speed in about 0.1 s, a stop in about 0.07 s). On ice the rates drop to 170 / 95 (slippery). Water slows to ×0.6, a slow status to ×0.6.
- **Facing:** movement sets the facing; an attack forces its aim direction for a moment (`aimT`) and movement takes over afterwards, so the two no longer fight.
- **Walk cycle:** the sheets have no hero walk frames, so the cycle is procedural and distance-driven (one half-stride per 7 px): legs shuffle by -1/0/+1 px, the body lifts on the passing step, with dust and a footstep sound on every footfall.
- **Camera:** integer-snapped around the rounded hero, with a look-ahead of 0.16 s of travel (at most 14 px, easing at 5/s) and a fixed 8 px upward offset. The look-ahead is a setting (`cameraLead`, default on). Teleports reset it.
- **Collision:** circle against solid props and tile flags, with push-out; walkers path around obstacles (§8).

## 3. Text layer (v1.1)

All text is drawn from a 1-bit glyph atlas of the Tiny5 font (OFL) rasterized once at its native 8 px (cap height 5, ascent 7, descent 2, line height 9), with whole-pixel advances and a hard 1 px shadow (`ui/font.ts`; `drawText`, `wrapText` and `fitText` in `ui/panel.ts`). Strings are pre-rendered into a small LRU cache, so a frame full of damage numbers costs one `drawImage` each. It covers printable ASCII and Latin-1 plus a few punctuation marks (dashes and quotes map to ASCII look-alikes). Text size 2× (accessibility) applies to the in-run HUD and the DOM account dialogs only (§18).

## 4. Input (v1.1)

`MergedInput` combines three sources behind one `InputSource`: keyboard (remappable), gamepad (standard mapping; left stick or d-pad, A item, X or RB ability, Start pause, B back) and touch (floating joystick on the left 60% of the screen, ability / item / pause buttons; shown automatically on coarse pointers or after the first touch, or forced on/off in Settings). Every canvas screen can be driven without a mouse: arrows or d-pad move a focus ring, Enter or A presses, Q / E or LB / RB switch tabs, Esc or B goes back. A button already held when a screen opens is ignored, so one press never acts on two screens.

---

## 5. Screen flow

```
Title ("Click to start" — needed for audio)
  → Hub (main menu): background = a live slice of the world at dusk with the equipped hero idling;
        player level and rank (Wood → Netherite, derived from lifetime stats), a badge on MISSIONS when something can be claimed
        PLAY → Run setup: pick Hero · Pet (1 slot) · Allies (1 slot; 2nd slot via upgrade) · optional start biome · [Start]
        COLLECTION → Heroes / Pets / Allies tabs, levels, buffs, hero ability and rank, lore line, "equip"
        SPAWNER (gacha) → pull ×1 / ×10, pity meter, rates, results
        UPGRADES → per-hero permanent upgrades (Emeralds) + account-wide ones
        MISSIONS → tabs Daily · Weekly · Login (rerolls, 7-day login reward)
        ACHIEVEMENTS → 55 achievements in 7 categories
        PROFILE (from the player card) → avatar, name, account badge, sync status, lifetime stats, best heroes; sign in / create account
        RANKING → Today / This week / All time leaderboards with a hero filter (online), or your own bests (offline)
        SETTINGS → tabs Audio · Graphics (quality auto/high/med/low, damage numbers, screen shake, camera look-ahead, FPS counter) · Controls (remap) · Access (§18) · Account · Data (export/import save JSON with a confirming click, reset)
        ABOUT → version, credits, legal
  → Run → (pause) → Results (time, kills, level, bosses, Emeralds earned, Spawn Eggs found, new records, detailed breakdown and any missions or achievements completed) → Hub
```

Controls: `WASD`/arrows move · `Q`/`Left Shift` hero ability · `Space` use active item (if it has an active) · `M` minimap · `Esc`/`P` pause · `F3` debug overlay · all weapons auto-fire · mouse for menus. Movement, pause, item and ability keys are remappable in Settings. Gamepad and touch: §4.

First run ever: skip setup, start as Steve with a 20-second in-run tutorial overlay (move, auto-attack, XP, level-up cards).

---

## 6. Heroes

Eleven playable heroes. Steve is unlocked from the start; the rest come from the Spawner by rarity (§12). Every hero has a passive (`data/heroKits.ts`, one kit per hero, called from the systems through hooks) and an **active ability on `Q`/`Left Shift`** (`src/abilities`, one module per ability, data-driven like weapons; the HUD shows the slot with its cooldown, touch has a button, gamepad X/RB). Ability rank 1-5 comes from hero shards (1 + shards/5): each rank above 1 adds +8% ability power and -4% cooldown. Cooldowns are also scaled by cooldown modifiers (`mods.abilityCd`, minimum 2 s).

| Hero | Rarity | HP / dmg / speed | Passive | Ability (cooldown) |
|---|---|---|---|---|
| **Steve** | Common | 100 / ×1.00 / 100% | *Builder's Grit*: +10% max HP (110); armor tiers cost one fewer card (1 instead of 2); first Leather tier free at minute 1 | *Iron Resolve* (16 s): 25 HP shield, half damage taken for 4 s, shoves nearby enemies away |
| **Alex** | Legendary | 90 / ×1.05 / 108% | *Ranger*: projectiles +15% speed and +1 pierce; starts with the Bow at level 2 | *Arrow Rain* (15 s): three volleys of arrows on the aimed area |
| **Rana** | Legendary | 85 / ×1.00 / 104% | *Frog's Luck*: +10% luck, double XP from slimes and magma cubes, a slime lineage splits at most once, water does not slow her | *Frog Leap* (10 s): a leap towards the cursor, untouchable in the air, leaving a slowing poison pool on landing |
| **Skeleton** | Uncommon | 75 / ×1.00 / 104% | *Bone Dry*: starts with the Bow at level 3, projectiles +1 pierce, immune to poison | *Bone Barrage* (12 s): two rings of piercing arrows in every direction |
| **Wandering Trader** | Rare | 95 / ×0.95 / 100% | *Haggler*: +25% Emerald payout and +25% Emeralds from chests; starts with a random item | *Emerald Shower* (20 s): a burst of Emeralds that stuns and hurts nearby enemies |
| **Village Smith** | Rare | 110 / ×1.02 / 96% | *Forge Master*: sword damage +20%, starts with an Iron sword, +2 armor | *Anvil Drop* (16 s): an anvil on the cursor, heavy area damage, 1.5 s stun and a rolling shockwave |
| **Enderman** | Epic | 90 / ×1.05 / 108% | *Phase Step*: 15% chance to blink out of the way of a hit; takes 30% more damage in water | *Blink* (10 s): teleport up to 150 px towards the cursor; both ends burst for damage and he is briefly untouchable |
| **Witch** | Epic | 85 / ×1.00 / 98% | *Cauldron Craft*: potion weapons +30% area; starts with a random potion weapon (Poison or Harming) | *Witch Brew* (14 s): lobs a big lingering potion at the cursor (Poison, Harming or Slowness, the cauldron decides) |
| **Illusioner** | Epic | 85 / ×1.00 / 100% | *Sleight of Hand*: +10% speed; 20% of the hits taken leave a decoy that lures enemies for 1.5 s | *Mirror Images* (18 s): three decoys for 6 s pull nearby chasers away and burst when they fade |
| **Piglin** | Legendary | 100 / ×1.08 / 100% | *Gold Digger*: +15% luck, heal 1 HP per kill; piglins and zombified piglins ignore him (bosses and rift foes do not) | *Gold Rush* (20 s): 6 s berserk, +30% damage, +25% speed, many more Emerald drops |
| **Creeper** | Legendary | 95 / ×1.08 / 100% | *Short Fuse*: explosion damage taken -50%; 10% of his hits set off a mini explosion | *Charged Blast* (22 s): hiss for 1.2 s, then a huge blast that hurls enemies away and sets off TNT; it never hurts him |

Stats are the hero's base values before upgrades; speed is shown relative to Steve. Steve, Alex and Rana use the layered hero sheets: sprite = `hero.<name>.<armorTier>.<swordTier>.<anim>`, with `idle` when still, `swing` when the Sword fires, `hurt` for 150 ms on damage, `punch` only before the first sword. The other eight are **sprite heroes** drawn from the mob/NPC sets (idle, walk, attack, hurt, death; some with a tint or a scale, and a dedicated cast animation while the ability is used). For them armor and sword tiers change stats only, not the sprite.

---

## 7. The run

- **Length:** 15:00 to the final boss; killing it = *Night Survived* (run won). After that, **Endless** continues with escalating difficulty until death (local records: best time, best kills).
- **Day/night cycle:** 5 min period (3 min day, 2 min night). Night = darker vignette, torches/lava glow, spawn rate ×1.4, phantoms possible, better drops. Second night (10:00–12:00) overlaps the Wither.
- **Biomes** (Overworld) are regions of the map, not a timer (v1.1): 10 overworld biomes from a climate noise map (Plains around the spawn, then Forest, Dark Forest, Snowy Taiga, Desert, Badlands, Swamp, Jungle, Cherry Grove, Mushroom Fields), plus the Nether rift arena. Each has its own enemy roster (9.1), ambient particles (snow, petals, dust, leaves, pollen, spores, embers, fireflies at night in forests and swamps), music theme and props. The "Entering <biome>" banner and the music follow the hero with hysteresis at borders.
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

Infinite deterministic world from seeded noise, chunked 16×16 tiles, art baked to `ImageData` per visible chunk (budget ≤ 4 ms per chunk bake). Since v1.1 the world is **spatial**: the biome is a pure function of (tile, seed) (`world/biomeMap.ts`), not a timer.

### 8.1 Biomes

Three low-frequency value-noise fields (temperature, humidity and a "weirdness" field for rare pockets) are sampled once per 4×4-tile cell, warped slightly so borders look organic, and mapped through a Whittaker-style table. The 40 tiles around the origin are always Plains (the spawn meadow) and ramp into the real climate by about 96 tiles; biome regions are roughly 25-70 tiles across. Each tile is painted with its own biome, so borders blend with no timed crossfade. The hero can also start in a chosen biome (run setup; the hero is placed on dry ground inside it).

| Biome | Ground | Ambience | Music | Danger | Notes |
|---|---|---|---|---|---|
| Plains | grass | none | Plains Day | 1.0 | spawn meadow, mixed oaks and birches, meadow flowers |
| Forest | grass | falling leaves | Plains Day | 1.05 | birch mix |
| Dark Forest | grass | falling leaves | Dark Forest | 1.15 | dark oaks |
| Snowy Taiga | snow | snowfall | Taiga | 1.05 | spruce, frozen (slippery) water, snowfall slows |
| Desert | sand | dust | Desert | 1.05 | cacti, lava pools, dead bushes |
| Swamp | mud | fireflies at night | Swamp | 1.1 | many puddles, swamp oaks |
| Jungle | grass | pollen and leaves | Jungle | 1.1 | jungle trees and bushes |
| Badlands | red sand | dust | Badlands | 1.15 | terracotta, no lakes, lava pools, cacti |
| Cherry Grove | grass | petals | Cherry | 0.9 | cherry trees, pink petals |
| Mushroom Fields | mycelium | spores | Mushroom | 0.6 | huge mushrooms, red and brown mushrooms |
| Nether (rift arena only) | netherrack | embers | Nether | 1.3 | separate world, see §10 |

Danger drives spawn density and enemy HP (§9.1). Fireflies also appear at night in forests.

**Block textures** (`world/blocks.ts`): 16×16 Minecraft-style block faces generated once in code (never copied from the game) as a deterministic function of (material, variant), with mirrored or rotated copies picked per tile so repeats do not read. 21 ground materials (grass, dirt, coarse dirt, podzol, mycelium, mud, sand, red sand, sandstone, terracotta, snow, snowy grass, packed ice, gravel, stone, cobblestone, mossy cobblestone, netherrack, soul sand, blackstone bricks, petals); tinted materials are stored as grey levels and multiplied by the biome tint when painted. Water and lava are per-biome liquid sets with 16 shore masks × 4 animation frames (animated).

**Props** (`world/props.ts`, `world/propSprites.ts`): placed one candidate per 2×2-tile cell by stateless hashes of the cell and its biome. Voxel-style sprites per biome: tree families (oak, birch, dark oak, spruce, cherry, jungle tree and bush, swamp oak, huge mushroom), rocks (boulder, mossy, sandstone, snowy, terracotta, basalt), ground plants (tall grass, ferns, berry bush, dead bush, sugar cane, flowers, petals, mushrooms) and the interactable props below.


| Tile / prop | Effect |
|---|---|
| Ground blocks (grass, dirt, sand, snow, mud, mycelium, gravel, stone...) | walkable; biome materials |
| Water (ponds, rivers) | slows ×0.6 (×0.55 enemies); Drowned/Guardian faster in it |
| Lava pools (Desert and Badlands; lava rivers in the Nether arena) | burns anyone (enemies too — lure them) |
| Ice (Snowy Taiga) | slippery inertia |
| Trees (per biome, see 8.1) / cactus | block movement and **enemy projectiles** (cover); cactus hurts |
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

Flying/floating mobs (Phantom, Ghast, Vex, Blaze, Wither) ignore terrain. Walkers path around obstacles via a BFS distance field around the player (recomputed every 200 ms, radius ~24 tiles).

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
| Husk (Desert, Badlands) / Stray (Snow) | biome | zombie/skeleton variants: Husk hunger (−regen, "Hunger" tag in the HUD), Stray slowing arrows. More biome mobs: see 9.1 |
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

### 9.1 Biome rosters (v1.1)

The biome under the hero (spatial biome map, `RunState.biome()`) reweights the spawn pool; the data lives in `data/rosters.ts` (pure functions, tested). A mob with a `biomes` filter only spawns there; generic mobs are scaled per biome (`mult`) and some arrive earlier (`from`). **Plains is untouched** (same pool and curve as before, so the start stays gentle). Each biome's `danger` scales spawn density (trickle and tides) and HP (60% of the distance from 1): Plains 1.0, Cherry Grove 0.9, Mushroom Fields 0.6, Forest/Taiga/Desert 1.05, Swamp/Jungle 1.1, Dark Forest/Badlands 1.15.

| Biome | Cast (on top of the reweighted generic mobs) |
|---|---|
| Forest | wolf packs (min 2), forest chompers; fewer witches |
| Dark Forest | Webspinner (cobweb: slow on hit), Jack o Lantern turret (fireballs, min 5), wolf packs; witches from min 3, pillagers/vindicators from min 5, evokers from min 7; no slimes |
| Snowy Taiga | Stray (slowing arrows), Frozen Zombie and Frost Spider (slow on hit), Frost Creeper, wolf packs, Iceologer (frost pools, min 5) |
| Desert | Husk (hunger), Dune Spider, Bone Hound packs (min 3); almost no slimes or drowned |
| Badlands | Husk, Rockback Zombie (20% shield), Bone Spider (ranged, min 3), Miner (min 4), Dune Spider, Bone Hounds |
| Swamp | Lobber Zombie (poison pools), Mossy Skeleton, Swamp Witch (heals allies, min 3), Zombie Rabbit; slimes x3 from min 1, Drowned x2.5 from min 2 near water |
| Jungle | Jungle Zombie, Tropical Slimes (split twice), Mossy Skeleton, Quill Vine turret (slowing spit, min 4); double cave spiders from min 2 |
| Cherry Grove | Killer Bunny (leaper), Pink Slimes; everything else softer |
| Mushroom Fields | Mossy Ram (telegraphed charge), Pink Slimes; regular hostiles at 20% |

**Chompers** are the tiny 14x13 biters of the sheets' "Great Hunger" family, one skin per ground type, in every overworld biome but Plains.

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

Companions have **rarity** (Common / Uncommon / Rare / Epic / Legendary) and **level 1–5** (duplicates: 1/2/3/4 more copies for levels 2–5; extra copies refund Emeralds, 30/60/120/250/500 by rarity). Level scales the buff (the tables show level 1 → 5). Collection shows a one-line lore quip per companion. The pool holds 11 heroes, **30 pets** and **22 allies**; v1.0 shipped 3 / 15 / 10 and v1.1 added 8 heroes, 15 pets and 12 allies, all with real in-run effects (data in `data/companions.ts`). Allay and Sniffer from the original brief were dropped at Checkpoint 0 (no sprites).

Rarity split. Heroes: 1 Common, 1 Uncommon, 2 Rare, 3 Epic, 4 Legendary. Pets: 8 / 8 / 7 / 4 / 3. Allies: 4 / 7 / 5 / 4 / 2.

### 11.1 Pets (1 slot, follow with a lazy spring, invulnerable, passive buffs)

Kennel (account-wide upgrade) multiplies every pet buff by 1 + 10% per rank. Bats, wisps and fish hover with a gentle bob.

| Pet | Rarity | Effect (level 1 → 5) |
|---|---|---|
| Chicken | C | +5→15% XP |
| Pig | C | +5→15% Emeralds |
| Cow | C | +5→15 max HP |
| Sheep | C | +1→3 armor |
| Rabbit | U | +4→10% speed |
| Cat | U | Explosions hurt 10→30% less; creepers hiss slower |
| Parrot | U | +15→40% pickup radius; squawks before a boss |
| Bee | U | Hits poison 5→15% of the time |
| Frog | R | Eats small slimes; +10→30% XP from slimes |
| Fox | R | +5→15% luck; enemies drop Emeralds more often |
| Turtle | R | 10→30 HP shield, recharges when you stand still |
| Axolotl | R | Heal 2→6% of max HP on kill in water, +regen |
| Wolf Pup | E | +10→20% damage; barks when a Charged mob is near |
| Panda | E | -10→25% cooldowns |
| Strider | L | Lava immunity; +8→20% speed on lava and Nether ground |
| Duck | C | +8→20% projectile speed |
| Moobloom | C | +0.2→0.6 HP regenerated per second |
| Arctic Fox | C | +10→26% damage to slowed, frozen or stunned enemies |
| Toast | C | +6→18% loot drops (Emeralds and Spawn Eggs) |
| Pufferfish | U | Reflects 30→75% of contact damage |
| Polar Bear Cub | U | Enemies within 20→36 px are slowed; snow does not slow you |
| Toucan | U | +25→70% XP from elites and bosses |
| Magma Cow | U | Burning, lava and fireballs hurt you 25→65% less |
| Ocelot | R | 6→15% chance for any hit to crit for double damage |
| Mooshroom | R | Below 35% HP, a stew heals 15→35% of max HP (40 s cooldown) |
| Piggy Bank | R | Chests and ores have a 8→20% chance to give a Spawn Egg |
| Golden Monkey | E | 6→15% chance to dodge a hit completely |
| Bat | E | At night: +10→25% speed and damage; nights are brighter |
| Glare | L | +15→40% damage to elites and bosses; elites drop an Emerald |
| Wisp | L | Once per run, revive with 30→75% HP when you fall |

### 11.2 Allies (fight beside you; have HP; "downed" → respawn after 20 s at 50% HP)

Ally HP and damage grow 20% per level above 1. Support roles deal no damage. Slot 2 unlocks with the *Leadership* upgrade. Allies use the Allies/Animals/Villagers sprites; villagers use their side frames.

| Ally | Rarity | HP | Role |
|---|---|---|---|
| Wolf | C | 60 | Melee chaser, 70% of your damage |
| Snow Golem | U | 50 | Throws slowing snowballs |
| Trader Llama | U | 70 | Spits at range and knocks enemies back |
| Villager Fletcher | U | 55 | Shoots arrows; you start with +1 Bow level |
| Villager Cleric | R | 55 | Heals you 2% every 3 s and cures poison |
| Villager Weaponsmith | R | 60 | You start with an Iron sword |
| Villager Armorer | R | 70 | You start with Chainmail armor |
| Villager Librarian | E | 50 | Level-up offers show 4 cards |
| Horse | E | 90 | You move +20% faster and trample enemies at speed |
| Iron Golem | L | 300 | Taunts nearby enemies and slams for area damage |
| Small Iron Golem | C | 140 | Tiny tank: taunts enemies within 40 px, takes 40% less damage |
| Villager Butcher | C | 60 | Cleaver melee; each kill he lands heals you 2% of max HP |
| Villager Leatherworker | C | 55 | Stitches a patch every 12 s: +6 shield HP (stacks to 18) |
| Goat | U | 80 | Telegraphs a charge, then rams through a line of enemies |
| Black Cat | U | 45 | Fast scratcher; 25% of scratches crit for 2.5x |
| Melon Golem | U | 60 | Spits a fan of 3 melon seeds that pierce 2 enemies |
| Villager Fisherman | U | 55 | Reels in the farthest XP orb or Emerald every 1.5 s |
| Copper Golem | R | 110 | Melee; calls a lightning bolt on crowds every 6 s (3 s in storms) |
| Villager Shepherd | R | 55 | Drops a wool decoy every 12 s that lures nearby enemies for 5 s |
| Love Golem | E | 150 | Charms the toughest nearby enemy every 4 s (stun 2.5 s) and heals you |
| Furnace Golem | E | 220 | Melee bruiser with a burning aura (sets enemies within 36 px on fire) |
| Soul Wizard | L | 80 | Casts 3 homing soul orbs every 2.2 s; blinks to you when cornered |

### 11.3 Heroes in the pool

The ten heroes besides Steve are pulled like any companion (rarity in §6). A hero duplicate gives **5 shards and 500 Emeralds**; every 5 shards raise that hero's ability rank (max 5, §6).

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
- Text: pixel-perfect Tiny5 glyph atlas (§3). Menu screens use inventory-style panels (hub, collection, run setup, upgrades, Spawner) laid out for a 320x180 minimum view and scale up with the integer zoom.
- Panels: dark stone / oak-plank style frames with 2-px bevels, Minecraft-ish grey buttons with the hover highlight, but original (don't copy GUI textures). Tooltips on hover for every card and stat.
- HUD: HP bar (hearts style) top-left, XP bar full-width top with level, timer centre, kill counter, Emeralds/Eggs, weapon/passive slots bottom-left with levels, armor & sword tier icons next to the hero portrait, boss HP bar when a boss is alive, pet/ally portraits with ally HP, screen-edge arrows for portal/Charged/lost villager, and a corner **minimap** (toggle `M`, or tap / click the map; with touch controls up it sits clear of the touch buttons and a small chip marks it while hidden; not drawn on views under 150 px high): fog of war revealed around the hero in 8x8-tile cells (radius 4 cells, a sparse bitset), a 40x40 px window repainted only when the hero enters a new cell, biome ground colours, water and lava, dots for the portal, trader, lost villager and Charged mobs; a hero-ability slot (bottom right) shows the cooldown. "Hunger" and "Slow" tags appear next to the hearts while they apply.
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
| *Dark Forest* / *Taiga* / *Desert* / *Jungle* / *Swamp* / *Cherry* / *Mushroom* / *Badlands* | one theme per biome (Plains and Forest share *Plains Day*); crossfades when the hero has stayed in a new biome for 4 s (and at least 20 s after the last change); boss, rift and night switch at once |
| *Nether* | rift arena, tense phrygian |
| *Boss* | 150 bpm driving |
| *Victory* / *Game over* stings | |

SFX: hit, hurt, sword swing, bow, potion smash, TNT, snowball, lightning, level-up, pickup XP (pitch rises in streaks), emerald, egg, chest, portal, creeper hiss, boss roar, spawner spin/rarity stings, UI clicks. Volume sliders (music/SFX) + mute, persisted.

---

## 15. Balance & simulation

- `tools/balance_sim.ts`: headless autoplay (simple bot: kite nearest, pick highest-value card) running N seeded runs at 10× speed in Node; outputs survival time distribution, kills, bosses reached, weapon pick rates. Use it to tune spawn curves so a new player with Steve survives ~4–6 min, and a decent build reaches the Wither.
- Enemy HP/damage curves: HP = base × (1 + 0.12 × minute) × tier, dmg = base × (1 + 0.06 × minute). Tune from the sim, log results in `docs/BALANCE.md`.
- Level XP curve: `xpToNext = 10 + level × 8`, orbs scale with tier.
- v1.1: the bot can start in any biome (`BAL_BIOMES=1 npm run balance` adds the per-start-biome table); `docs/BALANCE_RESULTS.md` has the last run. The bot does not use companions, upgrades, abilities, chests, rifts or trades, so it is a fresh-save baseline only.

---

## 16. As shipped (v1.1)

This section is the source of truth where it differs from the brief text above; every deviation is explained in `docs/DECISIONS.md`.

**Content counts.** 14 weapons (Sword, Bow, TNT, Crossbow, Trident, Snowball, Fishing Rod, Harming and Poison potions, Lava Bucket, Lightning Rod, Blaze Rods, Axe, Shield), each with 5 levels and an evolution (14 evolutions); 24 passives (enchantments and potion effects); 7 armor tiers and 7 sword tiers (the sprite swaps for the layered heroes; the top tier glints); 8 items; 74 enemy definitions (including 3 bosses and size variants such as slimes) over 11 AI archetypes, 3 bosses (Raid Captain at 5:00 replacing the Ravager, Wither at 10:00, Warden at 15:00) and 4 mini-bosses; 10 overworld biomes on a spatial map plus the Nether rift arena; 11 heroes with abilities, 30 pets, 22 allies; 13 procedural music themes and about 30 sound effects; 55 achievements, 27 daily and 12 weekly mission templates.

**Run rules.** Fixed 60 Hz simulation, all randomness from seeded streams. Base hero regeneration is 0.7 HP/s (added at 0.4 after balance simulation, raised to 0.7 in the v1.1 re-tune, see DECISIONS). Armor tiers cost 2 cards (1 for Steve); level-up offers 3 cards (4 with the Librarian), 1 reroll (+ Reroll upgrade), skip pays 25 Emeralds. The soft enemy cap is 64 (+10 overflow for tides and raids); pickups are capped at 300 (oldest XP orbs are banked automatically). Golden Hour, Raids, Thunderstorms, the trader and the lost villager are suppressed while a boss is alive. Winning means killing the Warden; Endless then sends a stronger boss every 5 minutes. The biome under the hero (not the clock) picks the spawn roster and danger (§9.1).

**Heroes.** See §6. Steve has 110 HP (Builder's Grit); Alex 90 HP; Rana 85 HP; the eight sprite heroes range from 75 HP (Skeleton) to 110 HP (Village Smith).

**Companions.** Pets follow with a lazy spring and are invulnerable; allies fight, take contact damage and return 20 s after being downed at 50% HP. Levels 2-5 need 1/2/3/4 more duplicates; further duplicates refund Emeralds (30/60/120/250/500 by rarity). Kennel multiplies pet buffs by 1 + 10% per rank; Leadership adds the second ally slot. Ally HP and damage grow 20% per level.

**Economy.** Run reward = (time/5 + kills/4 + 80 per boss + 40 per mini-boss + Emeralds picked) x (Looting upgrade x Pig); Looting and Pig apply to the payout only, so in-run drop rates are unaffected. Spawn Egg: 1/400 per kill, locked chests 1-3, events, Charged mobs; Rare Spawn Egg: bosses, rift wins, 15% of locked chests, 5% of diamond ore. New saves start with 500 Emeralds. Permanent upgrades: 11 per hero plus the account-wide Leadership and Kennel; with `n` ranks already bought, the next rank costs `base x (1 + 0.7 n)`.

**Gacha.** One banner ("Overworld Spawner") with rates 50 / 28 / 15 / 5.5 / 1.5, a x10 that always contains a Rare or better, Legendary pity at 60, seeded per save (`gachaSeed` + pull index). Banners are data (`systems/gacha.ts`).

**Platform.** Installable PWA with a service worker (offline after the first load), saves in `localStorage` behind a versioned `SaveStore` (version 2; corrupt or newer saves are kept under `.bak`), optional Firebase accounts, cloud save and leaderboards (§17), controls remappable, quality tiers (auto adapts to frame time), GitHub Pages deploy through `.github/workflows/deploy.yml`.

**Known gaps.** Layered armor/sword sprites exist only for Steve, Alex and Rana (the sprite heroes show tiers as stats only). Colour-blind palettes remap the critical colour-coded cues only, not the whole canvas. Text size 2x applies to the in-run HUD and account dialogs only. The balance bot plays a fresh Steve and never reaches most bosses (`docs/BALANCE_RESULTS.md`). Online co-op is not started.

---

## 17. Meta-progression and accounts (v1.1)

- **Missions** (`data/missions.ts`, `systems/missions.ts`): 3 daily and 2 weekly missions are rolled deterministically from the local date (daily) and the ISO week, Monday start (weekly), from 27 daily and 12 weekly templates, taking into account which heroes the player owns (a class mission is never impossible). Rewards are Emeralds and sometimes Spawn Eggs or a Rare Spawn Egg. 2 rerolls per local day, shared by both sets. An expired set's finished missions are claimed automatically at rollover.
- **Daily login reward:** a 7-day cycle (50; 75; 100 + egg; 150; 200 + egg; 300 + 2 eggs; 400 + egg + rare egg). The streak keeps counting past day 7 while the reward loops; a missed local day restarts at day 1. A clock outside 2024-2100 is ignored, a clock behind the last claim never claims or rewinds the streak, and a stored claim more than 30 days in the future is discarded.
- **Achievements** (`data/achievements.ts`): 55 in 7 categories (Combat, Survival, Explore, Collect, Heroes, Economy, Secrets), 7 of them hidden until unlocked, each reading a lifetime stat or counter from the save and paying a reward. Toasts queue top-right over every screen.
- **Stats and results:** each run is reduced to a run record (kills by enemy, seconds per biome, damage, trades, ability casts and more) that feeds missions, achievements, lifetime counters and a detailed Results breakdown. Debug runs never touch the save or the leaderboard. Quitting from the pause menu forfeits the run.
- **Player level and rank:** derived from lifetime stats (kills, bosses, minis, runs, wins, time played), levels 1-99, ranks Wood, Stone, Iron, Gold, Diamond, Netherite. Nothing extra is stored.
- **Accounts** (`src/net`, setup in `docs/FIREBASE_SETUP.md`): Guest (this browser only), Local profile (name + avatar, no password), or a Firebase account (Google or email + password) with a unique public nickname. Cloud save mirrors the local save to Firestore with revision checks and a conflict dialog (this device / my account / start fresh); a save from a newer game version is never touched by an older one. Leaderboards: Today, This week and All time for survival time (ties broken by kills), with a per-hero filter; Firestore rules bound each entry by the real time elapsed since the run started. Without Firebase configuration the game is fully local and Ranking shows the player's own bests. No analytics or ads.

---

## 18. Accessibility (v1.1)

Settings > Access (`core/accessibility.ts`):

- **Colour-blind modes** (protanopia, deuteranopia, tritanopia): a remap of the critical colour-coded cues (hostile telegraphs, boss bar, low-HP vignette, level-up card borders, companion rarity colours), not a filter over the canvas; palettes were chosen with a Machado (2009) simulation and tests assert a minimum perceptual distance. Hearts, XP and pickups differ by shape, not only colour.
- **Reduce flashing:** removes the lightning flash, hit-flash silhouettes, the invulnerability blink (steady 65% alpha instead) and the telegraph pulse, slows the creeper/TNT fuse blink to 2 Hz and turns screen shake off.
- **Text size 2x** for the in-run HUD (timer, counters) and the DOM account dialogs; the other canvas UI stays 1x (it is laid out for 320x180 and already zoomed by the integer scale).
- **Camera look-ahead** on/off, **touch controls** auto / on / off, **remappable keys**, full keyboard and gamepad menu navigation (§4), "Hunger" and "Slow" status tags next to the hearts.

---

## 19. Performance targets (v1.1)

- 60 fps with 150 enemies on screen (`?run&debug&crowd=150`) in every biome; the soft cap in normal play is 64 (+10).
- Chunk bake ≤ 4 ms per chunk at steady state; the minimap repaint is under 1 ms and happens about every 2 s; ambient particles use a fixed pool of 28 / 56 / 96 specks by quality tier with no per-frame allocation.
- Atlas: two 2048-wide pages, about 2.3 MiB for `public/atlas` (budget 5 MiB); the service worker precaches every atlas page.
- Quality tiers (auto adapts to measured frame time; high / medium / low change particles, weather and shadows).
- Minimum supported view 320x180 art pixels (integer zoom, letterboxed).
- Measurements and what they do not prove are in `docs/CHECKPOINTS.md` (Checkpoint 6).
