/** Pure prop placement: one candidate per 2x2-tile cell, decided by stateless hashes and the cell's biome. */
import { fbm, hash2 } from '../core/noise';
import { biomeAtTile } from './biomeMap';
import { type Biome, BIOMES, type BiomeId } from './biomes';
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
  | 'magma'
  | 'bamboo';

/** Ore types stored in `variant % 8`. */
export const ORE_TYPES = ['coal', 'iron', 'gold', 'lapis', 'redstone', 'diamond'] as const;
export type OreType = (typeof ORE_TYPES)[number];

export interface Prop {
  /** Cell id (stable key for removed props). */
  id: string;
  kind: PropKind;
  /** Biome of the cell the prop grew in (drives its palette / sprite style). */
  biome: BiomeId;
  /** type = variant % 8 (species, ore kind...), shape = floor(variant / 8) (sprite look). */
  variant: number;
  /** Feet position on the ground plane, world pixels. */
  x: number;
  y: number;
  radius: number;
  solid: boolean;
  /** World bookkeeping (removed-prop cache): version at which `gone` was last computed. */
  chk?: number;
  gone?: boolean;
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
  bamboo: 3,
};

export function propType(p: Pick<Prop, 'variant'>): number {
  return p.variant % 8;
}

export function propShape(p: Pick<Prop, 'variant'>): number {
  return Math.floor(p.variant / 8);
}

function make(
  id: string,
  kind: PropKind,
  type: number,
  shape: number,
  x: number,
  y: number,
  biome: BiomeId,
): Prop {
  let radius = RADIUS[kind];
  if (kind === 'tree' && type === 2) radius = 5;
  return { id, kind, biome, variant: type + 8 * shape, x, y, radius, solid: radius > 0 };
}

/** Flower species stored in `variant % 8` (plains and forest; other biomes map them to their own plants). */
const MEADOW_FLOWERS = ['poppy', 'dandelion', 'cornflower', 'oxeye_daisy'] as const;

/**
 * Sprite style of a prop: which art family draws it (propSprites.ts has one painter per style, checked by
 * the compiler through `Record<PropStyle, ...>`). The biome palette tints most styles.
 */
export type PropStyle =
  // Trees and tree-sized props.
  | 'oak'
  | 'birch'
  | 'dark_oak'
  | 'spruce'
  | 'cherry_tree'
  | 'jungle_tree'
  | 'jungle_bush'
  | 'swamp_oak'
  | 'huge_mushroom'
  // Rocks.
  | 'boulder'
  | 'mossy_boulder'
  | 'sandstone_rock'
  | 'snowy_rock'
  | 'terracotta_rock'
  | 'basalt'
  // Ground plants (no collision).
  | 'tall_grass'
  | 'fern'
  | 'large_fern'
  | 'sweet_berry_bush'
  | 'dead_bush'
  | 'dry_grass'
  | 'sugar_cane'
  | (typeof MEADOW_FLOWERS)[number]
  | 'allium'
  | 'blue_orchid'
  | 'pink_tulip'
  | 'pink_petals'
  | 'red_mushroom'
  | 'brown_mushroom'
  // Everything else is drawn by the style of the same name as its kind.
  | Exclude<PropKind, 'tree' | 'boulder' | 'tallgrass' | 'flower'>;

export function propStyleFor(biome: BiomeId, kind: PropKind, variant = 0): PropStyle {
  const type = variant % 8;
  const shape = Math.floor(variant / 8);
  switch (kind) {
    case 'tree':
      if (biome === 'cherry_grove') return 'cherry_tree';
      if (biome === 'jungle') return type === 2 ? 'jungle_tree' : 'jungle_bush';
      if (biome === 'swamp') return 'swamp_oak';
      if (biome === 'mushroom_fields') return 'huge_mushroom';
      return type === 1 ? 'birch' : type === 2 ? 'dark_oak' : type === 3 ? 'spruce' : 'oak';
    case 'boulder':
      switch (biome) {
        case 'nether':
          return 'basalt';
        case 'badlands':
          return 'terracotta_rock';
        case 'mushroom_fields':
          return 'huge_mushroom';
        case 'snowy_taiga':
          return 'snowy_rock';
        case 'desert':
          return 'sandstone_rock';
        case 'forest':
        case 'dark_forest':
        case 'swamp':
        case 'jungle':
          return 'mossy_boulder';
        default:
          return 'boulder';
      }
    case 'tallgrass':
      switch (biome) {
        case 'desert':
          return 'dead_bush';
        case 'badlands':
          return shape < 2 ? 'dead_bush' : 'dry_grass';
        case 'snowy_taiga':
          return shape === 3 ? 'sweet_berry_bush' : 'fern';
        case 'swamp':
          return shape === 3 ? 'sugar_cane' : 'tall_grass';
        case 'jungle':
          return shape >= 2 ? 'large_fern' : 'fern';
        case 'mushroom_fields':
          return shape % 2 === 0 ? 'red_mushroom' : 'brown_mushroom';
        case 'dark_forest':
          return shape === 3 ? 'fern' : 'tall_grass';
        default:
          return 'tall_grass';
      }
    case 'flower':
      switch (biome) {
        case 'cherry_grove':
          return type === 3 ? 'pink_tulip' : 'pink_petals';
        case 'mushroom_fields':
          return type === 0 ? 'red_mushroom' : type === 1 ? 'brown_mushroom' : 'allium';
        case 'dark_forest':
          return type === 3 ? 'poppy' : type % 2 === 0 ? 'red_mushroom' : 'brown_mushroom';
        case 'swamp':
          return type === 2 ? 'brown_mushroom' : 'blue_orchid';
        case 'jungle':
          return type === 0 ? 'poppy' : 'dandelion';
        case 'desert':
        case 'badlands':
          return 'dead_bush';
        default:
          return MEADOW_FLOWERS[type % 4] ?? 'poppy';
      }
    default:
      return kind;
  }
}

/** Tree sprite type (0 oak, 1 birch, 2 dark oak / big canopy, 3 spruce) for a biome's tree mix. */
function treeType(b: Biome, v: number): number {
  switch (b.treeKind) {
    case 'dark_oak':
      return v < 0.8 ? 2 : 0;
    case 'spruce':
      return 3;
    case 'birch_mix':
      return v < 0.55 ? 0 : 1;
    case 'jungle':
      return v < 0.65 ? 2 : 0;
    case 'swamp':
    case 'cherry':
      return 0;
    default:
      return v < 0.72 ? 0 : 1;
  }
}

/**
 * Props of one chunk. The biome is chosen per 2x2 cell from the biome map, so a chunk on a border
 * mixes vegetation; `biome` forces one biome for every cell (tests, gallery).
 */
export function genProps(
  cx: number,
  cy: number,
  seed: number,
  biome?: BiomeId,
  arena?: Arena,
): Prop[] {
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
      const cell = biome ?? biomeAtTile(tx, ty, seed, arena);
      const b = BIOMES[cell];
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
          out.push(make(id, 'boulder', 0, shape, x, y, cell));
        continue;
      }
      const roll = (p: number): boolean => {
        acc += p;
        return r < acc;
      };
      if (b.treeKind !== 'none') {
        const treeP = b.treeBase + (grove > 0.6 ? b.groveBonus : 0);
        if (roll(treeP)) {
          out.push(make(id, 'tree', treeType(b, v), shape, x, y, cell));
          continue;
        }
      } else if (b.cactusBase > 0 && roll(b.cactusBase + (grove > 0.62 ? 0.05 : 0))) {
        out.push(make(id, 'cactus', 0, shape, x, y, cell));
        continue;
      }
      const dry = b.ground === 'sand' || b.ground === 'red_sand';
      if (roll(P.boulder + b.boulderBonus * (grove > 0.5 ? 1.6 : 0.6))) {
        out.push(make(id, 'boulder', 0, shape, x, y, cell));
      } else if (roll(P.ore)) {
        const type = v < 0.4 ? 0 : v < 0.65 ? 1 : v < 0.77 ? 2 : v < 0.85 ? 3 : v < 0.93 ? 4 : 5;
        out.push(make(id, 'ore', type, shape, x, y, cell));
      } else if (roll(P.chest)) {
        out.push(make(id, 'chest', 0, 0, x, y, cell));
      } else if (roll(P.locked)) {
        out.push(make(id, 'locked_chest', 0, 0, x, y, cell));
      } else if (roll(dry ? 0 : P.melon)) {
        out.push(make(id, v < 0.5 ? 'melon' : 'pumpkin', 0, shape, x, y, cell));
      } else if (roll(P.beacon)) {
        out.push(make(id, 'beacon', 0, 0, x, y, cell));
      } else if (roll(P.campfire)) {
        out.push(make(id, 'campfire', 0, 0, x, y, cell));
      } else if (roll(P.anvil)) {
        out.push(make(id, 'anvil', 0, 0, x, y, cell));
      } else if (roll(P.enchant)) {
        out.push(make(id, 'enchant_table', 0, 0, x, y, cell));
      } else if (roll(P.tnt)) {
        out.push(make(id, 'tnt_trap', 0, 0, x, y, cell));
      } else if (roll(cell === 'dark_forest' ? 0.006 : cell === 'swamp' ? 0.004 : 0.003)) {
        out.push(make(id, 'cobweb', 0, shape, x, y, cell));
      } else if (
        roll(cell === 'desert' || cell === 'dark_forest' || cell === 'badlands' ? 0.001 : 0)
      ) {
        out.push(make(id, 'magma', 0, shape, x, y, cell));
      } else {
        const d = hash2(gx, gy, seed + 606);
        if (cell === 'jungle' && d < 0.05) out.push(make(id, 'bamboo', 0, shape, x, y, cell));
        else if (d < 0.22) out.push(make(id, 'tallgrass', 0, shape, x, y, cell));
        else if (d < 0.22 + 0.27 * b.flowers) {
          const type = v < 0.32 ? 0 : v < 0.6 ? 1 : v < 0.82 ? 2 : 3;
          out.push(make(id, 'flower', type, shape, x, y, cell));
        }
      }
    }
  }
  return out;
}
