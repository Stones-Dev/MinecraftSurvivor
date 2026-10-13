/**
 * Ground blocks of the End (no DOM): end stone, bedrock, obsidian and the cliff face under the island's edge.
 *
 * They live outside blocks.ts on purpose: the block library indexes its recipes by `MAT` value and other work
 * appends materials there, so the End draws its own small texture set (16x16 ABGR, deterministic per variant)
 * and `paintEndTile` blits a tile of it with the same contact shading the chunk painter uses. The void is not
 * painted at all (transparent): the renderer draws the starfield under the chunk images.
 */
import { hash2, valueNoise } from '../core/noise';
import type { RGB } from '../core/pixelart';
import { TILE } from './terrain';

const TEX = 16;
const TEX_AREA = TEX * TEX;
const VARIANTS = 6;

export type EndMaterial = 'end_stone' | 'bedrock' | 'obsidian';

const PALETTES: Record<EndMaterial, readonly RGB[]> = {
  end_stone: [
    [232, 230, 168],
    [218, 216, 150],
    [202, 200, 134],
    [184, 182, 118],
    [158, 156, 98],
    [122, 118, 84],
  ],
  bedrock: [
    [18, 18, 20],
    [34, 34, 38],
    [52, 52, 56],
    [72, 72, 76],
    [94, 94, 98],
    [124, 124, 128],
  ],
  obsidian: [
    [8, 4, 16],
    [16, 8, 30],
    [28, 14, 52],
    [42, 22, 76],
    [62, 34, 108],
    [110, 70, 170],
  ],
};

const SEEDS: Record<EndMaterial, number> = { end_stone: 61000, bedrock: 62000, obsidian: 63000 };

function pack(c: RGB, a = 255): number {
  return ((a << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
}

/** Wrap-around value noise so a texture tiles. */
function tileable(x: number, y: number, period: number, seed: number): number {
  const fx = x / TEX;
  const fy = y / TEX;
  const a = valueNoise(fx * period, fy * period, seed);
  const b = valueNoise(fx * period - period, fy * period, seed);
  const c = valueNoise(fx * period, fy * period - period, seed);
  const d = valueNoise(fx * period - period, fy * period - period, seed);
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

function build(mat: EndMaterial, variant: number): Uint32Array {
  const pal = PALETTES[mat];
  const seed = SEEDS[mat] + variant;
  const out = new Uint32Array(TEX_AREA);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      let n = tileable(x, y, 4, seed) * 0.6 + tileable(x, y, 8, seed + 5) * 0.4;
      const h = hash2(x, y, seed + 9);
      if (mat === 'end_stone') {
        // Pale porous stone: darker pits and a few bright flecks.
        n += (h - 0.5) * 0.18;
        if (h > 0.96) n = 0.02;
        else if (h < 0.05) n = 0.93;
      } else if (mat === 'bedrock') {
        // Dark blotches with scattered lighter chips, like the Minecraft texture.
        n = n * 0.7 + (h - 0.5) * 0.45;
        if (h > 0.9) n = 0.95;
      } else {
        // Obsidian: near-black glass with violet veins and a rare bright sparkle.
        const vein = Math.abs(tileable(x, y, 3, seed + 21) - 0.5);
        n = n * 0.55 + (vein < 0.045 ? 0.5 : 0);
        if (h > 0.985) n = 1;
      }
      const idx = Math.max(0, Math.min(pal.length - 1, Math.floor(n * pal.length)));
      out[y * TEX + x] = pack(pal[idx] ?? pal[0] ?? [0, 0, 0]);
    }
  }
  return out;
}

const cache = new Map<string, Uint32Array>();

/** Texture `variant` (0..5) of an End material (a cached view: do not modify). */
export function endTexture(mat: EndMaterial, variant: number): Uint32Array {
  const v = ((variant % VARIANTS) + VARIANTS) % VARIANTS;
  const key = `${mat}:${v}`;
  let t = cache.get(key);
  if (!t) {
    t = build(mat, v);
    cache.set(key, t);
  }
  return t;
}

export const END_VARIANTS = VARIANTS;

/** Material of an End tile code, or null (void). */
export function endMaterialOf(tile: number): EndMaterial | null {
  if (tile === TILE.END_STONE) return 'end_stone';
  if (tile === TILE.BEDROCK) return 'bedrock';
  if (tile === TILE.OBSIDIAN) return 'obsidian';
  return null;
}

/** Is this tile code one of the End's (painted by `paintEndTile`)? */
export function isEndTile(tile: number): boolean {
  return (
    tile === TILE.END_STONE || tile === TILE.VOID || tile === TILE.BEDROCK || tile === TILE.OBSIDIAN
  );
}

function scalePixel(c: number, f: number, a = 255): number {
  const r = Math.min(255, ((c & 255) * f) | 0);
  const g = Math.min(255, (((c >>> 8) & 255) * f) | 0);
  const b = Math.min(255, (((c >>> 16) & 255) * f) | 0);
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/**
 * Paint one End tile into `out` (row stride `stride`, top-left at `dst`). `hi` is the tile's 32-bit hash,
 * `n/s/w/e` the neighbouring tile codes. Ground gets a +-4% brightness jitter, a lit lip where it borders the
 * void to the north and a thin dark rim to the west and east; a void tile under the island's south edge shows
 * the cliff face (dark stone with a ragged underside that fades into the stars). Other void stays transparent.
 */
export function paintEndTile(
  out: Uint32Array,
  stride: number,
  dst: number,
  t: number,
  hi: number,
  n: number,
  s: number,
  w: number,
  e: number,
  Tx: number,
  Ty: number,
  seed: number,
): void {
  if (t === TILE.VOID) {
    if (n === TILE.VOID) return;
    const tex = endTexture('end_stone', hi >>> 8);
    for (let x = 0; x < TEX; x++) {
      // Per column the rock hangs 9-16 px below the top edge.
      const depth = 9 + Math.floor(hash2(Tx * 16 + x, Ty, seed + 77) * 8);
      for (let y = 0; y < depth; y++) {
        const f = 0.62 - 0.38 * (y / TEX) - (x === 0 || y === depth - 1 ? 0.12 : 0);
        const px = tex[y * TEX + x] ?? 0;
        out[dst + y * stride + x] = scalePixel(px, Math.max(0.1, f));
      }
    }
    return;
  }
  const mat = endMaterialOf(t);
  if (!mat) return;
  const tex = endTexture(mat, hi >>> 8);
  const jf = 1 + ((hi & 255) / 255 - 0.5) * 0.08;
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      let f = jf;
      if (n === TILE.VOID && y === 0) f *= 1.25;
      else if (n === TILE.VOID && y === 1) f *= 1.1;
      if (w === TILE.VOID && x === 0) f *= 0.75;
      if (e === TILE.VOID && x === TEX - 1) f *= 0.75;
      if (s === TILE.VOID && y >= TEX - 2) f *= y === TEX - 1 ? 0.55 : 0.78;
      out[dst + y * stride + x] = scalePixel(tex[y * TEX + x] ?? 0, f);
    }
  }
}
