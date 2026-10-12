# Credits

MineSurvive is a non-commercial fan project. Not affiliated with Mojang or Microsoft. Minecraft is a trademark of Mojang Synergies AB.

## Sprites

All seven character sprite sheets (heroes, enemies, allies, animals, villagers) were created and uploaded by **Askywalker** on The Spriters Resource, in the Minecraft Customs collection (Custom / Edited section). The author allows their use with credit.

| Sheet | Source |
|---|---|
| Steve (Deltarune Battle-Style) | https://www.spriters-resource.com/custom_edited/minecraftcustoms/asset/144121/ |
| Alex (Deltarune Battle-Style) | https://www.spriters-resource.com/custom_edited/minecraftcustoms/asset/156769/ |
| Rana (Deltarune Battle-Style) | https://www.spriters-resource.com/custom_edited/minecraftcustoms/asset/156770/ |
| Enemies (Deltarune Battle-Style) | https://www.spriters-resource.com/custom_edited/minecraftcustoms/asset/138730/ |
| Allies (Deltarune Battle-Style) | https://www.spriters-resource.com/custom_edited/minecraftcustoms/asset/156864/ |
| Animals (Deltarune Battle-Style) | https://www.spriters-resource.com/custom_edited/minecraftcustoms/asset/154783/ |
| Villagers (Undertale Overworld-Style) | https://www.spriters-resource.com/custom_edited/minecraftcustoms/asset/156322/ |

The sheets are sliced and packed by the tools in `tools/`; the source files stay untouched in `assets-src/`. The same credit appears in the game under About.

## Font

Tiny5, Copyright 2022-2024 The Tiny5 Project Authors (https://github.com/Gissio/font_tiny5), licensed under the SIL Open Font License 1.1. Bundled as WOFF2 (Latin subset) in `public/fonts/` (via the `@fontsource/tiny5` npm package) together with its licence, `public/fonts/OFL.txt`. The game rasterizes it once into a 1-bit glyph atlas at its native 8 px size.

## Audio

No audio files. All music and sound effects are generated at runtime with the Web Audio API; the compositions in `src/data/music.ts` are original.

## Code

MineSurvive's code is original work for this project (Vite, TypeScript, Vitest, ESLint and Prettier are used as build tooling only). The reference project named in the brief was read for ideas, not copied.
