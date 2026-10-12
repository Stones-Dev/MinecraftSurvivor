/**
 * Spatial biome map: which biome every tile belongs to, as a pure function of (tile, seed).
 *
 * Three low-frequency value-noise fields (temperature, humidity and a "weirdness" field for rare
 * pockets) are sampled once per 4x4-tile cell (Minecraft also stores biomes at 4x4 resolution) and
 * mapped through a Whittaker-style table. The spawn area is always plains, ramping into the real
 * climate further out. A small domain warp keeps borders organic instead of following the noise grid.
 */
import { fbm, valueNoise } from '../core/noise';
import { BIOME_IDS, BIOME_INDEX, type BiomeId } from './biomes';
import type { Arena } from './terrain';

/** Tiles per biome cell side. */
export const BIOME_CELL = 4;
/** Tiles from the origin that are always plains (the spawn meadow). */
export const PLAINS_RADIUS = 40;
/** Distance (tiles) at which the climate is fully the noise's; between the two it ramps. */
const RAMP_RADIUS = 96;

/** Field scales in tiles per noise lattice step: biome regions end up ~25-70 tiles across. */
const T_SCALE = 132;
const H_SCALE = 108;
const W_SCALE = 74;
const WARP_SCALE = 21;
const WARP_AMP = 14;

/** Climate the spawn meadow ramps from (a comfortable plains point of the table). */
const HOME_T = 0.5;
const HOME_H = 0.3;
const HOME_W = 0.2;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Thresholds of the Whittaker table (tuned on the empirical distribution of the fields). */
const T_COLD = 0.31;
const T_COOL = 0.46;
const T_WARM = 0.61;
const H_DRY = 0.475;
const H_WET = 0.6;
const W_CHERRY = 0.68;
const W_BADLANDS = 0.54;
const H_HOT_WET = 0.545;
const W_MUSHROOM = 0.86;

/** Climate -> biome (pure; exported for tests and tuning tools). */
export function classifyClimate(t: number, h: number, w: number): BiomeId {
  if (w > W_MUSHROOM && h > 0.4) return 'mushroom_fields';
  if (t < T_COLD) return 'snowy_taiga';
  if (t < T_COOL) {
    if (h < H_DRY) return w > W_CHERRY ? 'cherry_grove' : 'plains';
    if (h < H_WET - 0.025) return 'forest';
    return 'dark_forest';
  }
  if (t < T_WARM) {
    if (h < H_DRY) return w > W_CHERRY ? 'cherry_grove' : 'plains';
    if (h < H_WET) return 'forest';
    return 'swamp';
  }
  if (h < H_HOT_WET) return w > W_BADLANDS ? 'badlands' : 'desert';
  return 'jungle';
}

/** Climate sample (all fields roughly in 0..1). */
export interface Climate {
  t: number;
  h: number;
  w: number;
}

/** Climate at a tile position, spawn ramp included (exported for tests and tuning). */
export function climateAt(x: number, y: number, seed: number, out: Climate): Climate {
  const wx = x + (valueNoise(x / WARP_SCALE, y / WARP_SCALE, seed + 9101) - 0.5) * 2 * WARP_AMP;
  const wy =
    y +
    (valueNoise(x / WARP_SCALE + 31.7, y / WARP_SCALE - 17.3, seed + 9102) - 0.5) * 2 * WARP_AMP;
  out.t = fbm(wx / T_SCALE, wy / T_SCALE, seed + 9001);
  out.h = fbm(wx / H_SCALE + 13.1, wy / H_SCALE - 7.7, seed + 9002);
  out.w = valueNoise(wx / W_SCALE - 40.3, wy / W_SCALE + 21.9, seed + 9003);
  const k = smoothstep(PLAINS_RADIUS, RAMP_RADIUS, Math.hypot(x, y));
  if (k < 1) {
    out.t = HOME_T + (out.t - HOME_T) * k;
    out.h = HOME_H + (out.h - HOME_H) * k;
    out.w = HOME_W + (out.w - HOME_W) * k;
  }
  return out;
}

const scratch: Climate = { t: 0, h: 0, w: 0 };

/** Biome of one 4x4 cell, from the climate at its centre. */
function computeCell(bx: number, by: number, seed: number): BiomeId {
  const x = (bx + 0.5) * BIOME_CELL;
  const y = (by + 0.5) * BIOME_CELL;
  if (Math.hypot(x, y) < PLAINS_RADIUS) return 'plains';
  const c = climateAt(x, y, seed, scratch);
  return classifyClimate(c.t, c.h, c.w);
}

// Cache: one byte per cell, per seed. Cleared wholesale when it grows too large (cells are cheap to redo).
const MAX_CACHED = 1 << 18;
const caches = new Map<number, Map<number, number>>();
let cached = 0;
let lastSeed = NaN;
let lastCache: Map<number, number> = new Map();

function cellIndex(bx: number, by: number, seed: number): number {
  if (seed !== lastSeed) {
    let c = caches.get(seed);
    if (!c) {
      c = new Map();
      caches.set(seed, c);
    }
    lastSeed = seed;
    lastCache = c;
  }
  const key = (bx + 32768) * 65536 + (by + 32768);
  let v = lastCache.get(key);
  if (v === undefined) {
    v = BIOME_INDEX[computeCell(bx, by, seed)];
    if (cached >= MAX_CACHED) {
      for (const c of caches.values()) c.clear();
      cached = 0;
    }
    lastCache.set(key, v);
    cached++;
  }
  return v;
}

/** Compact biome index (see BIOME_INDEX) of a tile. Hot path: genProps, surface, the painters. */
export function biomeIndexAtTile(tx: number, ty: number, seed: number, arena?: Arena): number {
  if (arena) return BIOME_INDEX.nether;
  return cellIndex(Math.floor(tx / BIOME_CELL), Math.floor(ty / BIOME_CELL), seed);
}

/** Biome of a tile: plains around spawn, Nether in the rift arena, the climate table elsewhere. */
export function biomeAtTile(tx: number, ty: number, seed: number, arena?: Arena): BiomeId {
  return BIOME_IDS[biomeIndexAtTile(tx, ty, seed, arena)] ?? 'plains';
}

/** Biome at a world pixel position. */
export function biomeAtPx(x: number, y: number, seed: number, arena?: Arena): BiomeId {
  return biomeAtTile(Math.floor(x / 16), Math.floor(y / 16), seed, arena);
}

/** Border proximity of a tile: the nearest other biome within `reach` tiles (axis + diagonal probes). */
export interface BiomeBlend {
  /** The tile's own biome. */
  biome: BiomeId;
  /** Nearest different biome, or the tile's own biome when none is within reach. */
  other: BiomeId;
  /** Distance in tiles to that biome (1..reach), or reach + 1 when there is none. */
  dist: number;
}

const PROBES: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/**
 * How close a tile is to a biome border (for painters that want soft transitions). Writes into `out`
 * when given so hot loops do not allocate.
 */
export function biomeBlend(
  tx: number,
  ty: number,
  seed: number,
  arena?: Arena,
  reach = 3,
  out: BiomeBlend = { biome: 'plains', other: 'plains', dist: 0 },
): BiomeBlend {
  const own = biomeIndexAtTile(tx, ty, seed, arena);
  out.biome = BIOME_IDS[own] ?? 'plains';
  out.other = out.biome;
  out.dist = reach + 1;
  for (let d = 1; d <= reach; d++) {
    for (const [dx, dy] of PROBES) {
      const o = biomeIndexAtTile(tx + dx * d, ty + dy * d, seed, arena);
      if (o !== own) {
        out.other = BIOME_IDS[o] ?? out.biome;
        out.dist = d;
        return out;
      }
    }
  }
  return out;
}

/**
 * Nearest tile of a biome to a point, by a deterministic square spiral over biome cells (debug
 * `?biome=` starts and tests). Returns the centre tile of the first matching cell, or null. With
 * `margin` > 0 the cell must lie at least that many cells inside the region.
 */
export function findBiome(
  biome: BiomeId,
  seed: number,
  fromTx = 0,
  fromTy = 0,
  maxTiles = 1200,
  margin = 0,
): { tx: number; ty: number } | null {
  const target = BIOME_INDEX[biome];
  const bx0 = Math.floor(fromTx / BIOME_CELL);
  const by0 = Math.floor(fromTy / BIOME_CELL);
  const maxRing = Math.ceil(maxTiles / BIOME_CELL);
  const is = (bx: number, by: number): boolean => cellIndex(bx, by, seed) === target;
  // With a margin, the cells `margin` steps away in the 8 directions must match too (deep inside).
  const hit = (bx: number, by: number): boolean =>
    is(bx, by) &&
    (margin === 0 || PROBES.every(([dx, dy]) => is(bx + dx * margin, by + dy * margin)));
  for (let r = 0; r <= maxRing; r++) {
    // Walk the ring of Chebyshev radius r, starting at the top-left corner, clockwise.
    for (let i = -r; i <= r; i++) {
      for (const [bx, by] of [
        [bx0 + i, by0 - r],
        [bx0 + r, by0 + i],
        [bx0 - i, by0 + r],
        [bx0 - r, by0 - i],
      ] as const) {
        if (hit(bx, by)) {
          return {
            tx: bx * BIOME_CELL + (BIOME_CELL >> 1),
            ty: by * BIOME_CELL + (BIOME_CELL >> 1),
          };
        }
      }
      if (r === 0) break;
    }
  }
  return null;
}
