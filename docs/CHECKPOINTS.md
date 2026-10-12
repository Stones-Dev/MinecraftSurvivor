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
