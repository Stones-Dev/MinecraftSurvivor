/** Pure prop placement: one candidate per 2x2-tile cell, decided by stateless hashes. */
import { fbm, hash2 } from '../core/noise';
import { BIOMES, type BiomeId } from './biomes';
import { type Arena, CHUNK_TILES, SPAWN_CLEAR, TILE, TILE_PX, tileAt } from './terrain';

export type PropKind =
  | 'tree'
  | 'boulder'
  | 'ore'
  | 'chest'
  | 'locked_chest'
  | 'tallgrass'
  | 'flower'
  | 'cactus'
  | 'melon'
  | 'pumpkin'
  | 'beacon'
  | 'campfire'
  | 'anvil'
  | 'enchant_table'
  | 'tnt_trap'
  | 'cobweb'
  | 'magma';

/** Ore types stored in `variant % 8`. */
export const ORE_TYPES = ['coal', 'iron', 'gold', 'lapis', 'redstone', 'diamond'] as const;
export type OreType = (typeof ORE_TYPES)[number];

export interface Prop {
  /** Cell id, stable across biomes so a crossfade can match props. */
  id: string;
  kind: PropKind;
  /** type = variant % 8 (species, ore kind...), shape = floor(variant / 8) (sprite look). */
  variant: number;
  /** Feet position on the ground plane, world pixels. */
  x: number;
  y: number;
  radius: number;
  solid: boolean;
}

/** Per-cell chances (cumulative after trees/cacti). */
const P = {
  boulder: 0.012,
  ore: 0.006,
  chest: 0.003,
  locked: 0.0012,
  melon: 0.004,
  beacon: 0.0006,
  campfire: 0.0015,
  anvil: 0.0006,
  enchant: 0.0006,
  tnt: 0.0015,
} as const;

const CELL_TILES = 2;
const CELLS_PER_CHUNK = CHUNK_TILES / CELL_TILES;

const RADIUS: Record<PropKind, number> = {
  tree: 4,
  boulder: 6,
  ore: 6,
  chest: 5,
  locked_chest: 5,
  tallgrass: 0,
  flower: 0,
  cactus: 4,
  melon: 4,
  pumpkin: 4,
  beacon: 0,
  campfire: 0,
  anvil: 0,
  enchant_table: 0,
  tnt_trap: 0,
  cobweb: 0,
  magma: 0,
};

export function propType(p: Pick<Prop, 'variant'>): number {
  return p.variant % 8;
}

export function propShape(p: Pick<Prop, 'variant'>): number {
  return Math.floor(p.variant / 8);
}

function make(id: string, kind: PropKind, type: number, shape: number, x: number, y: number): Prop {
  let radius = RADIUS[kind];
  if (kind === 'tree' && type === 2) radius = 5;
  return { id, kind, variant: type + 8 * shape, x, y, radius, solid: radius > 0 };
}

export function genProps(
  cx: number,
  cy: number,
  seed: number,
  biome: BiomeId,
  arena?: Arena,
): Prop[] {
  const b = BIOMES[biome];
  const out: Prop[] = [];
  for (let j = 0; j < CELLS_PER_CHUNK; j++) {
    for (let i = 0; i < CELLS_PER_CHUNK; i++) {
      const gx = cx * CELLS_PER_CHUNK + i;
      const gy = cy * CELLS_PER_CHUNK + j;
      const tx = gx * CELL_TILES;
      const ty = gy * CELL_TILES;
      if (Math.hypot(tx + 1, ty + 1) < (arena ? 5 : SPAWN_CLEAR + 1)) continue;
      if (
        tileAt(tx, ty, seed, arena) !== TILE.GRASS ||
        tileAt(tx + 1, ty, seed, arena) !== TILE.GRASS ||
        tileAt(tx, ty + 1, seed, arena) !== TILE.GRASS ||
        tileAt(tx + 1, ty + 1, seed, arena) !== TILE.GRASS
      ) {
        continue;
      }
      const x = tx * TILE_PX + 4 + hash2(gx, gy, seed + 11) * 24;
      const y = ty * TILE_PX + 10 + hash2(gx, gy, seed + 12) * 20;
      const shape = Math.floor(hash2(gx, gy, seed + 13) * 4);
      const id = `${gx},${gy}`;
      const r = hash2(gx, gy, seed + 404);
      const grove = fbm(gx * 0.12, gy * 0.12, seed + 505);
      const v = hash2(gx, gy, seed + 707);
      let acc = 0;
      if (arena) {
        // Basalt pillars for cover; nothing else grows in the Nether arena.
        if (r < 0.07 && Math.hypot(tx, ty) < arena.r - 4)
          out.push(make(id, 'boulder', 0, shape, x, y));
        continue;
      }
      const roll = (p: number): boolean => {
        acc += p;
        return r < acc;
      };
      if (b.treeKind !== 'none') {
        const treeP = b.treeBase + (grove > 0.6 ? b.groveBonus : 0);
        if (roll(treeP)) {
          const type =
            b.treeKind === 'dark_oak'
              ? v < 0.8
                ? 2
                : 0
              : b.treeKind === 'spruce'
                ? 3
                : v < 0.72
                  ? 0
                  : 1;
          out.push(make(id, 'tree', type, shape, x, y));
          continue;
        }
      } else if (roll(b.cactusBase + (grove > 0.62 ? 0.05 : 0))) {
        out.push(make(id, 'cactus', 0, shape, x, y));
        continue;
      }
      if (roll(P.boulder)) {
        out.push(make(id, 'boulder', 0, shape, x, y));
      } else if (roll(P.ore)) {
        const type = v < 0.4 ? 0 : v < 0.65 ? 1 : v < 0.77 ? 2 : v < 0.85 ? 3 : v < 0.93 ? 4 : 5;
        out.push(make(id, 'ore', type, shape, x, y));
      } else if (roll(P.chest)) {
        out.push(make(id, 'chest', 0, 0, x, y));
      } else if (roll(P.locked)) {
        out.push(make(id, 'locked_chest', 0, 0, x, y));
      } else if (roll(biome === 'desert' ? 0 : P.melon)) {
        out.push(make(id, v < 0.5 ? 'melon' : 'pumpkin', 0, shape, x, y));
      } else if (roll(P.beacon)) {
        out.push(make(id, 'beacon', 0, 0, x, y));
      } else if (roll(P.campfire)) {
        out.push(make(id, 'campfire', 0, 0, x, y));
      } else if (roll(P.anvil)) {
        out.push(make(id, 'anvil', 0, 0, x, y));
      } else if (roll(P.enchant)) {
        out.push(make(id, 'enchant_table', 0, 0, x, y));
      } else if (roll(P.tnt)) {
        out.push(make(id, 'tnt_trap', 0, 0, x, y));
      } else if (roll(biome === 'dark_forest' ? 0.006 : 0.003)) {
        out.push(make(id, 'cobweb', 0, shape, x, y));
      } else if (roll(biome === 'desert' || biome === 'dark_forest' ? 0.001 : 0)) {
        out.push(make(id, 'magma', 0, shape, x, y));
      } else {
        const d = hash2(gx, gy, seed + 606);
        if (d < 0.22) out.push(make(id, 'tallgrass', 0, shape, x, y));
        else if (d < 0.3 && biome !== 'desert') {
          out.push(make(id, 'flower', v < 0.4 ? 0 : v < 0.75 ? 1 : 2, shape, x, y));
        }
      }
    }
  }
  return out;
}
