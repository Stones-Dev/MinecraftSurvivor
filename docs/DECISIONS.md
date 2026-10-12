# Decision log

Dated entries; newest last. Anything that deviates from `docs/BRIEF.md` is marked **Deviation**.

## 2026-10-11

- **Defaults for the open questions in PLAN section 9** (the owner started Phase 0 without answering them, so the simplest option was taken; reversible): Python + Pillow + numpy as tool-only dependencies; `typescript-eslint` + `@eslint/js` as dev dependencies; balance sim to run through Vitest (no `tsx`); Vite `base` is `./` (works on any Pages path).
- **Deviation: numpy is used by the slicer.** Pillow alone is too slow on the 20 631 px tall enemies sheet. Tool-only, never shipped.
- **Deviation: labels are decoded, not read by eye.** The sheets hold ~11 000 sections (steve 1352, alex 1352, rana 1224, enemies 793, allies 460, animals 3345, villagers 609), far too many to catalogue visually. `tools/ocr_labels.py` matches the sheets' single bitmap font glyph by glyph (`tools/font_glyphs.json`, 36 glyphs) and `tools/build_catalog.py` derives ids and the catalogue from the decoded text.
- **Sheet structure (measured).** A section is a header strip plus a cell grid. The label box sits inside the strip (black text on cell-bg). Hero sheets have one header row per section, with the armor tier given by a title above each column group. Mob sheets have 1-2 header rows (name + animation labels); each animation owns the cell columns from its label to the next one. Cell separators are full-height/width 1 px lines; the label box interrupts the separator colour in the header rows, so vertical separators are measured below the headers.
- **Manifest entry format:** `{id, sheet, section, frames:[k...], fps, loop, tags, ship}`. `ship: true` entries are packed by `build_atlas.py`. Frames are `<sheet>.<section>.<k>` in `atlas.json`; flash silhouettes are `<key>@flash`. Hurt tint is not baked yet (mob sheets already carry red hurt frames).
- **Atlas v0:** all three heroes (idle, punch, swing, every armor and sword tier) = 1864 frames + flash variants, 1 page, ~600 KiB. Mobs are not shipped yet; the roster is confirmed at Checkpoint 0.
- **Font:** Pixelify Sans (OFL 1.1) bundled as WOFF2 in `public/fonts/` with `OFL.txt`; the direct GitHub download was blocked, so it was taken from the `@fontsource/pixelify-sans` npm package. Fonts are loaded before the first canvas draw.
- **Visual check:** Playwright (`playwright-core` + the preinstalled Chromium at `/opt/pw-browsers`) works headless in this environment; the hub screenshot shows Steve idle at x3, unsmoothed. `@playwright/cli` installed globally and its skill added under `.claude/skills/playwright-cli` (not committed).
- **`assets-work/` is scratch:** a safety check blocked a wildcard delete of it, so re-slicing overwrites files in place and old frame PNGs from earlier slicer iterations may remain. `sections.json` is the source of truth. The owner can delete `assets-work/` and re-run the tools at any time.
- **Fixed: base mobs missing from the catalogue.** Plain mobs (zombie, skeleton, creeper...) have a narrow name box that is not wide enough (>10% of the block width) to count as a header row, so it was ignored. `tools/build_catalog.py` now reads the strip above the first header row (or the stand-alone box just above the block) as the name, and treats rare animation labels (`ALWAYS_ANIM`) as animations. Result: base mobs, bosses and most of the brief's roster now have ids. Names and frame counts are auto-derived, not checked sprite by sprite; the contact sheets are there for that.
- **Manifest validator:** `tools/validate_manifest.py` checks fields, unique ids and that every listed frame exists.
- **Atlas v0 contents:** the three heroes plus the core mobs (zombie, skeleton, spider, creeper, slime big/medium/small) to prove the pipeline (~640 KiB). The rest is packed once the roster is confirmed.

## 2026-10-11 — Checkpoint 0 answer

- **Owner approved Checkpoint 0 ("apruebo todo").** Accepted: the proposed v1.0 roster and its substitutions (5:00 boss = Pillager Captain instead of Ravager; Elder Guardian mini-boss replaced by an enlarged tinted Guardian or another mini-boss; Allay and Sniffer out of v1.0 or replaced; Polar Bear to 1.1 unless the adult sprite is found), and the defaults taken for PLAN section 9.
- **Resolved later:** the owner supplied the sprite author (Askywalker, The Spriters Resource, Minecraft Customs) and the seven source links; they are in `CREDITS.md` and in the About screen (see the 2026-10-12 hero and credits entry).

## 2026-10-11 — New working agreement

- **Checkpoints are no longer blocking (owner instruction).** At each checkpoint: write the summary (with Playwright screenshots when possible) to `docs/CHECKPOINTS.md`, log decisions taken alone here, commit, push and continue with the next phase. Open questions are resolved with the most reasonable option; owner feedback arrives as queued messages and is applied when it arrives. Work continues until the Definition of Done (BRIEF section 17) is met and `v1.0.0` is tagged. `CLAUDE.md` still says "stop at every CHECKPOINT"; the owner's newer instruction supersedes it, and the file is left unchanged for the owner to edit.

## 2026-10-12 — Phase 3 decisions (taken alone)

- **Boss roster (5:00 / 10:00 / 15:00):** Raid Captain (replaces the Ravager, approved at Checkpoint 0), Wither, Warden. Mini-bosses are drawn from Vindicator Captain, Piglin Brute, Guardian (Elder Guardian substitute) and Charged Creeper. Killing the Warden sets `won` and starts Endless (a boss returns every 5 minutes, +50% strength each time, spawn pressure grows).
- **Nether rift is a separate `World` (`Arena{r}`)**, not a flag on the overworld: entering stashes enemies/projectiles/pickups/zones/mines/telegraphs/orbiters/NPCs and restores them on leave, so the overworld is truly frozen. A timed-out rift returns the hero at 30% HP instead of killing them.
- **Weather is cosmetic plus rare hazards:** thunderstorms (12% per minute check, telegraphed bolts, creepers hit become Charged), snow is purely visual in the Taiga. Warden darkness shrinks the view.
- **Events are suppressed while a boss is alive** (Golden Hour, Raid, storms, trader, villager), and the spawn multiplier drops to 0.25 during a boss.
- **Balance sim:** `npm run balance` (Vitest used as a TS runner via `vitest.balance.config.ts`; `tools/node-shim.d.ts` supplies minimal Node typings so no `@types/node` dependency is added). The bot (`tools/balance/bot.ts`) has two policies, `smart` (kites, sidesteps projectiles, avoids TNT traps and creepers, picks evolutions > weapon levels > tiers > passives) and `newbie` (late reactions, random cards).
- **Balance change: base regeneration 0.4 HP/s** (`baseMods().regen`). With no baseline regen every early hit was permanent, so even a competent bot spent minutes fleeing at low HP without killing anything (the sim made this obvious: median 4:20 with 19 kills). The shield test was made independent of regen.
- **Balance change: Sword levels buffed** (L1 14 dmg / 0.85 s / 38 reach, up to 32 dmg / 0.6 s / 54 at L5). The starting weapon could not kill a 20 HP zombie before contact (10 dmg per 1.0 s), which made the new-player experience a coin flip.

## 2026-10-12 — Phase 4 decisions (taken alone)

- **Pet roster is 15 and ally roster is 10** (Allay, Sniffer and the adult Polar Bear were dropped at Checkpoint 0). Trader Llama uses the wandering-trader llama sprites.
- **Alex starts with the Sword and a level-2 Bow** (the brief says "bow starts at level 2"; it does not say Alex loses the sword, and the sword drives the swing animation and tiers). Her lower HP (90) is the counterweight.
- **Ally strength scales with companion level** (+20% HP and damage per level above 1); pet buff tables are in `data/companions.ts` and Kennel multiplies them by 1 + 10% per rank.
- **Permanent upgrade costs:** rank n costs `base x (1 + 0.7 n)`; Repertoire (second starting weapon, random from TNT/Crossbow/Snowball/Trident/Axe) and Leadership are single-rank and expensive (600 / 900).
- **Gacha seeding:** pull `n` uses `Rng(hash(gachaSeed, n))`. The x10 guarantee only applies to exactly ten pulls; pity is checked before it.
- **Atlas size:** adding the pet/ally/villager sprites brought the atlas to ~1.16 MiB PNG + 0.55 MiB JSON. Still a single page; a smaller shipped subset can be chosen in Phase 5 if load time matters.
- **Debug URL params added:** `?screen=collection|spawner|upgrades|settings|setup`, `?hero=&pet=&ally=a,b&lv=&kennel=`. `?t=` only works together with `debug`.

## 2026-10-12 — Release tag

- **`v1.0.0` is created locally but could not be pushed from the build session:** the session's git proxy answers HTTP 403 to tag pushes (branch pushes to `claude/sleepy-bardeen-wme7gt` work). It was not worked around. The tag points at the commit that carries this note's parent state; to publish it run `git fetch origin claude/sleepy-bardeen-wme7gt && git tag -a v1.0.0 -m "MineSurvive v1.0.0" origin/claude/sleepy-bardeen-wme7gt && git push origin v1.0.0` (or create the release in GitHub). The Pages workflow also runs on pushes to `main`, so merging the branch deploys the game.

## 2026-10-12 — Hero clauses, credits and release (owner instructions)

- **Sprite credits supplied by the owner:** all seven sheets are by Askywalker (The Spriters Resource, Minecraft Customs, Custom / Edited), allowed with credit. They are in `CREDITS.md` and on a second page of the About screen with the seven source links. Every "pending authors" placeholder was removed.
- **Steve's armor clause implemented as written (BRIEF section 6).** Armor tiers now cost 2 cards for every hero (the offer shows "Card 1 of 2"), and 1 card for Steve (*Builder's Grit*: "armor tier upgrades cost one fewer card"); his first Leather tier is still handed out free at minute 1. Anvils and the Armorer ally grant tiers outside the card cost and reset partial progress. Consequence: Alex and Rana now build armor at half the speed of Steve; the balance simulator plays Steve, so its numbers are unchanged.
- **Rana's slime rule implemented as written.** Slimes and magma cubes give her double XP, and a slime lineage splits at most once: a Big Slime still splits into two Mediums, but those children never split again (they carry `splitDepth` 1). Other heroes keep Big > Medium > Small. Tests: `tests/heroes.test.ts`.
- **Release:** at the owner's instruction (tags are not pushed from the build session), the work branch is merged into `main` and `main` is pushed; `v1.0.0` can be created from that commit by the owner.
