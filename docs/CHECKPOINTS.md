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

Balance (`docs/BALANCE.md`, `npm run balance`): a headless bot plays real `RunState`s with two policies. Findings that changed the game: a base regeneration of 0.4 HP/s and a stronger Sword. Fresh Steve with only the sword now dies around 5:00 for a competent bot; ranged starters with smart card picks reach the Wither (median 9-10 min).

Self code review (independent read-only pass, 27 findings, all verified by reading the code). Fixed: lightning left "undead" enemies; Endless bosses could spawn in a burst; rift kill rewards (XP/emeralds) were discarded and rift foes also paid mini-boss rewards; reroll at an enchanting table produced an exploitable normal offer; scheduled callbacks (lightning) survived the rift swap; a death and a win in the same frame counted as a loss; old fleeing villagers broke the next escort and doubled its timer; module-level NPC id counter broke determinism; the last DoT tick was lost; two banner carriers per raid; a second item prompt overwrote the first; the anvil was consumed when nothing could be upgraded; save loading kept mistyped fields, silently replaced unreadable or newer saves (now backed up under `.bak` and never overwritten), imports accepted anything, "NEW RECORD" compared floats, and `?t=` inflated rewards without `debug`. Performance fixes: numeric chunk keys and a cached removed-prop check in the collision path, an allocation-free biome lookup, memoised enemy animation ids, tighter spatial-hash query bounds plus bucket cleanup, pre-rendered pool discs, batched damage text with a cap, off-screen culling and a 300-orb cap (the oldest are banked as XP), hazard props refreshed 3 times a second, early-out in prop overlays. Not done (low value or large): pooling `Fx` objects, pre-rendering damage digits, a `collide()` output object reuse.

Tests: 264 (weapons, world events, rifts, bosses, saves, gacha, meta).

Screenshots: `p3-gallery-a/b.png` (props), `p3-taiga.png`, `p3-desert.png`, `p3-boss.png`, `p3-npcs-portal.png`, `p3-rift.png`, `p3-weapons-a..d.png`. Headless run: 60 FPS with ~80 enemies.

## Checkpoint 4 — meta

Built: data-driven Spawner (`systems/gacha.ts`, banner list ready for 1.1): rates 50/28/15/5.5/1.5, a x10 that always holds a Rare or better, Legendary pity at 60, seeded per save (`gachaSeed` + pull index), duplicates level a companion with 1/2/3/4 copies and refund Emeralds past level 5, hero duplicates give 5 shards and 500 Emeralds. 3 heroes (Steve, Alex and Rana with their passives), 15 pets and 10 allies with per-level buffs and lore quips. Pets follow with a lazy spring; allies fight (wolf, snow golem, trader llama, fletcher, cleric, weaponsmith, armorer, librarian, horse with trample and a `Space` sprint, iron golem with taunt and slam), take contact damage, go downed and return after 20 s at 50% HP. Permanent upgrades (11 per hero plus Leadership and Kennel account-wide), Collection (tabs, level pips, shard progress, buffs, lore, equip), Run setup, Settings (audio, graphics, remappable controls, export/import/reset), a first-run tutorial overlay and a hub with the equipped hero and companions. Spawner screen: caged spawner with flames by rarity, lightning for Legendary, spin / reveal for x1, tray for x10, click to skip.

Tests added: 9 gacha tests (1e6 rate check within 1%, pity, x10, dupes, determinism), 8 meta tests (hero passives, upgrades, Kennel scaling, loadout from save, ally lifecycle), 3 save-hardening tests.

Screenshots: `p4-hub.png`, `p4-collection.png`, `p4-spawner.png`, `p4-spawner-spin.png`, `p4-spawner-reveal.png`, `p4-spawner-x10.png`, `p4-upgrades.png`, `p4-settings.png`, `p4-setup.png`, `p4-run-companions.png`.

Known gaps carried to Phase 5: no About/credits screen yet, `quality` is stored but the render quality tiers arrive with the performance pass, music and the Legendary sting are pending.
