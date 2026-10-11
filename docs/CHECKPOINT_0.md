# Checkpoint 0 — asset pipeline, catalogue and proposed roster

## What was built

- `tools/slice_sheets.py` cuts the 7 sheets into sections and frames (feet-anchored) and writes contact sheets to `assets-work/<sheet>/contact_<n>.png` (gitignored; open them in the working directory).
- `tools/ocr_labels.py` decodes the sheets' pixel-font labels (36 glyphs, exact matching) so ~11 000 sections can be catalogued automatically.
- `tools/build_catalog.py` writes `assets-src/manifest.json` (19 841 entries) and `docs/ASSET_CATALOG.md`; `tools/validate_manifest.py` checks it (0 errors).
- `tools/build_atlas.py` packs the entries marked `ship` into `public/atlas/` (now: 3 heroes + zombie, skeleton, spider, creeper, slime; 2013 frames incl. flash variants, 1 page, 640 KiB).
- Vite + strict TS skeleton: fixed-step loop, integer-zoom canvas, atlas loader + animator, seeded RNG, input abstraction, screen router, hub with Steve idle at x3. `npm run lint`, `npm test`, `npm run build` exit 0. CI workflow added.

Sheet totals (sections / frames): steve 1352 / 6200, alex 1352 / 6203, rana 1224 / 5599, enemies 793 / 12389, allies 460 / 7058, animals 3345 / 44277, villagers 609 / 15051.

Caveat: ids, names and frame counts are auto-derived from the decoded labels and were spot-checked, not reviewed sprite by sprite. Use the contact sheets to confirm anything you care about.

## Proposed v1.0 roster (from what exists in the sheets)

Frame counts are per animation as catalogued (`idle/walk/attack/hurt/death` unless noted).

**Enemies (all from the brief exist):** Zombie, Skeleton (firing 6), Spider (attack 4 = leap), Creeper (explode 12), Slime (big/medium/small, summon 2), Cave Spider, Husk, Stray (firing 6), Drowned (throw 6; no walk, use swim/idle bob), Enderman (walk, teleport_away/appear 8; no attack/hurt/death, tint at runtime), Witch (throw 7), Silverfish, Endermite, Phantom (attack/hurt/death, no walk: flyer), Pillager (firing 5), Vindicator, Evoker (magic 8), Vex (only hurt/death found, idle to be checked), Blaze (firing 7), Magma Cube (medium/small), Piglin / Zombified Piglin, Hoglin (ram 3), Wither Skeleton, Ghast (firing/hurt/death), Guardian (firing 12), Shulker (open/close/firing/teleport).

**Bosses:** Warden (full set, walk 12), Wither (firing 5, hurt 4, death 4; no idle/walk, reuse a firing frame as idle). **Ravager: not in the sheets.** Proposal: make the 5:00 Raid Captain boss the Pillager Captain (exists: idle/firing/hurt/walk/death) with charge + stomp; Ravager goes to 1.1.

**Mini-bosses:** Piglin Brute, Charged Creeper, Vindicator Captain (use `vindicator_armor_diamond` or `pillager_captain`). **Elder Guardian: not in the sheets**; proposal: an enlarged tinted Guardian, or swap in another mini-boss.

**Pets (15, meets the target):** Chicken, Pig, Cow, Sheep, Rabbit, Cat, Parrot, Bee, Frog, Fox, Turtle, Axolotl, Wolf pup, Panda, Strider. **Allay and Sniffer are not in the sheets**; they can be replaced later (a baby Ghast sprite exists) or moved to 1.1.

**Allies (10, meets the target):** Wolf, Snow Golem, Trader Llama, five Villagers (Fletcher, Cleric, Weaponsmith, Armorer, Librarian; 4-direction sprites), Horse, Iron Golem (idle 14, walk 4, hurt 2; no death). **Polar Bear: only a baby found**, so it goes to 1.1 unless the adult is located.

**Heroes:** Steve, Alex, Rana with 8 armor tiers and 7 sword tiers; idle, punch, swing packed (talk and the other poses are catalogued but not shipped).

## How to see it

`npm run dev`, click the title, the hub shows Steve idling at x3 (Pixelify Sans text). Re-run the pipeline with `python3 tools/slice_sheets.py && python3 tools/ocr_labels.py decode && python3 tools/build_catalog.py && python3 tools/build_atlas.py`.

## Open decisions for the owner

1. **Roster gaps:** confirm the Ravager / Elder Guardian / Allay / Sniffer / Polar Bear substitutions above (or send sprites).
2. **Author names for `CREDITS.md`:** no label on the sheets names an author; please provide them.
3. Defaults taken for PLAN section 9 (logged in `docs/DECISIONS.md`): Pixelify Sans, `typescript-eslint`, numpy for tools, Vitest for the balance sim, Vite `base: './'`.
