# MineSurvive — Game Design Document (living)

Seeded from the design sections of `docs/BRIEF.md` (sections 1 and 5-15). Update this file whenever a decision changes; deviations are logged in `docs/DECISIONS.md`.

## 1. Game identity

- **Title:** MineSurvive. Tagline: *Survive the night. Gear up. Collect every mob.*
- **Genre:** bullet-heaven / horde survival + roguelike run structure + meta-progression + gacha collection.
- **Camera:** 2D top-down open world (like pokesurvivor), but all character sprites are **side-view** (Deltarune battle style), so entities face left/right only (flip horizontally); movement is 8-directional on the ground plane.
- **Signature twist #1 — visible gearing:** the hero's armor and sword tiers are real in-run upgrades and **change the sprite** (No armor → Leather → Chainmail → Iron → Gold → Diamond → Netherite → Enchanted; sword Wood → Stone → Iron → Gold → Diamond → Netherite → Enchanted). You *see* yourself getting stronger.
- **Signature twist #2 — companions from the gacha:** **Pets** (follow you, passive buffs), **Allies** (fight next to you, chosen at run start) and **Heroes** (playable characters). Duplicates level companions up.
- **Mood:** cosy pixel-art Minecraft fan vibe by day, tense at night. No gore, no blood (hurt = red flash frames, which the sheets already have).
- **Non-commercial fan game.** Show a legal notice: not affiliated with Mojang/Microsoft; Minecraft is a trademark of Mojang Synergies AB; sprites credited to their authors (see §3.5). No real-money anything. Never use official Minecraft textures, music or sounds.

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
- HUD: HP bar (hearts style) top-left, XP bar full-width top with level, timer centre, kill counter, Emeralds/Eggs, weapon/passive slots bottom-left with levels, armor & sword tier icons next to the hero portrait, boss HP bar when a boss is alive, pet/ally portraits with ally HP, screen-edge arrows for portal/Charged/lost villager, and a corner **minimap** (toggle `M`, hidden while touch controls are up): fog of war revealed around the hero in 8x8-tile cells (a sparse bitset), biome ground colours, water and lava, dots for the portal, trader, lost villager and Charged mobs. "Hunger" and "Slow" tags appear next to the hearts while they apply.
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

---

## 16. As shipped (v1.0)

This section is the source of truth where it differs from the brief text above; every deviation is explained in `docs/DECISIONS.md`.

**Content counts.** 14 weapons (Sword, Bow, TNT, Crossbow, Trident, Snowball, Fishing Rod, Harming and Poison potions, Lava Bucket, Lightning Rod, Blaze Rods, Axe, Shield), each with 5 levels and an evolution (14 evolutions); 24 passives (enchantments and potion effects); 7 armor tiers and 7 sword tiers (the sprite swaps; the top tier glints); 8 items; about 30 regular enemy types over 11 AI archetypes plus 3 bosses (Raid Captain at 5:00 replacing the Ravager, Wither at 10:00, Warden at 15:00) and 4 mini-bosses; 4 biomes (Plains, Dark Forest, Snowy Taiga, Desert) rotating every 4 minutes plus the Nether rift arena; 3 heroes, 15 pets, 10 allies; 8 procedural music themes and about 30 sound effects.

**Run rules.** Fixed 60 Hz simulation, all randomness from seeded streams. Base hero regeneration is 0.4 HP/s (added after balance simulation). Armor tiers cost 2 cards (1 for Steve); level-up offers 3 cards (4 with the Librarian), 1 reroll (+ Reroll upgrade), skip pays 25 Emeralds. The soft enemy cap is 64 (+10 overflow for tides and raids); pickups are capped at 300 (oldest XP orbs are banked automatically). Golden Hour, Raids, Thunderstorms, the trader and the lost villager are suppressed while a boss is alive. Winning means killing the Warden; Endless then sends a stronger boss every 5 minutes.

**Heroes.** Steve: 110 HP (Builder's Grit: +10% HP, armor tiers cost 1 card instead of 2, first Leather tier free at minute 1). Alex: 90 HP, +5% damage, +8% speed, projectiles +15% speed and +1 pierce, starts with the Sword and a level-2 Bow. Rana: 85 HP, +4% speed, +10% luck, water immunity, double XP from slimes and magma cubes and a slime lineage splits at most once (Big > two Mediums that do not split again).

**Companions.** Pets follow with a lazy spring and are invulnerable; allies fight, take contact damage and return 20 s after being downed at 50% HP. Levels 2-5 need 1/2/3/4 more duplicates; further duplicates refund Emeralds (30/60/120/250/500 by rarity). Kennel multiplies pet buffs by 1 + 10% per rank; Leadership adds the second ally slot. Ally HP and damage grow 20% per level.

**Economy.** Run reward = (time/5 + kills/4 + 80 per boss + 40 per mini-boss + Emeralds picked) x (Looting upgrade x Pig); Looting and Pig apply to the payout only, so in-run drop rates are unaffected. Spawn Egg: 1/400 per kill, locked chests 1-3, events, Charged mobs; Rare Spawn Egg: bosses, rift wins, 15% of locked chests, 5% of diamond ore. New saves start with 500 Emeralds.

**Gacha.** One banner ("Overworld Spawner") with rates 50 / 28 / 15 / 5.5 / 1.5, a x10 that always contains a Rare or better, Legendary pity at 60, seeded per save (`gachaSeed` + pull index). Banners are data (`systems/gacha.ts`).

**Platform.** Installable PWA with a service worker (offline after the first load), saves in `localStorage` behind a versioned `SaveStore` (corrupt or newer saves are kept under `.bak`), controls remappable, quality tiers (auto adapts to frame time), GitHub Pages deploy through `.github/workflows/deploy.yml`.
