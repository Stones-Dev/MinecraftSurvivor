import type { View } from '../core/canvas';
import { PixBuffer } from '../core/pixelart';
import {
  LIQUID,
  LIQUID_FRAMES,
  liquidSet,
  MATERIAL_COUNT,
  materialName,
  materialVariants,
  type MaterialId,
  TEX,
  TEX_AREA,
} from '../world/blocks';
import { BIOME_IDS, BIOMES, BIOME_INDEX, type BiomeId } from '../world/biomes';
import { PROP_GALLERY, propSprite } from '../world/propSprites';
import { WorldRenderer } from '../world/renderer';
import { paintBlock } from '../world/tilePaint';
import { World } from '../world/world';
import { drawText } from './panel';
import type { Screen } from './router';

const PAGES = PROP_GALLERY;

/** Biomes per gallery page (11 biomes: two pages of rows per prop page). */
const ROWS = 6;

/** First block-texture page: they come after every prop page. */
export const TILE_PAGE0 = PAGES.length * 2;

/**
 * Debug gallery (`?gallery=<n>`): tiles and props per biome, for look reviews. Page n < TILE_PAGE0
 * shows prop page floor(n / 2) for biomes 0-5 (even n) or 6-10 (odd n) of BIOME_IDS; page
 * TILE_PAGE0 + i is the block-texture sheet of biome i (every material and variant at 1x, tinted for
 * that biome, plus the water and lava animation frames).
 */
export function galleryScreen(renderer: WorldRenderer, page = 0): Screen {
  if (page >= TILE_PAGE0)
    return blockSheetScreen(BIOME_IDS[(page - TILE_PAGE0) % BIOME_IDS.length]);
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
          ctx.drawImage(s.canvas, 22 + i * 44 - s.ox / 2, y + rowH - 14 - s.oy);
        });
        ctx.restore();
        drawText(ctx, BIOMES[biome].name, 4, y + 10);
      });
    },
  };
}

const CELL = TEX + 1;
const SLOTS = 8;
const COL_W = SLOTS * CELL + 6;
const ROW_H = TEX + 11;
const SHEET_ROWS = 8;

/** Block-texture review sheet of one biome: labelled rows of every variant, three columns. */
function blockSheetScreen(biome: BiomeId = 'plains'): Screen {
  const rows: { label: string; paint: (buf: PixBuffer, x: number, y: number) => void }[] = [];
  for (let m = 0; m < MATERIAL_COUNT; m++) {
    const mat = m as MaterialId;
    rows.push({
      label: materialName(mat),
      paint: (buf, x, y) => {
        for (let v = 0; v < materialVariants(mat); v++)
          paintBlock(buf, x + v * CELL, y, mat, v, biome);
      },
    });
  }
  // Liquids: the four frames of open water/lava, then the four frames of a one-tile pool (all shores).
  const liquid = (label: string, set: Uint32Array): void => {
    rows.push({
      label,
      paint: (buf, x, y) => {
        for (let k = 0; k < SLOTS; k++) {
          const mask = k < LIQUID_FRAMES ? 0 : 15;
          const off = (mask * LIQUID_FRAMES + (k % LIQUID_FRAMES)) * TEX_AREA;
          for (let j = 0; j < TEX; j++)
            for (let i = 0; i < TEX; i++)
              buf.data[(y + j) * buf.w + x + k * CELL + i] = set[off + j * TEX + i] ?? 0;
        }
      },
    });
  };
  liquid('water (frames, pool)', liquidSet(LIQUID.WATER, BIOME_INDEX[biome]));
  liquid('lava (frames, pool)', liquidSet(LIQUID.LAVA, 0));
  const top = 12;
  const cols = Math.ceil(rows.length / SHEET_ROWS);
  const buf = new PixBuffer(cols * COL_W, SHEET_ROWS * ROW_H);
  const pos = rows.map((_, i) => ({
    x: Math.floor(i / SHEET_ROWS) * COL_W,
    y: (i % SHEET_ROWS) * ROW_H + 9,
  }));
  rows.forEach((r, i) => r.paint(buf, pos[i]?.x ?? 0, pos[i]?.y ?? 0));
  let canvas: HTMLCanvasElement | null = null;
  return {
    update() {},
    render(view: View) {
      const { ctx, width, height } = view;
      ctx.fillStyle = '#202028';
      ctx.fillRect(0, 0, width, height);
      canvas ??= buf.toCanvas();
      ctx.drawImage(canvas, 2, top);
      drawText(
        ctx,
        `Blocks: ${BIOMES[biome].name} (gallery=${TILE_PAGE0}..${TILE_PAGE0 + BIOME_IDS.length - 1})`,
        2,
        9,
      );
      rows.forEach((r, i) =>
        drawText(ctx, r.label, 2 + (pos[i]?.x ?? 0), top + (pos[i]?.y ?? 0) - 1, '#c8c8d0'),
      );
    },
  };
}
