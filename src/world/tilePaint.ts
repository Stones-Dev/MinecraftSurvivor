/**
 * Minecraft-block ground painter (no DOM): every 16x16 tile of a chunk is one block face, blitted from
 * the cached texture library (blocks.ts) and shaded per tile. Nothing is computed per pixel but the
 * blit itself (tint x brightness x contact shadow).
 *
 * Composition, decided per TILE from the bordered terrain array and the per-tile biome map:
 * - the base material follows the tile type and the biome's ground family (grass, sand, snow, mud...);
 * - dirt / coarse dirt / podzol / gravel / mossy cobble / sandstone / terracotta patches are whole tiles
 *   picked by low-frequency noise sampled at tile resolution (blocky, stair-stepped Minecraft patches);
 * - near a biome border each tile looks its biome up at a noise-warped neighbouring tile (a blocky,
 *   interlocking border), while grass is tinted with a 5x5-tile average of the biome grass colours
 *   (Minecraft's biome blend), so grass-to-grass borders shade smoothly;
 * - shores: sand rims come from the terrain; water draws a bank shadow under north/west land and a
 *   foam line on south/east land (see liquidSet); ice gets the same light model;
 * - contact shadows: ground next to walls, water or lava darkens on that side (cheap fake AO from the
 *   18x18 terrain array), walls get a darker south face;
 * - every tile gets a +-3% brightness jitter so the block grid is felt without grid lines.
 *
 * Water and lava are animated by the renderer (animTiles lists them); the bake holds one static frame.
 */
import { fbm, hash2, valueNoise } from '../core/noise';
import { PixBuffer } from '../core/pixelart';
import {
  GRASS_TINT,
  LIQUID,
  LIQUID_FRAMES,
  MAT,
  type MaterialId,
  SIDE,
  TERRACOTTA_BANDS,
  TEX,
  TEX_AREA,
  TINT_ALPHA,
  blockTexture,
  liquidSet,
  materialSet,
  materialSetSize,
  tintMean,
} from './blocks';
import { BIOME_IDS, BIOME_INDEX, BIOMES, type BiomeId } from './biomes';
import { BIOME_BORDER, CHUNK_PX, CHUNK_TILES, TILE } from './terrain';

const NB = BIOME_IDS.length;
const ICE = Uint8Array.from(BIOME_IDS, (id) => (BIOMES[id].iceWater ? 1 : 0));
/** Grass tint per biome as flat RGB triples (hot path). */
const GRASS_T = Float32Array.from(BIOME_IDS.flatMap((id) => [...GRASS_TINT[id]]));

const B_PLAINS = BIOME_INDEX.plains;
const B_FOREST = BIOME_INDEX.forest;
const B_DARK = BIOME_INDEX.dark_forest;
const B_TAIGA = BIOME_INDEX.snowy_taiga;
const B_DESERT = BIOME_INDEX.desert;
const B_SWAMP = BIOME_INDEX.swamp;
const B_JUNGLE = BIOME_INDEX.jungle;
const B_BADLANDS = BIOME_INDEX.badlands;
const B_CHERRY = BIOME_INDEX.cherry_grove;
const B_MUSHROOM = BIOME_INDEX.mushroom_fields;
const B_NETHER = BIOME_INDEX.nether;

/** Material of a walkable (TILE.GRASS) tile: P = patch field (jittered), R = rock field, Q = detail. */
function groundMaterial(b: number, P: number, R: number, Q: number, wet: boolean): MaterialId {
  switch (b) {
    case B_PLAINS:
      if (R > 0.83) return MAT.GRAVEL;
      if (P > 0.74) return Q > 0.5 ? MAT.COARSE_DIRT : MAT.DIRT;
      return MAT.GRASS;
    case B_FOREST:
      if (R > 0.82) return MAT.MOSSY_COBBLE;
      if (P > 0.7) return Q > 0.5 ? MAT.PODZOL : MAT.COARSE_DIRT;
      return MAT.GRASS;
    case B_DARK:
      if (R > 0.81) return MAT.MOSSY_COBBLE;
      if (P > 0.62) return Q > 0.4 ? MAT.PODZOL : MAT.COARSE_DIRT;
      return MAT.GRASS;
    case B_JUNGLE:
      if (R > 0.82) return MAT.MOSSY_COBBLE;
      if (P > 0.68) return Q > 0.45 ? MAT.PODZOL : MAT.COARSE_DIRT;
      return MAT.GRASS;
    case B_CHERRY:
      if (P > 0.78) return MAT.DIRT;
      if (Q > 0.6) return MAT.PETALS;
      return MAT.GRASS;
    case B_TAIGA:
      if (R > 0.83) return Q > 0.5 ? MAT.STONE : MAT.GRAVEL;
      if (P > 0.64) return MAT.SNOWY_GRASS;
      return MAT.SNOW;
    case B_DESERT:
      if (P > 0.72) return MAT.SANDSTONE;
      if (R > 0.8) return MAT.RED_SAND;
      return MAT.SAND;
    case B_BADLANDS:
      if (P > 0.58) return MAT.TERRACOTTA;
      if (R > 0.84) return MAT.COARSE_DIRT;
      return MAT.RED_SAND;
    case B_SWAMP:
      if (wet || P > 0.56) return MAT.MUD;
      return MAT.GRASS;
    case B_MUSHROOM:
      if (P > 0.76) return MAT.DIRT;
      return MAT.MYCELIUM;
    case B_NETHER:
      if (R > 0.82) return MAT.GRAVEL;
      return MAT.NETHERRACK;
    default:
      return MAT.GRASS;
  }
}

/** Material of a TILE.SAND tile (lake rims; soul sand in the Nether, which slows the hero). */
function rimMaterial(b: number): MaterialId {
  switch (b) {
    case B_BADLANDS:
      return MAT.RED_SAND;
    case B_SWAMP:
      return MAT.MUD;
    case B_TAIGA:
      return MAT.GRAVEL;
    case B_NETHER:
      return MAT.SOUL_SAND;
    default:
      return MAT.SAND;
  }
}

/** Grass-like materials take the (blended) biome grass tint. */
function grassTinted(m: MaterialId): boolean {
  return m === MAT.GRASS || m === MAT.PETALS || m === MAT.SNOWY_GRASS;
}

// Per-tile scratch (reused by every bake: no allocation per tile).
const ROWF = new Float32Array(TEX);
const COLF = new Float32Array(TEX);
const TINT = new Float32Array(3);
const WALL_SHADE = [0.84, 0.89, 0.94, 0.97];
const WALL_SHADE_FAR = [0.9, 0.95, 0.98];
const LOW_SHADE = [0.9, 0.95];

function shadeEdge(arr: Float32Array, from: number, step: number, f: readonly number[]): void {
  for (let i = 0; i < f.length; i++) {
    const k = from + i * step;
    arr[k] = (arr[k] ?? 1) * (f[i] ?? 1);
  }
}

/**
 * Blit one texture (256 px at `src` in `tex`) into `out` (row stride `stride`) at `dst`, multiplying
 * tinted greys by TINT[0..2], other pixels by `jf`, and both by ROWF[ly] * COLF[lx].
 */
function blit(
  out: Uint32Array,
  stride: number,
  dst: number,
  tex: Uint32Array,
  src: number,
  jf: number,
): void {
  const tr = TINT[0] ?? 1;
  const tg = TINT[1] ?? 1;
  const tb = TINT[2] ?? 1;
  for (let ly = 0; ly < TEX; ly++) {
    const rf = ROWF[ly] ?? 1;
    const s = src + ly * TEX;
    const d = dst + ly * stride;
    for (let lx = 0; lx < TEX; lx++) {
      const c = tex[s + lx] ?? 0;
      const f = rf * (COLF[lx] ?? 1);
      let r: number;
      let g: number;
      let b: number;
      if (c >>> 24 === TINT_ALPHA) {
        r = (c & 255) * tr * f;
        g = ((c >>> 8) & 255) * tg * f;
        b = ((c >>> 16) & 255) * tb * f;
      } else {
        const k = jf * f;
        r = (c & 255) * k;
        g = ((c >>> 8) & 255) * k;
        b = ((c >>> 16) & 255) * k;
      }
      out[d + lx] =
        0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r);
    }
  }
}

function copyTile(out: Uint32Array, stride: number, dst: number, tex: Uint32Array, src: number) {
  for (let ly = 0; ly < TEX; ly++) {
    const s = src + ly * TEX;
    const d = dst + ly * stride;
    for (let lx = 0; lx < TEX; lx++) out[d + lx] = tex[s + lx] ?? 0;
  }
}

/** Set TINT so a tinted material's mean grey lands on `target` (times the tile brightness `jf`). */
function setTint(mat: MaterialId, r: number, g: number, b: number, jf: number): void {
  const mean = tintMean(mat) || 1;
  TINT[0] = (r / mean) * jf;
  TINT[1] = (g / mean) * jf;
  TINT[2] = (b / mean) * jf;
}

/** Terracotta band colour of a world tile: wavy horizontal stripes 1-3 tiles tall. */
function bandColor(Tx: number, Ty: number, seed: number): readonly [number, number, number] {
  const wy = Ty + Math.round((valueNoise(Tx * 0.07, 3.5, seed + 551) - 0.5) * 6);
  const row = Math.floor(wy / 2);
  const k = Math.floor(hash2(row, 0, seed + 557) * TERRACOTTA_BANDS.length);
  return TERRACOTTA_BANDS[k] ?? [162, 84, 38];
}

/** 32-bit hash of a world tile (variant, rotation, brightness and animation phase bits). */
function tileHash(Tx: number, Ty: number, seed: number): number {
  return (hash2(Tx, Ty, seed + 7) * 4294967296) >>> 0;
}

/** Shore mask of a liquid tile: SIDE bits set where the neighbour is not the same liquid. */
function shoreMask(terrain: Uint8Array, tx: number, ty: number, t: number): number {
  const side = CHUNK_TILES + 2;
  const at = (x: number, y: number): number => terrain[(y + 1) * side + x + 1] ?? t;
  return (
    (at(tx, ty - 1) !== t ? SIDE.N : 0) |
    (at(tx + 1, ty) !== t ? SIDE.E : 0) |
    (at(tx, ty + 1) !== t ? SIDE.S : 0) |
    (at(tx - 1, ty) !== t ? SIDE.W : 0)
  );
}

function biomeArray(biomes: Uint8Array | BiomeId): Uint8Array {
  const bSide = CHUNK_TILES + 2 * BIOME_BORDER;
  return typeof biomes === 'string'
    ? new Uint8Array(bSide * bSide).fill(BIOME_INDEX[biomes])
    : biomes;
}

/**
 * Paint one chunk (256x256 art px) from its bordered terrain array and its per-tile biome indices
 * (`biomes`: the chunk's biome map with a BIOME_BORDER-tile margin, see genChunkBiomes, or a single
 * biome for the whole chunk). Water, lava and ice always use the tile's own biome, so what you see is
 * what you walk on; ground near a border picks biome A or B per tile.
 */
export function paintChunk(
  cx: number,
  cy: number,
  terrain: Uint8Array,
  biomes: Uint8Array | BiomeId,
  seed: number,
): PixBuffer {
  const buf = new PixBuffer(CHUNK_PX, CHUNK_PX);
  const out = buf.data;
  const side = CHUNK_TILES + 2;
  const bSide = CHUNK_TILES + 2 * BIOME_BORDER;
  const bmap = biomeArray(biomes);
  const biomeAt = (tx: number, ty: number): number =>
    bmap[(ty + BIOME_BORDER) * bSide + tx + BIOME_BORDER] ?? 0;
  const at = (tx: number, ty: number): number => terrain[(ty + 1) * side + tx + 1] ?? TILE.GRASS;
  let uniform = true;
  const b0 = bmap[0] ?? 0;
  for (let i = 1; i < bmap.length && uniform; i++) uniform = bmap[i] === b0;
  const lavaSet = liquidSet(LIQUID.LAVA, 0);

  for (let ty = 0; ty < CHUNK_TILES; ty++) {
    for (let tx = 0; tx < CHUNK_TILES; tx++) {
      const t = at(tx, ty);
      const Tx = cx * CHUNK_TILES + tx;
      const Ty = cy * CHUNK_TILES + ty;
      const own = biomeAt(tx, ty);
      const hi = tileHash(Tx, Ty, seed);
      const phase = (hi >>> 20) & (LIQUID_FRAMES - 1);
      const dst = ty * TEX * CHUNK_PX + tx * TEX;
      if (t === TILE.LAVA) {
        const mask = shoreMask(terrain, tx, ty, TILE.LAVA);
        copyTile(out, CHUNK_PX, dst, lavaSet, (mask * LIQUID_FRAMES + phase) * TEX_AREA);
        continue;
      }
      if (t === TILE.WATER && ICE[own] === 0) {
        const mask = shoreMask(terrain, tx, ty, TILE.WATER);
        const set = liquidSet(LIQUID.WATER, own);
        copyTile(out, CHUNK_PX, dst, set, (mask * LIQUID_FRAMES + phase) * TEX_AREA);
        continue;
      }

      ROWF.fill(1);
      COLF.fill(1);
      const jf = 1 + (((hi & 255) / 255) - 0.5) * 0.06;
      const n = at(tx, ty - 1);
      const s = at(tx, ty + 1);
      const w = at(tx - 1, ty);
      const e = at(tx + 1, ty);
      let mat: MaterialId;
      let bi = own;
      if (t === TILE.WALL) {
        mat = MAT.BLACKSTONE_BRICKS;
        // A darker south face and a lit top lip where the wall meets the arena floor.
        if (s !== TILE.WALL) shadeEdge(ROWF, 15, -1, [0.6, 0.66, 0.74, 0.86]);
        if (n !== TILE.WALL) ROWF[0] = 1.2;
      } else if (t === TILE.WATER) {
        // Frozen water: packed ice with the water light model (bank shadow N/W, bright rim S/E).
        mat = MAT.PACKED_ICE;
        if (n !== TILE.WATER) shadeEdge(ROWF, 0, 1, [0.74, 0.86]);
        if (w !== TILE.WATER) shadeEdge(COLF, 0, 1, [0.74, 0.86]);
        if (s !== TILE.WATER) ROWF[15] = 1.14;
        if (e !== TILE.WATER) COLF[15] = 1.14;
      } else {
        // Ground: near a border, the biome is read at a noise-warped neighbouring tile (blocky dither).
        if (!uniform) {
          const wx = (valueNoise(Tx * 0.37, Ty * 0.37, seed + 919) - 0.5) * 4.2;
          const wy = (valueNoise(Tx * 0.37, Ty * 0.37, seed + 929) - 0.5) * 4.2;
          const jx = (((hi >>> 10) & 7) / 7 - 0.5) * 1.4;
          const jy = (((hi >>> 13) & 7) / 7 - 0.5) * 1.4;
          const sx = Math.max(-BIOME_BORDER, Math.min(15 + BIOME_BORDER, Math.round(tx + wx + jx)));
          const sy = Math.max(-BIOME_BORDER, Math.min(15 + BIOME_BORDER, Math.round(ty + wy + jy)));
          bi = biomeAt(sx, sy);
        }
        if (t === TILE.SAND) {
          mat = rimMaterial(bi);
        } else {
          const P =
            fbm(Tx * 0.15 + 13.7, Ty * 0.15 - 7.1, seed + 303) +
            (((hi >>> 24) & 15) / 15 - 0.5) * 0.08;
          const R = valueNoise(Tx * 0.19 + 50.3, Ty * 0.19 - 80.9, seed + 311);
          const Q = valueNoise(Tx * 0.33 - 4.1, Ty * 0.33 + 9.7, seed + 317);
          const wet = n === TILE.WATER || s === TILE.WATER || w === TILE.WATER || e === TILE.WATER;
          mat = groundMaterial(bi, P, R, Q, wet);
          // Snow thins out into snowy grass along the taiga's border.
          if (mat === MAT.SNOW && !uniform && (hi >>> 28) < 8) {
            for (let k = -2; k <= 2 && mat === MAT.SNOW; k++)
              if (biomeAt(tx + k, ty) !== B_TAIGA || biomeAt(tx, ty + k) !== B_TAIGA)
                mat = MAT.SNOWY_GRASS;
          }
        }
        // Contact shadows: walls tower over the ground (strongest from the north-west light),
        // water and lava sit lower (a thin dark contour on the ground's edge).
        if (n === TILE.WALL) shadeEdge(ROWF, 0, 1, WALL_SHADE);
        else if (n === TILE.WATER || n === TILE.LAVA) shadeEdge(ROWF, 0, 1, LOW_SHADE);
        if (w === TILE.WALL) shadeEdge(COLF, 0, 1, WALL_SHADE);
        else if (w === TILE.WATER || w === TILE.LAVA) shadeEdge(COLF, 0, 1, LOW_SHADE);
        if (s === TILE.WALL) shadeEdge(ROWF, 15, -1, WALL_SHADE_FAR);
        else if (s === TILE.WATER || s === TILE.LAVA) shadeEdge(ROWF, 15, -1, LOW_SHADE);
        if (e === TILE.WALL) shadeEdge(COLF, 15, -1, WALL_SHADE_FAR);
        else if (e === TILE.WATER || e === TILE.LAVA) shadeEdge(COLF, 15, -1, LOW_SHADE);
      }

      if (grassTinted(mat)) {
        let r: number;
        let g: number;
        let b: number;
        if (uniform) {
          r = GRASS_T[bi * 3] ?? 0;
          g = GRASS_T[bi * 3 + 1] ?? 0;
          b = GRASS_T[bi * 3 + 2] ?? 0;
        } else {
          // Minecraft biome blend: average grass colour of the 5x5 tiles around this one.
          r = 0;
          g = 0;
          b = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const k = biomeAt(tx + dx, ty + dy) * 3;
              r += GRASS_T[k] ?? 0;
              g += GRASS_T[k + 1] ?? 0;
              b += GRASS_T[k + 2] ?? 0;
            }
          }
          r /= 25;
          g /= 25;
          b /= 25;
        }
        setTint(mat, r, g, b, jf);
      } else if (mat === MAT.TERRACOTTA) {
        const c = bandColor(Tx, Ty, seed);
        setTint(mat, c[0], c[1], c[2], jf);
      }
      const set = materialSet(mat);
      const pick = (hi >>> 8) % materialSetSize(mat);
      blit(out, CHUNK_PX, dst, set, pick * TEX_AREA, jf);
    }
  }
  return buf;
}

/** Sheet id of animated lava in animTiles entries (water uses its biome index). */
export const LAVA_SHEET = 255;

/**
 * Animated tiles of a chunk (water that is not frozen, and lava), one packed entry each:
 * bits 0-7 tile index (ty * 16 + tx), 8-11 shore mask, 12-13 animation phase, 16-23 sheet id
 * (the water's biome index, or LAVA_SHEET). Computed once per bake; the renderer redraws these
 * tiles every frame from the liquid sheets.
 */
export function animTiles(
  cx: number,
  cy: number,
  terrain: Uint8Array,
  biomes: Uint8Array | BiomeId,
  seed: number,
): Uint32Array {
  const side = CHUNK_TILES + 2;
  const bSide = CHUNK_TILES + 2 * BIOME_BORDER;
  const bmap = biomeArray(biomes);
  const list: number[] = [];
  for (let ty = 0; ty < CHUNK_TILES; ty++) {
    for (let tx = 0; tx < CHUNK_TILES; tx++) {
      const t = terrain[(ty + 1) * side + tx + 1] ?? TILE.GRASS;
      if (t !== TILE.WATER && t !== TILE.LAVA) continue;
      const own = bmap[(ty + BIOME_BORDER) * bSide + tx + BIOME_BORDER] ?? 0;
      if (t === TILE.WATER && ICE[own] === 1) continue;
      const hi = tileHash(cx * CHUNK_TILES + tx, cy * CHUNK_TILES + ty, seed);
      const phase = (hi >>> 20) & (LIQUID_FRAMES - 1);
      const mask = shoreMask(terrain, tx, ty, t);
      const sheet = t === TILE.LAVA ? LAVA_SHEET : own;
      list.push((ty * CHUNK_TILES + tx) | (mask << 8) | (phase << 12) | (sheet << 16));
    }
  }
  return Uint32Array.from(list);
}

/**
 * Paint one untouched block (variant `variant`, un-rotated) as it would look in `biome`, for the
 * gallery. Terracotta shows band `variant` of the badlands palette.
 */
export function paintBlock(
  buf: PixBuffer,
  x: number,
  y: number,
  mat: MaterialId,
  variant: number,
  biome: BiomeId,
): void {
  ROWF.fill(1);
  COLF.fill(1);
  const bi = BIOME_INDEX[biome];
  if (mat === MAT.TERRACOTTA) {
    const c = TERRACOTTA_BANDS[variant % TERRACOTTA_BANDS.length] ?? [162, 84, 38];
    setTint(mat, c[0], c[1], c[2], 1);
  } else {
    setTint(mat, GRASS_T[bi * 3] ?? 0, GRASS_T[bi * 3 + 1] ?? 0, GRASS_T[bi * 3 + 2] ?? 0, 1);
  }
  blit(buf.data, buf.w, y * buf.w + x, blockTexture(mat, variant), 0, 1);
}

/** Number of biomes with a water sheet (sheet ids 0..NB-1). */
export const WATER_SHEETS = NB;
