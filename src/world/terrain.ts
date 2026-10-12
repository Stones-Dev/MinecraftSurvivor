/** Pure terrain generation: every tile is a stateless function of (x, y, seed). */
import { fbm } from '../core/noise';

export const CHUNK_TILES = 16;
export const TILE_PX = 16;
export const CHUNK_PX = CHUNK_TILES * TILE_PX;
/** Radius in tiles around the origin kept clear of lakes and props. */
export const SPAWN_CLEAR = 9;

/** Raw terrain codes; their effect depends on the biome (water freezes in the taiga, lava only exists in the desert). */
export const TILE = { GRASS: 0, SAND: 1, WATER: 2, LAVA: 3, WALL: 4 } as const;

/** Nether rift arena: a circle of `r` tiles around the origin walled in by basalt. */
export interface Arena {
  r: number;
}
export type TileId = (typeof TILE)[keyof typeof TILE];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function tileAt(tx: number, ty: number, seed: number, arena?: Arena): TileId {
  const d = Math.hypot(tx, ty);
  if (arena) {
    if (Math.hypot(tx + 0.5, ty + 0.5) >= arena.r) return TILE.WALL;
    const n = fbm(tx * 0.09 + 40, ty * 0.09 - 70, seed + 31);
    if (d > 6 && Math.abs(n - 0.5) < 0.04) return TILE.LAVA;
    if (fbm(tx * 0.12 - 20, ty * 0.12 + 55, seed + 37) > 0.68) return TILE.SAND;
    return TILE.GRASS;
  }
  const ramp = clamp01((d - SPAWN_CLEAR) / 8);
  const lake = fbm(tx * 0.045 + 100, ty * 0.045 - 50, seed + 101);
  const water = 0.66 + (1 - ramp) * 0.4;
  if (lake > water) return TILE.WATER;
  if (lake > water - 0.035) return TILE.SAND;
  if (d > 16 && fbm(tx * 0.07 + 500, ty * 0.07 - 300, seed + 777) > 0.8) return TILE.LAVA;
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
