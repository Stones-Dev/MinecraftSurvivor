import type { View } from '../core/canvas';
import { BIOME_ORDER, BIOMES, biomeState } from '../world/biomes';
import { propSprite } from '../world/propSprites';
import type { PropKind } from '../world/props';
import type { WorldRenderer } from '../world/renderer';
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

/** Debug gallery (`?gallery`): tiles and props per biome, for look reviews. */
export function galleryScreen(renderer: WorldRenderer, page = 0): Screen {
  const samples = PAGES[page] ?? PAGES[0] ?? [];
  return {
    update() {},
    render(view: View) {
      const { ctx, width, height } = view;
      ctx.fillStyle = '#202028';
      ctx.fillRect(0, 0, width, height);
      const rowH = Math.floor(height / BIOME_ORDER.length);
      BIOME_ORDER.forEach((biome, row) => {
        const y = row * rowH;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y, width, rowH - 2);
        ctx.clip();
        const state = { ...biomeState(0), current: biome };
        renderer.drawGround(ctx, -4, -y + 40 - 128, width, rowH, state, true);
        samples.forEach(([kind, variant], i) => {
          const s = propSprite(kind, biome, variant);
          ctx.drawImage(s.canvas, 12 + i * 30 - s.ox / 2, y + rowH - 14 - s.oy);
        });
        ctx.restore();
        ctx.fillStyle = '#fff';
        ctx.font = '8px "Pixelify Sans", monospace';
        ctx.fillText(BIOMES[biome].name, 4, y + 10);
      });
    },
  };
}
