/** Pure prop placement: one candidate per 2x2-tile cell, decided by stateless hashes. */
import { fbm, hash2 } from '../core/noise';
import { BIOMES, type BiomeId } from './biomes';
import { CHUNK_TILES, SPAWN_CLEAR, TILE, TILE_PX, tileAt } from './terrain';

export type PropKind = 'tree' | 'boulder' | 'ore' | 'chest' | 'tallgrass' | 'flower';

export interface Prop {
  /** Cell id, stable across biomes so a crossfade can match props. */
  id: string;
  kind: PropKind;
  /** type = variant % 4 (e.g. tree species, ore kind), shape = floor(variant / 4) (sprite look). */
  variant: number;
  /** Feet position on the ground plane, world pixels. */
  x: number;
  y: number;
  radius: number;
  solid: boolean;
}

const CELL_TILES = 2;
const CELLS_PER_CHUNK = CHUNK_TILES / CELL_TILES;

function make(id: string, kind: PropKind, type: number, shape: number, x: number, y: number): Prop {
  const radius = {
    tree: type === 2 ? 5 : 4,
    boulder: 6,
    ore: 6,
    chest: 5,
    tallgrass: 0,
    flower: 0,
  }[kind];
  return { id, kind, variant: type + 4 * shape, x, y, radius, solid: radius > 0 };
}

export function genProps(cx: number, cy: number, seed: number, biome: BiomeId): Prop[] {
  const b = BIOMES[biome];
  const out: Prop[] = [];
  for (let j = 0; j < CELLS_PER_CHUNK; j++) {
    for (let i = 0; i < CELLS_PER_CHUNK; i++) {
      const gx = cx * CELLS_PER_CHUNK + i;
      const gy = cy * CELLS_PER_CHUNK + j;
      const tx = gx * CELL_TILES;
      const ty = gy * CELL_TILES;
      if (Math.hypot(tx + 1, ty + 1) < SPAWN_CLEAR + 1) continue;
      if (
        tileAt(tx, ty, seed) !== TILE.GRASS ||
        tileAt(tx + 1, ty, seed) !== TILE.GRASS ||
        tileAt(tx, ty + 1, seed) !== TILE.GRASS ||
        tileAt(tx + 1, ty + 1, seed) !== TILE.GRASS
      ) {
        continue;
      }
      const x = tx * TILE_PX + 4 + hash2(gx, gy, seed + 11) * 24;
      const y = ty * TILE_PX + 10 + hash2(gx, gy, seed + 12) * 20;
      const shape = Math.floor(hash2(gx, gy, seed + 13) * 4);
      const id = `${gx},${gy}`;
      const r = hash2(gx, gy, seed + 404);
      const grove = fbm(gx * 0.12, gy * 0.12, seed + 505);
      const treeP = b.treeBase + (grove > 0.6 ? b.groveBonus : 0);
      const v = hash2(gx, gy, seed + 707);
      if (r < treeP) {
        const type = biome === 'dark_forest' ? (v < 0.8 ? 2 : 0) : v < 0.72 ? 0 : 1;
        out.push(make(id, 'tree', type, shape, x, y));
      } else if (r < treeP + 0.012) {
        out.push(make(id, 'boulder', 0, shape, x, y));
      } else if (r < treeP + 0.017) {
        out.push(make(id, 'ore', v < 0.6 ? 0 : 1, shape, x, y));
      } else if (r < treeP + 0.02) {
        out.push(make(id, 'chest', 0, 0, x, y));
      } else {
        const d = hash2(gx, gy, seed + 606);
        if (d < 0.22) out.push(make(id, 'tallgrass', 0, shape, x, y));
        else if (d < 0.3) out.push(make(id, 'flower', v < 0.4 ? 0 : v < 0.75 ? 1 : 2, shape, x, y));
      }
    }
  }
  return out;
}
