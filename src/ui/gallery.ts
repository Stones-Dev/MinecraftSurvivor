import type { View } from '../core/canvas';
import { BIOME_IDS, BIOMES, type BiomeId } from '../world/biomes';
import { propSprite } from '../world/propSprites';
import type { PropKind } from '../world/props';
import { WorldRenderer } from '../world/renderer';
import { World } from '../world/world';
import { drawText } from './panel';
import type { Screen } from './router';

const PAGES: [PropKind, number][][] = [
  [
    ['tree', 0],
    ['tree', 8],
    ['tree', 1],
    ['tree', 2],
    ['tree', 3],
    ['cactus', 0],
    ['boulder', 0],
    ['ore', 0],
    ['ore', 1],
    ['ore', 2],
    ['ore', 3],
    ['ore', 4],
    ['ore', 5],
    ['chest', 0],
  ],
  [
    ['locked_chest', 0],
    ['tallgrass', 0],
    ['flower', 0],
    ['flower', 1],
    ['flower', 2],
    ['melon', 0],
    ['pumpkin', 0],
    ['beacon', 0],
    ['campfire', 0],
    ['anvil', 0],
    ['enchant_table', 0],
    ['tnt_trap', 0],
    ['cobweb', 0],
    ['magma', 0],
  ],
];

/** Biomes per gallery page (11 biomes: two pages of rows per prop page). */
const ROWS = 6;

/**
 * Debug gallery (`?gallery=<n>`): tiles and props per biome, for look reviews. Page n shows prop page
 * floor(n / 2) for biomes 0-5 (even n) or 6-10 (odd n) of BIOME_IDS.
 */
export function galleryScreen(renderer: WorldRenderer, page = 0): Screen {
  const samples = PAGES[Math.floor(page / 2)] ?? PAGES[0] ?? [];
  const first = (page % 2) * ROWS;
  const biomes = BIOME_IDS.slice(first, first + ROWS);
  // One renderer per biome over a world that pretends every tile belongs to it.
  const renderers = new Map<BiomeId, WorldRenderer>();
  const rendererFor = (biome: BiomeId): WorldRenderer => {
    let r = renderers.get(biome);
    if (!r) {
      r = new WorldRenderer(new World(renderer.world.seed, undefined, biome));
      renderers.set(biome, r);
    }
    return r;
  };
  return {
    update() {},
    render(view: View) {
      const { ctx, width, height } = view;
      ctx.fillStyle = '#202028';
      ctx.fillRect(0, 0, width, height);
      const rowH = Math.floor(height / ROWS);
      biomes.forEach((biome, row) => {
        const y = row * rowH;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y, width, rowH - 2);
        ctx.clip();
        rendererFor(biome).drawGround(ctx, -4, -y + 40 - 128, width, rowH, null, true);
        samples.forEach(([kind, variant], i) => {
          const s = propSprite(kind, biome, variant);
          ctx.drawImage(s.canvas, 12 + i * 30 - s.ox / 2, y + rowH - 14 - s.oy);
        });
        ctx.restore();
        drawText(ctx, BIOMES[biome].name, 4, y + 10);
      });
    },
  };
}
