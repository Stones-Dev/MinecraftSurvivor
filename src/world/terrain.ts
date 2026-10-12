/** Pure terrain generation: every tile is a stateless function of (x, y, seed). */
import { fbm } from '../core/noise';
import { biomeIndexAtTile } from './biomeMap';
import { BIOME_IDS, BIOMES } from './biomes';

export const CHUNK_TILES = 16;
export const TILE_PX = 16;
export const CHUNK_PX = CHUNK_TILES * TILE_PX;
/** Radius in tiles around the origin kept clear of lakes and props. */
export const SPAWN_CLEAR = 9;

/** Raw terrain codes; their effect depends on the local biome (water freezes in the taiga, lava only in hot biomes). */
export const TILE = { GRASS: 0, SAND: 1, WATER: 2, LAVA: 3, WALL: 4 } as const;

/** Nether rift arena: a circle of `r` tiles around the origin walled in by basalt. */
export interface Arena {
  r: number;
}
export type TileId = (typeof TILE)[keyof typeof TILE];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Per-biome terrain parameters as flat arrays indexed by BIOME_INDEX (hot path).
const LAKE = Float32Array.from(BIOME_IDS, (b) => BIOMES[b].lake);
const BANK = Float32Array.from(BIOME_IDS, (b) => BIOMES[b].bank);
const LAVA_LEVEL = Float32Array.from(BIOME_IDS, (b) => BIOMES[b].lavaLevel);
const HAS_LAVA = Uint8Array.from(BIOME_IDS, (b) => (BIOMES[b].lava ? 1 : 0));

/** Spacing (tiles) of the grid the terrain parameters are blended over, so lakes bend across borders. */
const PARAM_GRID = 8;

/**
 * Terrain code of a tile. Lakes, sand banks and lava pools follow the local biome: swamps are half
 * water, deserts only have rare oases, badlands have no lakes but more lava, and lava never appears in
 * biomes without it. Parameters are bilinearly blended over an 8-tile grid so shapes do not stop dead
 * on a biome border.
 */
export function tileAt(tx: number, ty: number, seed: number, arena?: Arena): TileId {
  const d = Math.hypot(tx, ty);
  if (arena) {
    if (Math.hypot(tx + 0.5, ty + 0.5) >= arena.r) return TILE.WALL;
    const n = fbm(tx * 0.09 + 40, ty * 0.09 - 70, seed + 31);
    if (d > 6 && Math.abs(n - 0.5) < 0.04) return TILE.LAVA;
    if (fbm(tx * 0.12 - 20, ty * 0.12 + 55, seed + 37) > 0.68) return TILE.SAND;
    return TILE.GRASS;
  }
  // Bilinear blend of the biome parameters at the four surrounding grid points.
  const gx = Math.floor(tx / PARAM_GRID);
  const gy = Math.floor(ty / PARAM_GRID);
  const fx = (tx - gx * PARAM_GRID) / PARAM_GRID;
  const fy = (ty - gy * PARAM_GRID) / PARAM_GRID;
  const x0 = gx * PARAM_GRID;
  const y0 = gy * PARAM_GRID;
  const a = biomeIndexAtTile(x0, y0, seed);
  const b = biomeIndexAtTile(x0 + PARAM_GRID, y0, seed);
  const c = biomeIndexAtTile(x0, y0 + PARAM_GRID, seed);
  const e = biomeIndexAtTile(x0 + PARAM_GRID, y0 + PARAM_GRID, seed);
  const wa = (1 - fx) * (1 - fy);
  const wb = fx * (1 - fy);
  const wc = (1 - fx) * fy;
  const we = fx * fy;
  const lakeOff =
    (LAKE[a] ?? 0) * wa + (LAKE[b] ?? 0) * wb + (LAKE[c] ?? 0) * wc + (LAKE[e] ?? 0) * we;
  const bank =
    (BANK[a] ?? 0) * wa + (BANK[b] ?? 0) * wb + (BANK[c] ?? 0) * wc + (BANK[e] ?? 0) * we;

  const ramp = clamp01((d - SPAWN_CLEAR) / 8);
  const lake = fbm(tx * 0.045 + 100, ty * 0.045 - 50, seed + 101);
  const water = 0.66 + lakeOff + (1 - ramp) * 0.4;
  if (lake > water) return TILE.WATER;
  if (lake > water - bank) return TILE.SAND;
  if (d > 16 && HAS_LAVA[biomeIndexAtTile(tx, ty, seed)] === 1) {
    const level =
      (LAVA_LEVEL[a] ?? 1) * wa +
      (LAVA_LEVEL[b] ?? 1) * wb +
      (LAVA_LEVEL[c] ?? 1) * wc +
      (LAVA_LEVEL[e] ?? 1) * we;
    if (fbm(tx * 0.07 + 500, ty * 0.07 - 300, seed + 777) > level) return TILE.LAVA;
  }
  return TILE.GRASS;
}

/** Terrain of a chunk with a 1-tile border so painters can look at neighbours: (N+2)^2 tiles. */
export function genTerrain(cx: number, cy: number, seed: number, arena?: Arena): Uint8Array {
  const side = CHUNK_TILES + 2;
  const out = new Uint8Array(side * side);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      out[y * side + x] = tileAt(cx * CHUNK_TILES + x - 1, cy * CHUNK_TILES + y - 1, seed, arena);
    }
  }
  return out;
}

/** Margin (tiles) of the per-chunk biome array, so painters can dither across chunk edges. */
export const BIOME_BORDER = 2;

/**
 * Biome indices (BIOME_INDEX) of a chunk with a BIOME_BORDER-tile margin: (N + 2 * BIOME_BORDER)^2
 * entries, row-major. Computed once per chunk bake and handed to the painter.
 */
export function genChunkBiomes(
  cx: number,
  cy: number,
  biomeIndexAt: (tx: number, ty: number) => number,
): Uint8Array {
  const side = CHUNK_TILES + 2 * BIOME_BORDER;
  const out = new Uint8Array(side * side);
  const x0 = cx * CHUNK_TILES - BIOME_BORDER;
  const y0 = cy * CHUNK_TILES - BIOME_BORDER;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) out[y * side + x] = biomeIndexAt(x0 + x, y0 + y);
  }
  return out;
}
