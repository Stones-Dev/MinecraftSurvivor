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
