/**
 * Block texture library: 16x16 Minecraft-style block faces, generated once (lazily) and cached.
 *
 * Every texture is a deterministic function of (material, variant): a few tones (4-8) laid out by a
 * tileable clustered noise field plus hand-placed 1-3 px features (pebbles, needles, petals, cracks),
 * so a texture repeats without seams and never reads as per-pixel static. Each material has several
 * variants and, like Minecraft's random block rotation, mirrored/rotated copies picked per tile.
 *
 * Tinted materials (grass, petals, the grass peeking through snow, terracotta) store grey levels with
 * alpha 0xFE; the chunk painter multiplies them by the biome tint (Minecraft's grass colour map) and
 * writes them opaque. Water and lava are per-biome "liquid sets": 16 shore masks x 4 animation frames.
 *
 * Packed layout is the little-endian ABGR of ImageData (see core/pixelart pack()).
 */
import { hash2 } from '../core/noise';
import type { RGB } from '../core/pixelart';
import { BIOME_IDS, BIOMES, type BiomeId } from './biomes';

export const TEX = 16;
export const TEX_AREA = TEX * TEX;
/** Alpha byte of a grey pixel that the painter tints (every other pixel has alpha 0xFF). */
export const TINT_ALPHA = 0xfe;

/** Ground block materials (water and lava are liquids, see liquidSet). */
export const MAT = {
  GRASS: 0,
  DIRT: 1,
  COARSE_DIRT: 2,
  PODZOL: 3,
  MYCELIUM: 4,
  MUD: 5,
  SAND: 6,
  RED_SAND: 7,
  SANDSTONE: 8,
  TERRACOTTA: 9,
  SNOW: 10,
  SNOWY_GRASS: 11,
  PACKED_ICE: 12,
  GRAVEL: 13,
  STONE: 14,
  COBBLE: 15,
  MOSSY_COBBLE: 16,
  NETHERRACK: 17,
  SOUL_SAND: 18,
  BLACKSTONE_BRICKS: 19,
  PETALS: 20,
  // Structure materials (v1.4): village and desert temple.
  OAK_PLANKS: 21,
  SPRUCE_PLANKS: 22,
  CUT_SANDSTONE: 23,
  ORANGE_TERRACOTTA: 24,
  BLUE_TERRACOTTA: 25,
  DIRT_PATH: 26,
  FARMLAND: 27,
  ROOF_SHINGLES: 28,
  SNOWY_ROOF: 29,
  SMOOTH_SANDSTONE: 30,
} as const;
export type MaterialId = (typeof MAT)[keyof typeof MAT];
export const MATERIAL_COUNT = 31;

/** Liquids: per-biome water (tinted) and lava, each 16 shore masks x LIQUID_FRAMES frames. */
export const LIQUID = { WATER: 0, LAVA: 1 } as const;
export type LiquidId = (typeof LIQUID)[keyof typeof LIQUID];
export const LIQUID_FRAMES = 4;
/** Shore mask bits: the neighbour on that side is not the same liquid. */
export const SIDE = { N: 1, E: 2, S: 4, W: 8 } as const;

// ---------------------------------------------------------------------------------------------------
// Colour helpers

function opaque(c: RGB): number {
  return ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
}

/** Grey level the painter will tint (alpha 0xFE marks it). */
function grey(v: number): number {
  return ((TINT_ALPHA << 24) | (v << 16) | (v << 8) | v) >>> 0;
}

function scale(c: RGB, f: number): RGB {
  const k = (v: number): number => Math.max(0, Math.min(255, Math.round(v * f)));
  return [k(c[0]), k(c[1]), k(c[2])];
}

function toward(c: RGB, d: RGB, t: number): RGB {
  const k = (a: number, b: number): number => Math.round(a + (b - a) * t);
  return [k(c[0], d[0]), k(c[1], d[1]), k(c[2], d[2])];
}

// ---------------------------------------------------------------------------------------------------
// Tileable building blocks

/**
 * Clustered field: weighted octaves of value noise on lattices of `cell` px that wrap every 16 px
 * (so the texture tiles seamlessly), plus a little white noise (the 1 px grain).
 */
function field(
  seed: number,
  octaves: readonly (readonly [number, number])[],
  white: number,
): Float32Array {
  const f = new Float32Array(TEX_AREA);
  for (let i = 0; i < TEX_AREA; i++) f[i] = hash2(i & 15, i >> 4, seed + 977) * white;
  octaves.forEach(([cell, w], k) => {
    const n = TEX / cell;
    const lat = new Float32Array(n * n);
    for (let j = 0; j < n * n; j++) lat[j] = hash2(j % n, Math.floor(j / n), seed + k * 101);
    for (let y = 0; y < TEX; y++) {
      const gy = y / cell;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      const r0 = y0 * n;
      const r1 = ((y0 + 1) % n) * n;
      for (let x = 0; x < TEX; x++) {
        const gx = x / cell;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const x1 = (x0 + 1) % n;
        const a = lat[r0 + x0] ?? 0;
        const b = lat[r0 + x1] ?? 0;
        const c = lat[r1 + x0] ?? 0;
        const d = lat[r1 + x1] ?? 0;
        const v = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
        f[y * TEX + x] = (f[y * TEX + x] ?? 0) + v * w;
      }
    }
  });
  return f;
}

/** Rank quantisation: the lowest `props[0]` share of the field gets tone 0, and so on. */
function rankTones(f: Float32Array, props: readonly number[], toneOffset = 0): Uint8Array {
  // Sort (value, index) pairs packed into one float: a typed-array sort with no comparator.
  const keys = new Float64Array(TEX_AREA);
  for (let i = 0; i < TEX_AREA; i++) keys[i] = Math.floor(((f[i] ?? 0) + 16) * 1e6) * TEX_AREA + i;
  keys.sort();
  const total = props.reduce((s, p) => s + p, 0);
  const out = new Uint8Array(TEX_AREA);
  let tone = 0;
  let acc = (props[0] ?? 0) / total;
  for (let rank = 0; rank < TEX_AREA; rank++) {
    while (rank >= acc * TEX_AREA && tone < props.length - 1) {
      tone++;
      acc += (props[tone] ?? 0) / total;
    }
    out[(keys[rank] ?? 0) % TEX_AREA] = tone + toneOffset;
  }
  return out;
}

const wrap = (v: number): number => ((v % TEX) + TEX) % TEX;

function put(t: Uint8Array, x: number, y: number, tone: number): void {
  t[wrap(y) * TEX + wrap(x)] = tone;
}

function get(t: Uint8Array, x: number, y: number): number {
  return t[wrap(y) * TEX + wrap(x)] ?? 0;
}

/** 1-3 px speckle shapes (offsets), the grain of Minecraft textures. */
const SHAPES: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 0]],
  [
    [0, 0],
    [1, 0],
  ],
  [
    [0, 0],
    [0, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  [
    [0, 0],
    [1, 1],
  ],
];

/** Deterministic random stream for one texture. */
function stream(seed: number): () => number {
  let i = 0;
  return () => hash2(i++, seed, 4243);
}

function speckles(
  t: Uint8Array,
  rnd: () => number,
  n: number,
  tone: number,
  shapes = SHAPES.length,
): void {
  for (let k = 0; k < n; k++) {
    const x = Math.floor(rnd() * TEX);
    const y = Math.floor(rnd() * TEX);
    const shape = SHAPES[Math.floor(rnd() * shapes)] ?? SHAPES[0] ?? [];
    for (const [dx, dy] of shape) put(t, x + dx, y + dy, tone);
  }
}

/** Short straight strokes (stone streaks, podzol needles, ice cracks). */
function strokes(
  t: Uint8Array,
  rnd: () => number,
  n: number,
  tone: number,
  len: [number, number],
  dirs: readonly (readonly [number, number])[],
): void {
  for (let k = 0; k < n; k++) {
    const x = Math.floor(rnd() * TEX);
    const y = Math.floor(rnd() * TEX);
    const [dx, dy] = dirs[Math.floor(rnd() * dirs.length)] ?? [1, 0];
    const l = len[0] + Math.floor(rnd() * (len[1] - len[0] + 1));
    for (let s = 0; s < l; s++) put(t, x + dx * s, y + dy * s, tone);
  }
}

const H: readonly (readonly [number, number])[] = [[1, 0]];
const HV: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
];
const DIAG: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
];

/** Shaded pebbles (gravel, coarse dirt): a lit top-left pixel and a shadow below/right. */
function pebbles(
  t: Uint8Array,
  rnd: () => number,
  n: number,
  body: readonly number[],
  lit: number,
  shadow: number,
): void {
  for (let k = 0; k < n; k++) {
    const x = Math.floor(rnd() * TEX);
    const y = Math.floor(rnd() * TEX);
    const w = 1 + Math.floor(rnd() * 2);
    const h = 1 + Math.floor(rnd() * 2);
    const tone = body[Math.floor(rnd() * body.length)] ?? 0;
    for (let j = 0; j <= h; j++) put(t, x + w, y + j, shadow);
    for (let i = 0; i <= w; i++) put(t, x + i, y + h, shadow);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(t, x + i, y + j, tone);
    put(t, x, y, lit);
  }
}

// ---------------------------------------------------------------------------------------------------
// Recipes

interface Recipe {
  name: string;
  variants: number;
  /** Orientations drawn per variant: 1 = none, 4 = mirrors and 180 degrees, 8 = all eight. */
  orient: 1 | 4 | 8;
  /** Framed textures (bricks, cut sandstone) draw block borders on purpose: not seamless. */
  framed: boolean;
  /** Tone map and palette (packed; tinted greys made with grey()) of one variant. */
  build: (v: number) => { tones: Uint8Array; palette: readonly number[] };
}

const GRASS_GREYS = [124, 142, 160, 178, 196, 216];
const GRASS_PROPS = [0.05, 0.13, 0.25, 0.3, 0.18, 0.09];

/** The shared mottled grass top (6 grey tones, tinted per biome). */
function grassTones(seed: number): Uint8Array {
  const t = rankTones(
    field(
      seed,
      [
        [4, 0.3],
        [2, 0.4],
      ],
      0.6,
    ),
    GRASS_PROPS,
  );
  const rnd = stream(seed + 5);
  speckles(t, rnd, 4, 0, 1);
  speckles(t, rnd, 4, 5, 2);
  return t;
}

const DIRT_PAL: readonly RGB[] = [
  [89, 61, 41],
  [106, 74, 50],
  [121, 85, 58],
  [134, 96, 67],
  [150, 108, 74],
  [181, 131, 92],
];

const SNOW_PAL: readonly RGB[] = [
  [210, 222, 236],
  [228, 237, 245],
  [240, 246, 250],
  [250, 253, 255],
];

const COBBLE_PAL: readonly RGB[] = [
  [58, 58, 60],
  [86, 86, 88],
  [106, 106, 108],
  [121, 121, 122],
  [136, 136, 137],
  [162, 162, 162],
];

/** Periodic Voronoi cobbles: mortar between stones, lit upper-left rims and shaded lower-right rims. */
function cobbleTones(seed: number): Uint8Array {
  const rnd = stream(seed);
  const pts: [number, number, number][] = [];
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      pts.push([
        (gx + 0.15 + rnd() * 0.7) * (16 / 3),
        (gy + 0.15 + rnd() * 0.7) * (16 / 3),
        2 + Math.floor(rnd() * 3),
      ]);
    }
  }
  const cell = new Int8Array(TEX_AREA);
  const t = new Uint8Array(TEX_AREA);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      let d1 = Infinity;
      let d2 = Infinity;
      let best = 0;
      pts.forEach(([px, py], i) => {
        for (let oy = -16; oy <= 16; oy += 16) {
          for (let ox = -16; ox <= 16; ox += 16) {
            const d = Math.hypot(x + 0.5 - px - ox, y + 0.5 - py - oy);
            if (d < d1) {
              d2 = d1;
              d1 = d;
              best = i;
            } else if (d < d2) d2 = d;
          }
        }
      });
      const k = y * TEX + x;
      cell[k] = d2 - d1 < 1.1 ? -1 : best;
      t[k] = d2 - d1 < 1.1 ? 0 : (pts[best]?.[2] ?? 3);
    }
  }
  const mortar = (x: number, y: number): boolean => cell[wrap(y) * TEX + wrap(x)] === -1;
  const out = t.slice();
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const k = y * TEX + x;
      if (cell[k] === -1) continue;
      if (mortar(x + 1, y) || mortar(x, y + 1)) out[k] = 1;
      else if (mortar(x - 1, y) || mortar(x, y - 1)) out[k] = Math.min(5, (t[k] ?? 3) + 2);
      else if (hash2(x, y, seed + 9) < 0.12) out[k] = Math.max(2, (t[k] ?? 3) - 1);
    }
  }
  return out;
}

// Structure materials: palettes and the two layouts shared by planks and roofs.

const OAK_PAL: readonly RGB[] = [
  [150, 118, 70],
  [163, 129, 78],
  [176, 141, 86],
  [188, 153, 95],
  [102, 76, 42],
  [202, 168, 110],
];
const SPRUCE_PAL: readonly RGB[] = [
  [92, 66, 38],
  [104, 76, 44],
  [115, 86, 50],
  [128, 97, 58],
  [58, 41, 22],
  [144, 111, 72],
];
const SANDSTONE_CUT_PAL: readonly RGB[] = [
  [214, 200, 151],
  [221, 208, 161],
  [228, 216, 171],
  [236, 226, 184],
  [244, 236, 200],
  [176, 160, 111],
];
const SMOOTH_SANDSTONE_PAL: readonly RGB[] = [
  [222, 208, 160],
  [229, 216, 169],
  [236, 224, 180],
  [242, 232, 192],
  [208, 192, 144],
];
const ORANGE_TERRACOTTA_PAL: readonly RGB[] = [
  [150, 76, 34],
  [161, 83, 37],
  [170, 90, 42],
  [180, 98, 48],
  [136, 66, 28],
];
const BLUE_TERRACOTTA_PAL: readonly RGB[] = [
  [64, 50, 80],
  [74, 59, 91],
  [84, 68, 102],
  [94, 78, 114],
  [52, 40, 66],
];
const PATH_PAL: readonly RGB[] = [
  [118, 92, 52],
  [130, 102, 58],
  [142, 113, 64],
  [154, 124, 72],
  [166, 136, 82],
  [188, 172, 142],
];
const FARMLAND_PAL: readonly RGB[] = [
  [96, 66, 42],
  [108, 76, 48],
  [120, 86, 56],
  [64, 44, 28],
  [76, 52, 34],
  [138, 102, 70],
];
const SHINGLE_PAL: readonly RGB[] = [
  [116, 62, 46],
  [132, 72, 52],
  [148, 84, 60],
  [164, 96, 68],
  [78, 40, 30],
  [184, 116, 84],
];
const SNOW_ROOF_PAL: readonly RGB[] = [
  [196, 210, 226],
  [210, 222, 236],
  [224, 234, 244],
  [238, 246, 252],
  [138, 158, 184],
  [255, 255, 255],
];

/** Horizontal boards 4 px tall: dark seam under each, staggered end joints, a few lit grain pixels. */
function boardTones(seed: number): Uint8Array {
  const t = rankTones(
    field(
      seed,
      [
        [8, 0.3],
        [2, 0.35],
      ],
      0.5,
    ),
    [0.2, 0.36, 0.3, 0.14],
  );
  speckles(t, stream(seed + 3), 4, 0, 2);
  for (let y = 0; y < TEX; y++) {
    const row = y >> 2;
    const joint = (row * 7 + (seed % 5) * 3 + 2) & 15;
    for (let x = 0; x < TEX; x++) {
      if ((y & 3) === 3 || x === joint) put(t, x, y, 4);
      else if ((y & 3) === 0 && hash2(x, y, seed + 9) < 0.55) put(t, x, y, 5);
    }
  }
  return t;
}

/** Roof shingles: 4 px courses of 8 px shingles (every other course shifted), a dark lower edge, a lit top row. */
function shingleTones(seed: number): Uint8Array {
  const t = rankTones(
    field(
      seed,
      [
        [8, 0.25],
        [2, 0.3],
      ],
      0.6,
    ),
    [0.2, 0.34, 0.3, 0.16],
  );
  for (let y = 0; y < TEX; y++) {
    const row = y >> 2;
    for (let x = 0; x < TEX; x++) {
      const xx = row & 1 ? (x + 4) & 15 : x;
      if ((y & 3) === 3 || (xx & 7) === 7) put(t, x, y, 4);
      else if ((y & 3) === 0) put(t, x, y, 5);
    }
  }
  return t;
}

const RECIPES: readonly Recipe[] = [
  {
    name: 'grass',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => ({ tones: grassTones(1000 + v), palette: GRASS_GREYS.map(grey) }),
  },
  {
    name: 'dirt',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 2000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.45],
            [2, 0.3],
          ],
          0.6,
        ),
        [0.06, 0.15, 0.25, 0.36, 0.18],
      );
      const rnd = stream(s);
      speckles(t, rnd, 7, 5, 3);
      speckles(t, rnd, 5, 0, 2);
      return { tones: t, palette: DIRT_PAL.map(opaque) };
    },
  },
  {
    name: 'coarse dirt',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 3000 + v;
      const t = rankTones(
        field(
          s,
          [
            [8, 0.3],
            [4, 0.4],
            [2, 0.25],
          ],
          0.45,
        ),
        [0.1, 0.2, 0.3, 0.28, 0.12],
      );
      pebbles(t, stream(s), 7, [5], 6, 0);
      const pal: RGB[] = [
        [74, 52, 35],
        [94, 66, 45],
        [111, 79, 54],
        [126, 90, 62],
        [143, 103, 71],
        [116, 110, 104],
        [152, 146, 139],
      ];
      return { tones: t, palette: pal.map(opaque) };
    },
  },
  {
    name: 'podzol',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 4000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.4],
            [2, 0.3],
          ],
          0.5,
        ),
        [0.08, 0.17, 0.3, 0.3, 0.15],
      );
      const rnd = stream(s);
      strokes(t, rnd, 12, 5, [2, 3], HV);
      strokes(t, rnd, 9, 0, [2, 3], HV);
      const pal: RGB[] = [
        [68, 46, 22],
        [86, 59, 30],
        [102, 71, 37],
        [118, 83, 45],
        [134, 96, 54],
        [160, 117, 66],
      ];
      return { tones: t, palette: pal.map(opaque) };
    },
  },
  {
    name: 'mycelium',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 5000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.5],
            [2, 0.35],
          ],
          0.3,
        ),
        [0.07, 0.17, 0.28, 0.27, 0.15, 0.06],
      );
      speckles(t, stream(s), 7, 6, 3);
      const pal: RGB[] = [
        [88, 72, 88],
        [102, 85, 102],
        [114, 97, 113],
        [126, 108, 124],
        [141, 122, 139],
        [160, 140, 160],
        [190, 164, 190],
      ];
      return { tones: t, palette: pal.map(opaque) };
    },
  },
  {
    name: 'mud',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 6000 + v;
      const t = rankTones(
        field(
          s,
          [
            [8, 0.45],
            [4, 0.4],
          ],
          0.25,
        ),
        [0.06, 0.18, 0.32, 0.3, 0.14],
      );
      speckles(t, stream(s), 3, 5, 2);
      const pal: RGB[] = [
        [62, 52, 44],
        [72, 61, 51],
        [81, 69, 58],
        [90, 77, 64],
        [102, 88, 73],
        [124, 112, 98],
      ];
      return { tones: t, palette: pal.map(opaque) };
    },
  },
  {
    name: 'sand',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 7000 + v;
      const t = rankTones(field(s, [[2, 0.35]], 0.8), [0.07, 0.2, 0.43, 0.22, 0.08]);
      const pal: RGB[] = [
        [196, 180, 130],
        [208, 194, 144],
        [219, 207, 160],
        [228, 218, 174],
        [238, 230, 192],
      ];
      return { tones: t, palette: pal.map(opaque) };
    },
  },
  {
    name: 'red sand',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 8000 + v;
      const t = rankTones(field(s, [[2, 0.35]], 0.8), [0.07, 0.2, 0.43, 0.22, 0.08]);
      const pal: RGB[] = [
        [158, 80, 24],
        [176, 91, 29],
        [190, 102, 34],
        [202, 114, 42],
        [216, 130, 54],
      ];
      return { tones: t, palette: pal.map(opaque) };
    },
  },
  {
    name: 'sandstone',
    variants: 6,
    orient: 1,
    framed: true,
    build: (v) => {
      const s = 9000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.5],
            [2, 0.2],
          ],
          0.3,
        ),
        [0.12, 0.32, 0.4, 0.16],
      );
      for (let i = 0; i < TEX; i++) {
        put(t, i, 0, 4);
        put(t, 0, i, 4);
        put(t, i, 15, 5);
        put(t, 15, i, 5);
      }
      const pal: RGB[] = [
        [205, 190, 141],
        [214, 200, 151],
        [221, 208, 161],
        [228, 216, 171],
        [236, 226, 184],
        [190, 174, 124],
      ];
      return { tones: t, palette: pal.map(opaque) };
    },
  },
  {
    name: 'terracotta',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 10000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.3],
            [2, 0.3],
          ],
          0.6,
        ),
        [0.08, 0.26, 0.44, 0.22],
      );
      speckles(t, stream(s), 5, 0, 2);
      speckles(t, stream(s + 1), 4, 4, 1);
      return { tones: t, palette: [176, 190, 200, 210, 222].map(grey) };
    },
  },
  {
    name: 'snow',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 11000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.5],
            [2, 0.3],
          ],
          0.3,
        ),
        [0.03, 0.12, 0.3, 0.55],
      );
      return { tones: t, palette: SNOW_PAL.map(opaque) };
    },
  },
  {
    name: 'snowy grass',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 12000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.5],
            [2, 0.3],
          ],
          0.3,
        ),
        [0.03, 0.12, 0.3, 0.55],
      );
      // Patches of grass poking through a thin snow layer, with a soft blue shadow under the snow edge.
      const g = field(
        s + 7,
        [
          [8, 0.35],
          [4, 0.5],
          [2, 0.15],
        ],
        0.08,
      );
      // Keep the clumps off the block edges: neighbouring blocks are other variants, so a clump cut
      // by the edge would show a seam; snow meets snow instead.
      for (let y = 0; y < TEX; y++) {
        for (let x = 0; x < TEX; x++) {
          const d = Math.min(x, y, 15 - x, 15 - y);
          g[y * TEX + x] = (g[y * TEX + x] ?? 0) * Math.min(1, 0.68 + d * 0.11);
        }
      }
      const cut = [...g].sort((x, y) => x - y)[Math.floor(TEX_AREA * 0.7)] ?? 1;
      const grassy = (x: number, y: number): boolean => (g[wrap(y) * TEX + wrap(x)] ?? 0) > cut;
      const gt = grassTones(s + 13);
      for (let y = 0; y < TEX; y++) {
        for (let x = 0; x < TEX; x++) {
          if (grassy(x, y)) {
            const k = gt[y * TEX + x] ?? 0;
            put(t, x, y, k >= 4 ? 5 : k >= 2 ? 4 : 6);
          } else if (y > 0 && grassy(x, y - 1)) put(t, x, y, 0);
        }
      }
      return { tones: t, palette: [...SNOW_PAL.map(opaque), grey(168), grey(204), grey(138)] };
    },
  },
  {
    name: 'packed ice',
    variants: 8,
    orient: 4,
    framed: false,
    build: (v) => {
      const s = 13000 + v;
      const t = rankTones(
        field(
          s,
          [
            [8, 0.5],
            [4, 0.3],
          ],
          0.2,
        ),
        [0.06, 0.22, 0.38, 0.24, 0.1],
      );
      const rnd = stream(s);
      strokes(t, rnd, 3, 5, [3, 5], DIAG);
      strokes(t, rnd, 2, 0, [2, 3], DIAG);
      const pal: RGB[] = [
        [116, 154, 220],
        [134, 172, 233],
        [149, 186, 240],
        [165, 199, 245],
        [186, 214, 250],
        [222, 236, 254],
      ];
      return { tones: t, palette: pal.map(opaque) };
    },
  },
  {
    name: 'gravel',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 14000 + v;
      const t = rankTones(field(s, [[2, 0.3]], 0.7), [0.06, 0.2, 0.34, 0.28, 0.12]);
      pebbles(t, stream(s), 11, [4, 4, 6], 5, 0);
      const pal: RGB[] = [
        [76, 72, 72],
        [99, 94, 93],
        [118, 113, 112],
        [131, 126, 125],
        [150, 145, 143],
        [176, 171, 168],
        [128, 113, 101],
      ];
      return { tones: t, palette: pal.map(opaque) };
    },
  },
  {
    name: 'stone',
    variants: 8,
    orient: 4,
    framed: false,
    build: (v) => {
      const s = 15000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.4],
            [2, 0.3],
          ],
          0.4,
        ),
        [0.05, 0.17, 0.46, 0.22, 0.1],
      );
      const rnd = stream(s);
      strokes(t, rnd, 6, 0, [2, 4], H);
      strokes(t, rnd, 4, 4, [2, 3], H);
      const pal: RGB[] = [
        [98, 98, 99],
        [111, 111, 112],
        [122, 122, 123],
        [132, 132, 133],
        [145, 145, 146],
      ];
      return { tones: t, palette: pal.map(opaque) };
    },
  },
  {
    name: 'cobblestone',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => ({ tones: cobbleTones(16000 + v), palette: COBBLE_PAL.map(opaque) }),
  },
  {
    name: 'mossy cobble',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 17000 + v;
      const t = cobbleTones(s);
      const moss = field(
        s + 3,
        [
          [4, 0.6],
          [2, 0.4],
        ],
        0.25,
      );
      const cut = [...moss].sort((a, b) => a - b)[Math.floor(TEX_AREA * 0.62)] ?? 1;
      for (let k = 0; k < TEX_AREA; k++) {
        if ((moss[k] ?? 0) > cut) t[k] = (t[k] ?? 0) <= 1 ? 6 : 7;
      }
      const pal: RGB[] = [...COBBLE_PAL, [62, 84, 40], [88, 114, 54]];
      return { tones: t, palette: pal.map(opaque) };
    },
  },
  {
    name: 'netherrack',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 18000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.35],
            [2, 0.45],
          ],
          0.5,
        ),
        [0.08, 0.16, 0.26, 0.26, 0.16, 0.08],
      );
      const pal: RGB[] = [
        [66, 20, 20],
        [84, 29, 29],
        [98, 38, 38],
        [112, 48, 46],
        [129, 62, 59],
        [152, 82, 77],
      ];
      return { tones: t, palette: pal.map(opaque) };
    },
  },
  {
    name: 'soul sand',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 19000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.4],
            [2, 0.3],
          ],
          0.5,
        ),
        [0.12, 0.3, 0.32, 0.18, 0.08],
        1,
      );
      // Two faint "faces" (eyes and a mouth), Minecraft's soul sand signature.
      const rnd = stream(s);
      for (let k = 0; k < 2; k++) {
        const x = Math.floor(rnd() * TEX);
        const y = Math.floor(rnd() * TEX);
        put(t, x, y, 0);
        put(t, x + 2, y, 0);
        put(t, x + 1, y + 2, 0);
        put(t, x, y + 1, 1);
        put(t, x + 2, y + 1, 1);
      }
      const pal: RGB[] = [
        [40, 29, 23],
        [57, 43, 34],
        [71, 54, 43],
        [84, 65, 52],
        [97, 76, 62],
        [114, 91, 75],
      ];
      return { tones: t, palette: pal.map(opaque) };
    },
  },
  {
    name: 'blackstone bricks',
    variants: 6,
    orient: 1,
    framed: true,
    build: (v) => {
      const s = 20000 + v;
      const t = rankTones(field(s, [[2, 0.4]], 0.6), [0.12, 0.5, 0.3, 0.08], 1);
      for (let y = 0; y < TEX; y++) {
        const row = y >> 3;
        const yy = y & 7;
        for (let x = 0; x < TEX; x++) {
          const xx = row === 0 ? x : (x + 8) & 15;
          if (yy === 7 || xx === 15) put(t, x, y, 0);
          else if (yy === 0 || xx === 0) put(t, x, y, 5);
          else if (yy === 6 || xx === 14) put(t, x, y, 1);
        }
      }
      const rnd = stream(s);
      if (v % 2 === 1) strokes(t, rnd, 1, 0, [3, 4], DIAG);
      const pal: RGB[] = [
        [22, 19, 26],
        [35, 30, 40],
        [45, 40, 51],
        [53, 47, 60],
        [62, 56, 70],
        [80, 72, 89],
      ];
      return { tones: t, palette: pal.map(opaque) };
    },
  },
  {
    name: 'pink petals',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 21000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.5],
            [2, 0.35],
          ],
          0.5,
        ),
        [0.08, 0.22, 0.34, 0.24, 0.12],
      );
      // A few four-petal blossoms.
      const rnd = stream(s);
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const x = Math.floor(rnd() * TEX);
        const y = Math.floor(rnd() * TEX);
        put(t, x, y, 7);
        put(t, x + 1, y, 6);
        put(t, x, y + 1, 6);
        if (rnd() < 0.6) put(t, x - 1, y, 6);
        if (rnd() < 0.6) put(t, x, y - 1, 6);
        put(t, x + 1, y + 1, 5);
      }
      const pal = [
        ...[130, 150, 170, 190, 212].map(grey),
        ...(
          [
            [200, 108, 150],
            [236, 156, 192],
            [250, 204, 224],
          ] as RGB[]
        ).map(opaque),
      ];
      return { tones: t, palette: pal };
    },
  },
  // ---- Structure materials (village and desert temple, v1.4): appended, ids follow MAT. ----
  {
    name: 'oak planks',
    variants: 6,
    orient: 1,
    framed: true,
    build: (v) => ({ tones: boardTones(22000 + v), palette: OAK_PAL.map(opaque) }),
  },
  {
    name: 'spruce planks',
    variants: 6,
    orient: 1,
    framed: true,
    build: (v) => ({ tones: boardTones(23000 + v), palette: SPRUCE_PAL.map(opaque) }),
  },
  {
    name: 'cut sandstone',
    variants: 6,
    orient: 1,
    framed: true,
    build: (v) => {
      const s = 24000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.4],
            [2, 0.2],
          ],
          0.3,
        ),
        [0.16, 0.34, 0.34, 0.16],
      );
      // 8x8 blocks, the lower row of blocks shifted by half a block: dark seam right and below, lit rim
      // left and above.
      for (let y = 0; y < TEX; y++) {
        const half = y >> 3;
        for (let x = 0; x < TEX; x++) {
          const xx = half === 0 ? x : (x + 4) & 15;
          if ((y & 7) === 7 || (xx & 7) === 7) put(t, x, y, 5);
          else if ((y & 7) === 0 || (xx & 7) === 0) put(t, x, y, 4);
        }
      }
      if (v % 2 === 1) speckles(t, stream(s), 3, 0, 2);
      return { tones: t, palette: SANDSTONE_CUT_PAL.map(opaque) };
    },
  },
  {
    name: 'orange terracotta',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 25000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.3],
            [2, 0.3],
          ],
          0.6,
        ),
        [0.1, 0.34, 0.38, 0.18],
      );
      speckles(t, stream(s), 4, 4, 2);
      return { tones: t, palette: ORANGE_TERRACOTTA_PAL.map(opaque) };
    },
  },
  {
    name: 'blue terracotta',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 26000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.3],
            [2, 0.3],
          ],
          0.6,
        ),
        [0.1, 0.34, 0.38, 0.18],
      );
      speckles(t, stream(s), 4, 4, 2);
      return { tones: t, palette: BLUE_TERRACOTTA_PAL.map(opaque) };
    },
  },
  {
    name: 'dirt path',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 27000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.4],
            [2, 0.3],
          ],
          0.5,
        ),
        [0.1, 0.24, 0.34, 0.22, 0.1],
      );
      speckles(t, stream(s), 4, 5, 1);
      return { tones: t, palette: PATH_PAL.map(opaque) };
    },
  },
  {
    name: 'farmland',
    variants: 8,
    orient: 4,
    framed: false,
    build: (v) => {
      const s = 28000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.3],
            [2, 0.3],
          ],
          0.5,
        ),
        [0.3, 0.4, 0.3],
      );
      // Furrows: every other pair of rows is the dark, wet trough (period 4 divides 16: seamless).
      for (let y = 0; y < TEX; y++) {
        if ((y & 3) < 2) continue;
        for (let x = 0; x < TEX; x++) put(t, x, y, get(t, x, y) === 0 ? 3 : 4);
      }
      speckles(t, stream(s), 3, 5, 1);
      return { tones: t, palette: FARMLAND_PAL.map(opaque) };
    },
  },
  {
    name: 'roof shingles',
    variants: 6,
    orient: 1,
    framed: true,
    build: (v) => ({ tones: shingleTones(29000 + v), palette: SHINGLE_PAL.map(opaque) }),
  },
  {
    name: 'snowy roof',
    variants: 6,
    orient: 1,
    framed: true,
    build: (v) => ({ tones: shingleTones(30000 + v), palette: SNOW_ROOF_PAL.map(opaque) }),
  },
  {
    name: 'smooth sandstone',
    variants: 8,
    orient: 8,
    framed: false,
    build: (v) => {
      const s = 31000 + v;
      const t = rankTones(
        field(
          s,
          [
            [4, 0.35],
            [2, 0.25],
          ],
          0.6,
        ),
        [0.14, 0.34, 0.36, 0.16],
      );
      speckles(t, stream(s), 3, 4, 1);
      return { tones: t, palette: SMOOTH_SANDSTONE_PAL.map(opaque) };
    },
  },
];

// ---------------------------------------------------------------------------------------------------
// Orientation and caches

/** Copy a 16x16 texture under one of the 8 symmetries of the square. */
function orientInto(src: Uint32Array, dst: Uint32Array, off: number, o: number): void {
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const ax = o & 1 ? 15 - x : x;
      const ay = o & 2 ? 15 - y : y;
      dst[off + y * TEX + x] = (o & 4 ? src[ax * TEX + ay] : src[ay * TEX + ax]) ?? 0;
    }
  }
}

const SETS: (Uint32Array | undefined)[] = [];
const BASE: (Uint32Array | undefined)[] = [];
const TINT_MEAN = new Float32Array(MATERIAL_COUNT);

export function materialName(mat: MaterialId): string {
  return RECIPES[mat]?.name ?? '?';
}

export function materialVariants(mat: MaterialId): number {
  return RECIPES[mat]?.variants ?? 1;
}

export function materialFramed(mat: MaterialId): boolean {
  return RECIPES[mat]?.framed ?? false;
}

/** The un-rotated variants of a material, back to back (variants x 256). */
export function materialBase(mat: MaterialId): Uint32Array {
  const hit = BASE[mat];
  if (hit) return hit;
  const r = RECIPES[mat];
  if (!r) throw new Error(`unknown material ${mat}`);
  const out = new Uint32Array(r.variants * TEX_AREA);
  let sum = 0;
  let n = 0;
  for (let v = 0; v < r.variants; v++) {
    const { tones, palette } = r.build(v);
    for (let k = 0; k < TEX_AREA; k++) {
      const c = palette[tones[k] ?? 0] ?? palette[0] ?? 0;
      out[v * TEX_AREA + k] = c;
      if (c >>> 24 === TINT_ALPHA) {
        sum += c & 255;
        n++;
      }
    }
  }
  TINT_MEAN[mat] = n > 0 ? sum / n : 0;
  BASE[mat] = out;
  return out;
}

/** Texture `variant` (0..variants-1) of a material, un-rotated (a view, do not modify). */
export function blockTexture(mat: MaterialId, variant: number): Uint32Array {
  const base = materialBase(mat);
  const v = ((variant % materialVariants(mat)) + materialVariants(mat)) % materialVariants(mat);
  return base.subarray(v * TEX_AREA, (v + 1) * TEX_AREA);
}

/**
 * Every texture the painter may pick for a material: each variant in each of its orientations, back to
 * back. Built once and cached (the whole library is under 1 MB).
 */
export function materialSet(mat: MaterialId): Uint32Array {
  const hit = SETS[mat];
  if (hit) return hit;
  const r = RECIPES[mat];
  if (!r) throw new Error(`unknown material ${mat}`);
  const base = materialBase(mat);
  const out = new Uint32Array(r.variants * r.orient * TEX_AREA);
  for (let v = 0; v < r.variants; v++) {
    const src = base.subarray(v * TEX_AREA, (v + 1) * TEX_AREA);
    for (let o = 0; o < r.orient; o++) orientInto(src, out, (v * r.orient + o) * TEX_AREA, o);
  }
  SETS[mat] = out;
  return out;
}

/** Number of textures in materialSet(mat). */
export function materialSetSize(mat: MaterialId): number {
  const r = RECIPES[mat];
  return r ? r.variants * r.orient : 1;
}

/** Mean grey level of a tinted material's tinted pixels (the tint maps this mean onto the target). */
export function tintMean(mat: MaterialId): number {
  materialBase(mat);
  return TINT_MEAN[mat] ?? 0;
}

// ---------------------------------------------------------------------------------------------------
// Biome tints (target mean colours; Minecraft's grass and water colour maps, matched to BIOMES)

/** Mean colour of a grass block top per biome: plains bright, dark forest deep, swamp olive... */
export const GRASS_TINT: Record<BiomeId, RGB> = {
  plains: [104, 162, 62],
  forest: [86, 150, 54],
  dark_forest: [62, 108, 42],
  snowy_taiga: [104, 148, 124],
  desert: [176, 172, 88],
  swamp: [104, 112, 56],
  jungle: [82, 178, 46],
  badlands: [150, 132, 80],
  cherry_grove: [128, 194, 86],
  mushroom_fields: [86, 172, 62],
  nether: [120, 96, 60],
};

/** Water colour per biome (swamp murky green, jungle teal, the rest blue; from BIOMES water[0]). */
export const WATER_TINT: Record<BiomeId, RGB> = Object.fromEntries(
  BIOME_IDS.map((b) => [b, BIOMES[b].water[0]]),
) as Record<BiomeId, RGB>;
WATER_TINT.plains = [56, 108, 216];
WATER_TINT.jungle = [40, 128, 196];
WATER_TINT.cherry_grove = [74, 144, 230];
WATER_TINT.swamp = [70, 98, 74];

/** Badlands terracotta bands: orange, plain, white, yellow, red, light grey and brown terracotta. */
export const TERRACOTTA_BANDS: readonly RGB[] = [
  [162, 84, 38],
  [152, 94, 68],
  [210, 178, 161],
  [186, 133, 36],
  [144, 62, 48],
  [136, 107, 98],
  [96, 64, 44],
];

// ---------------------------------------------------------------------------------------------------
// Liquids

/** Cached liquid sets: water per biome index, then lava at the end. */
const LIQUIDS: (Uint32Array | undefined)[] = [];

const LAVA_PAL: readonly RGB[] = [
  [72, 18, 8],
  [150, 44, 12],
  [192, 70, 16],
  [212, 90, 20],
  [236, 126, 30],
  [250, 164, 42],
  [255, 206, 76],
  [255, 238, 150],
];

/**
 * One liquid tile per (shore mask, frame): index (mask * LIQUID_FRAMES + frame) * 256.
 * Water is drawn in its biome's colour: a slowly morphing body, wave crests that rise, drift 2 px and
 * fade over the 4 frames, a darker bank (shadow of the shore) under north/west land and a flickering
 * 1 px foam line on south/east land. Lava boils (morphing bright blobs) and is crusted at its shores.
 */
export function liquidSet(liquid: LiquidId, biome: number): Uint32Array {
  const slot = liquid === LIQUID.LAVA ? BIOME_IDS.length : biome;
  const hit = LIQUIDS[slot];
  if (hit) return hit;
  const out = new Uint32Array(16 * LIQUID_FRAMES * TEX_AREA);
  const frames: Uint8Array[] = [];
  let palette: number[];
  if (liquid === LIQUID.LAVA) {
    palette = LAVA_PAL.map(opaque);
    const a = field(
      7001,
      [
        [8, 0.6],
        [4, 0.4],
      ],
      0,
    );
    const b = field(
      7002,
      [
        [8, 0.6],
        [4, 0.4],
      ],
      0,
    );
    const c = field(
      7003,
      [
        [4, 0.6],
        [2, 0.3],
      ],
      0.2,
    );
    for (let f = 0; f < LIQUID_FRAMES; f++) {
      const th = (f / LIQUID_FRAMES) * Math.PI * 2;
      const m = new Float32Array(TEX_AREA);
      for (let k = 0; k < TEX_AREA; k++)
        m[k] = (c[k] ?? 0) * 0.8 + ((a[k] ?? 0) * Math.cos(th) + (b[k] ?? 0) * Math.sin(th)) * 0.7;
      frames.push(rankTones(m, [0.03, 0.1, 0.3, 0.27, 0.17, 0.09, 0.04], 1));
    }
  } else {
    const id = BIOME_IDS[biome] ?? 'plains';
    const w = WATER_TINT[id];
    palette = [
      scale(w, 0.86),
      scale(w, 0.93),
      w,
      scale(w, 1.08),
      toward(scale(w, 1.18), [255, 255, 255], 0.12),
      toward(w, [255, 255, 255], 0.45),
      toward(w, [255, 255, 255], 0.62),
      scale(w, 0.62),
    ].map(opaque);
    const a = field(
      8001,
      [
        [8, 0.6],
        [4, 0.4],
      ],
      0,
    );
    const b = field(
      8002,
      [
        [8, 0.6],
        [4, 0.4],
      ],
      0,
    );
    const c = field(
      8003,
      [
        [8, 0.5],
        [4, 0.3],
      ],
      0.25,
    );
    const rnd = stream(8004);
    const crests = Array.from({ length: 5 }, () => ({
      x: Math.floor(rnd() * TEX),
      y: Math.floor(rnd() * TEX),
      p: Math.floor(rnd() * LIQUID_FRAMES),
      l: 2 + Math.floor(rnd() * 2),
    }));
    for (let f = 0; f < LIQUID_FRAMES; f++) {
      const th = (f / LIQUID_FRAMES) * Math.PI * 2;
      const m = new Float32Array(TEX_AREA);
      for (let k = 0; k < TEX_AREA; k++)
        m[k] = (c[k] ?? 0) + ((a[k] ?? 0) * Math.cos(th) + (b[k] ?? 0) * Math.sin(th)) * 0.35;
      const t = rankTones(m, [0.08, 0.3, 0.44, 0.18]);
      for (const cr of crests) {
        const age = (f - cr.p + LIQUID_FRAMES) % LIQUID_FRAMES;
        if (age === 3) continue;
        const len = age === 1 ? cr.l + 1 : cr.l;
        for (let s = 0; s < len; s++) put(t, cr.x + age + s, cr.y, age === 1 && s > 0 ? 5 : 4);
      }
      frames.push(t);
    }
  }
  for (let mask = 0; mask < 16; mask++) {
    for (let f = 0; f < LIQUID_FRAMES; f++) {
      const t = (frames[f] ?? new Uint8Array(TEX_AREA)).slice();
      if (liquid === LIQUID.LAVA) {
        // Cooling crust where the lava meets the ground.
        for (let i = 0; i < TEX; i++) {
          const ragged = hash2(i, mask, 7010 + f) < 0.4 ? 2 : 1;
          if (mask & SIDE.N) for (let d = 0; d < ragged + 1; d++) put(t, i, d, d === 0 ? 0 : 1);
          if (mask & SIDE.S) for (let d = 0; d < ragged; d++) put(t, i, 15 - d, d === 0 ? 0 : 1);
          if (mask & SIDE.W) for (let d = 0; d < ragged; d++) put(t, d, i, d === 0 ? 0 : 1);
          if (mask & SIDE.E) for (let d = 0; d < ragged; d++) put(t, 15 - d, i, d === 0 ? 0 : 1);
        }
      } else {
        // Bank shadow under north/west shores, flickering foam on south/east shores.
        for (let i = 0; i < TEX; i++) {
          const foam = (i + f) % 4 === 0 ? 4 : 6;
          if (mask & SIDE.S) {
            put(t, i, 15, foam);
            if ((i * 7 + f * 3) % 5 === 0) put(t, i, 14, 5);
          }
          if (mask & SIDE.E) {
            put(t, 15, i, foam);
            if ((i * 7 + f * 3) % 5 === 0) put(t, 14, i, 5);
          }
          if (mask & SIDE.N) {
            put(t, i, 0, 7);
            put(t, i, 1, 7);
            if (get(t, i, 2) > 1) put(t, i, 2, 0);
          }
          if (mask & SIDE.W) {
            put(t, 0, i, 7);
            put(t, 1, i, 7);
            if (get(t, 2, i) > 1) put(t, 2, i, 0);
          }
        }
      }
      const off = (mask * LIQUID_FRAMES + f) * TEX_AREA;
      for (let k = 0; k < TEX_AREA; k++) out[off + k] = palette[t[k] ?? 0] ?? 0;
    }
  }
  LIQUIDS[slot] = out;
  return out;
}
