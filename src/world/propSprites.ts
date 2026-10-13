/**
 * Procedural prop sprites in a Minecraft voxel look, painted once per (kind, biome, variant) and cached.
 *
 * Trees, rocks and huge mushrooms are tiny voxel models (`Vox`) rendered in an oblique 3/4 view: every
 * voxel shows a lit top face and a front face, light comes from the top-left (lit left / back rims,
 * darker right / bottom edges, overhang shadow under canopies) and faces are textured with 5-tone
 * palettes (leaves with dark holes, bark stripes, cobble, terracotta bands...). Crafted blocks (ore,
 * chests, TNT...) are single textured boxes; small plants are hand-authored pixel maps.
 */
import { hash2 } from '../core/noise';
import { mix, pack, PixBuffer, shade, type RGB } from '../core/pixelart';
import { type Biome, BIOMES, type BiomeId } from './biomes';
import { type PropKind, type PropStyle, propStyleFor } from './props';
import { STRUCTURE2_GALLERY, STRUCTURE2_PAINTERS } from './structureSprites';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Feet anchor inside the sprite. */
  ox: number;
  oy: number;
}

/** DOM-free sprite (tests, tools): pixels plus feet anchor and the style that painted it. */
export interface PropPixels {
  buf: PixBuffer;
  ox: number;
  oy: number;
  style: PropStyle;
}

const OUTLINE: RGB = [24, 28, 20];
/** Depth in pixels of one voxel row of a tree (top-face height). */
const TREE_T = 2;
/** Tone offset meaning "leave this pixel transparent". */
const HOLE = 99;
/** Five tones, lightest first. */
type Pal = readonly [RGB, RGB, RGB, RGB, RGB];

const WHITE_WARM: RGB = [255, 248, 214];
const BLUE_DARK: RGB = [16, 22, 48];

/** Five-tone ramp around a base colour: warm highlights, cool shadows. */
function ramp(c: RGB, light?: RGB, dark?: RGB): Pal {
  const l = light ?? shade(c, 1.16);
  const d = dark ?? mix(shade(c, 0.78), BLUE_DARK, 0.08);
  return [mix(shade(l, 1.1), WHITE_WARM, 0.14), l, c, d, mix(shade(d, 0.72), BLUE_DARK, 0.14)];
}

// ---------------------------------------------------------------------------------------------------
// Materials and faces

interface Mat {
  pal: Pal;
  /** Tone offset of a face pixel at texture coords (u, v); HOLE leaves it transparent. */
  tex: (u: number, v: number, top: boolean) => number;
  /** Optional colour overlay (spots, bark marks); undefined keeps the palette tone. */
  over?: (u: number, v: number, top: boolean, tone: number) => RGB | undefined;
  /** Chance that an exposed silhouette-edge pixel is see-through (ragged leaves). */
  ragged?: number;
  /** Chance that a whole voxel face is one tone lighter or darker (visible leaf blocks). */
  jitter?: number;
  /** Takes the snow / moss cap on exposed top faces. */
  capped?: boolean;
  /** Front faces with blocks above them (no sky light) are one tone darker. */
  skyShade?: boolean;
  /** Every voxel face gets a lit top-left rim and a dark bottom-right rim (separate blocks read). */
  bevel?: boolean;
}

const EDGE_L = 1;
const EDGE_R = 2;
const EDGE_B = 4;
const EDGE_T = 8;
const ALL_EDGES = EDGE_L | EDGE_R | EDGE_B | EDGE_T;

/** Paint one face (top or front) of a box with edge lighting: lit left / back rims, dark right / bottom. */
function paintFace(
  buf: PixBuffer,
  X: number,
  Y: number,
  w: number,
  h: number,
  m: Mat,
  top: boolean,
  u0: number,
  v0: number,
  edges: number,
  add: number,
  seed: number,
): void {
  const base = (top ? 1 : 2) + add;
  for (let j = 0; j < h; j++) {
    const rowShade = m.bevel ? (j === 0 ? -1 : !top && j === h - 1 ? 1 : 0) : 0;
    for (let i = 0; i < w; i++) {
      const u = u0 + i;
      const v = v0 + j;
      const t = m.tex(u, v, top);
      if (t === HOLE) continue;
      const atL = (edges & EDGE_L) !== 0 && i === 0;
      const atR = (edges & EDGE_R) !== 0 && i === w - 1;
      const atB = !top && (edges & EDGE_B) !== 0 && j === h - 1;
      const atT = top && (edges & EDGE_T) !== 0 && j === 0;
      if (m.ragged && (atL || atR || atB || atT) && hash2(u, v, seed + 7) < m.ragged) continue;
      let tone = base + t + rowShade;
      if (m.bevel && !top && i === w - 1 && j > 0) tone += 1;
      if (atL || atT) tone -= 1;
      if (atR || atB) tone += 1;
      tone = tone < 0 ? 0 : tone > 4 ? 4 : tone;
      const c = m.over?.(u, v, top, tone) ?? m.pal[tone] ?? m.pal[2];
      buf.set(X + i, Y + j, pack(c));
    }
  }
}

/** A free-standing box (top face t px deep over a front face f px tall) with all edges lit. */
function drawBox(
  buf: PixBuffer,
  X: number,
  Y: number,
  w: number,
  t: number,
  f: number,
  m: Mat,
  seed: number,
): void {
  if (t > 0) paintFace(buf, X, Y, w, t, m, true, X, Y + 300, ALL_EDGES, 0, seed);
  if (f > 0) paintFace(buf, X, Y + t, w, f, m, false, X, Y + t, ALL_EDGES, 0, seed);
}

/** Leaf texture: mid green with scattered dark see-through holes and a few lit flecks. */
function leafMat(pal: Pal, seed: number, ragged = 0.06): Mat {
  return {
    pal,
    ragged,
    jitter: 0.14,
    capped: true,
    skyShade: true,
    bevel: true,
    tex: (u, v, top) => {
      const b = hash2(u, v, seed + 1);
      if (b > 0.88) return 2;
      if (b > 0.83) return 1;
      if (b < (top ? 0.2 : 0.07)) return -1;
      return 0;
    },
  };
}

/** Log side: vertical bark grooves; top: rings. */
function logMat(pal: Pal, seed: number): Mat {
  return {
    pal,
    skyShade: true,
    tex: (u, v, top) => {
      if (top) return (u + v) % 3 === 0 ? 1 : 0;
      const col = hash2(u, 0, seed);
      const groove = col < 0.34 ? 1 : 0;
      return groove + (hash2(u, v >> 1, seed + 3) < 0.14 ? 1 : 0) - (col > 0.86 ? 1 : 0);
    },
  };
}

function birchMat(seed: number): Mat {
  const pal: Pal = [
    [250, 250, 244],
    [234, 234, 226],
    [214, 214, 204],
    [182, 182, 172],
    [140, 140, 132],
  ];
  return {
    pal,
    skyShade: true,
    tex: (u, v) => (hash2(u, v, seed) < 0.12 ? 1 : 0),
    over: (u, v, top) => {
      if (top) return undefined;
      // Black horizontal streaks, 1-3 px long, on every third row.
      if (v % 3 !== 1) return undefined;
      const r = hash2(u >> 1, v, seed + 5);
      return r < 0.45 ? [44, 42, 40] : r < 0.55 ? [120, 118, 112] : undefined;
    },
  };
}

/** Cobblestone: irregular stones with dark mortar, lit top-left pixel per stone. */
function cobbleTex(seed: number): (u: number, v: number, top: boolean) => number {
  return (u, v) => {
    const row = Math.floor(v / 3);
    const off = (row & 1) * 2 + Math.floor(hash2(row, 0, seed) * 3);
    const cu = u + off;
    const cell = Math.floor(cu / 4);
    if (cu % 4 === 3 || v % 3 === 2) return hash2(cu, v, seed + 2) < 0.7 ? 1 : 0;
    const k = hash2(cell, row, seed + 1);
    const lit = cu % 4 === 0 && v % 3 === 0 ? -1 : 0;
    return (k < 0.3 ? -1 : k > 0.75 ? 1 : 0) + lit;
  };
}

const STONE: Pal = ramp([128, 128, 132], [150, 150, 154], [100, 100, 106]);

function stoneMat(seed: number): Mat {
  return { pal: STONE, capped: true, tex: cobbleTex(seed) };
}

function mossyMat(b: Biome, seed: number): Mat {
  const moss = ramp(mix(b.leaves[0], [90, 120, 50], 0.3));
  return {
    pal: STONE,
    capped: true,
    tex: cobbleTex(seed),
    over: (u, v, top, tone) => {
      const k = hash2(u >> 1, v >> 1, seed + 9) + (top ? 0.3 : 0) - (v % 7) * 0.02;
      return k > 0.62 ? moss[Math.min(4, tone + (hash2(u, v, seed) < 0.2 ? 1 : 0))] : undefined;
    },
  };
}

const SNOW: Pal = [
  [255, 255, 255],
  [244, 248, 253],
  [222, 232, 244],
  [196, 210, 228],
  [168, 186, 210],
];

function snowMat(seed: number): Mat {
  return { pal: SNOW, tex: (u, v) => (hash2(u, v, seed) < 0.1 ? 1 : 0) };
}

// ---------------------------------------------------------------------------------------------------
// Voxel models

/** Packed voxel key; coordinates must stay in -128..127. */
function vkey(x: number, y: number, z: number): number {
  return ((x + 128) << 16) | ((y + 128) << 8) | (z + 128);
}

/** Sparse voxel model: x right, y up, z towards the viewer. */
class Vox {
  readonly cells = new Map<number, Mat>();
  /** `disc` draws square layers with clipped corners instead of round ones. */
  square = false;

  set(x: number, y: number, z: number, m: Mat | null): void {
    if (m) this.cells.set(vkey(x, y, z), m);
    else this.cells.delete(vkey(x, y, z));
  }

  get(x: number, y: number, z: number): Mat | undefined {
    return this.cells.get(vkey(x, y, z));
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: Mat): void {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, m);
  }

  /**
   * Leaf disc of radius r around (cx, cz) (half-integers centre on 2x2 trunks); corners are rounded
   * and rim voxels are dropped with chance `drop` (Minecraft's random leaf corners).
   */
  disc(
    cx: number,
    y: number,
    cz: number,
    rx: number,
    rz: number,
    m: Mat,
    drop: number,
    seed: number,
  ) {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = Math.abs(x - cx) / (rx + 0.5);
        const dz = Math.abs(z - cz) / (rz + 0.5);
        // Square layers with clipped corners (blocky), or round discs.
        const d = this.square
          ? Math.max(dx, dz) + (dx > 0.7 && dz > 0.7 ? 0.3 : 0)
          : dx * dx + dz * dz;
        if (d > 1.02) continue;
        if (d > (this.square ? 0.8 : 0.55) && hash2(x * 31 + y, z * 17 - y, seed) < drop) continue;
        if (!this.get(x, y, z)) this.set(x, y, z, m);
      }
    }
  }
}

interface VoxOpts {
  /** Voxel width, top-face depth and front-face height in pixels. */
  s: number;
  t: number;
  f: number;
  /** Feet anchor in voxel coordinates (centre of the footprint; .5 steps allowed). */
  ax: number;
  az: number;
  seed: number;
  /** Exposed top faces of `capped` materials use this (snow); front rims get drips. */
  cap?: Mat;
  pad?: number;
  padTop?: number;
  padBottom?: number;
  padSide?: number;
}

interface VoxImage {
  buf: PixBuffer;
  ox: number;
  oy: number;
  /** Pixel position of a voxel: left column, top-face row and front-face row. */
  at: (x: number, y: number, z: number) => { X: number; top: number; front: number };
}

function renderVox(v: Vox, o: VoxOpts): VoxImage {
  let minX = 999;
  let maxX = -999;
  let minY = 999;
  let maxY = -999;
  let minZ = 999;
  let maxZ = -999;
  const list: [number, number, number, Mat][] = [];
  for (const [k, m] of v.cells) {
    const x = (k >> 16) - 128;
    const y = ((k >> 8) & 255) - 128;
    const z = (k & 255) - 128;
    list.push([x, y, z, m]);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const { s, t, f, seed } = o;
  const pad = o.pad ?? 1;
  const side = pad + (o.padSide ?? 0);
  const top0 = pad + (o.padTop ?? 0);
  const W = (maxX - minX + 1) * s + 2 * side;
  const H = top0 + (maxZ - minZ + 1) * t + (maxY - minY + 1) * f + pad + (o.padBottom ?? 0);
  const buf = new PixBuffer(W, H);
  const px = (x: number): number => side + (x - minX) * s;
  const py = (y: number, z: number): number => top0 + (z - minZ) * t + (maxY - y) * f;
  // Painter's order: back rows first, then bottom to top.
  list.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  for (const [x, y, z, m] of list) {
    const X = px(x);
    const Y = py(y, z);
    const L = v.get(x - 1, y, z) ? 0 : EDGE_L;
    const R = v.get(x + 1, y, z) ? 0 : EDGE_R;
    const jr = m.jitter ? hash2(x * 13 + z, y * 7 - z, seed + 77) : 1;
    const jitter = m.jitter && jr < m.jitter ? (jr < m.jitter / 2 ? -1 : 1) : 0;
    const exposedTop = !v.get(x, y + 1, z);
    const capped = exposedTop && o.cap !== undefined && m.capped === true;
    if (exposedTop) {
      const T = v.get(x, y, z - 1) || v.get(x, y + 1, z - 1) ? 0 : EDGE_T;
      const fm = capped && o.cap ? o.cap : m;
      const u0 = X;
      const v0 = (z - minZ) * t + 500 + y * 3;
      paintFace(buf, X, Y, s, t, fm, true, u0, v0, L | R | T, capped ? 0 : jitter, seed);
    }
    if (!v.get(x, y, z + 1)) {
      const B = v.get(x, y - 1, z) ? 0 : EDGE_B;
      // Overhang in front casts a shadow; anything above (no sky light) darkens a little more.
      let shadow = v.get(x, y + 1, z + 1) ? 1 : 0;
      if (!shadow && m.skyShade) {
        for (let k = y + 1; k <= maxY; k++) {
          if (v.get(x, k, z)) {
            shadow = 1;
            break;
          }
        }
      }
      const v0 = (maxY - y) * f;
      paintFace(buf, X, Y + t, s, f, m, false, X, v0, L | R | B, shadow + jitter, seed);
      if (capped && o.cap) {
        // Snow spilling over the front rim.
        for (let i = 0; i < s; i++) {
          const r = hash2(X + i, Y, seed + 41);
          if (r < 0.6) buf.set(X + i, Y + t, pack(o.cap.pal[r < 0.3 ? 1 : 2]));
          if (r < 0.16) buf.set(X + i, Y + t + 1, pack(o.cap.pal[2]));
        }
      }
    }
  }
  const ox = Math.floor(side + (o.ax + 0.5 - minX) * s);
  const oy = Math.min(H - 1, Math.floor(top0 + (o.az + 0.5 - minZ) * t + (maxY + 1) * f));
  return { buf, ox, oy, at: (x, y, z) => ({ X: px(x), top: py(y, z), front: py(y, z) + t }) };
}

// ---------------------------------------------------------------------------------------------------
// Sprite helpers

interface Ctx {
  biome: BiomeId;
  b: Biome;
  kind: PropKind;
  type: number;
  shape: number;
}

interface Pix {
  buf: PixBuffer;
  ox: number;
  oy: number;
}

function finish(img: Pix, outline: RGB | null = OUTLINE): Pix {
  if (outline) img.buf.outline(outline);
  return img;
}

function put(buf: PixBuffer, x: number, y: number, c: RGB): void {
  buf.set(x, y, pack(c));
}

function fill(buf: PixBuffer, x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const p = pack(c);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) buf.set(x, y, p);
}

/** Pixel map from strings: '.' transparent, other characters looked up in `key`. */
function pixmap(rows: readonly string[], key: Record<string, RGB>, pad = 1): PixBuffer {
  const w = Math.max(...rows.map((r) => r.length));
  const buf = new PixBuffer(w + pad * 2, rows.length + pad * 2);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = key[row.charAt(x)];
      if (c) put(buf, x + pad, y + pad, c);
    }
  });
  return buf;
}

function leafPal(b: Biome): Pal {
  const [base, light, dark] = b.leaves;
  return [mix(light, WHITE_WARM, 0.2), light, base, dark, mix(shade(dark, 0.68), BLUE_DARK, 0.1)];
}

function logPal(b: Biome): Pal {
  return ramp(b.trunk[0], shade(b.trunk[0], 1.18), b.trunk[1]);
}

/** Colour of grass-like plants: the ground grass where it is green, else the foliage palette. */
function plantPal(b: Biome): Pal {
  const g = b.ground === 'grass' || b.ground === 'mud' || b.ground === 'podzol';
  const [base, light, dark] = g ? b.grass : b.leaves;
  return [
    mix(light, WHITE_WARM, 0.3),
    shade(light, 1.08),
    base,
    shade(dark, 0.86),
    shade(dark, 0.6),
  ];
}

/** Vines hanging from the bottom of exposed leaf faces (drawn after the outline). */
function hangVines(img: VoxImage, v: Vox, leaves: Mat, s: number, f: number, seed: number) {
  const vine: RGB = [40, 84, 30];
  const leaf: RGB = [66, 120, 42];
  for (const [k, m] of v.cells) {
    if (m !== leaves) continue;
    const x = (k >> 16) - 128;
    const y = ((k >> 8) & 255) - 128;
    const z = (k & 255) - 128;
    if (v.get(x, y - 1, z) || v.get(x, y, z + 1)) continue;
    const p = img.at(x, y, z);
    for (let i = 0; i < s; i++) {
      if (hash2(p.X + i, p.front, seed) > 0.24) continue;
      const len = 3 + Math.floor(hash2(p.X + i, p.front, seed + 1) * 10);
      const y0 = p.front + Math.floor(f / 2);
      for (let j = 0; j < len; j++) {
        const yy = y0 + j;
        if (yy >= img.buf.h - 1) break;
        put(img.buf, p.X + i, yy, hash2(i, yy, seed + 2) < 0.25 ? leaf : vine);
        if (hash2(p.X + i, yy, seed + 3) < 0.18) put(img.buf, p.X + i + 1, yy, leaf);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Trees

/** Classic oak (and birch): a 1x1 log, two wide leaf layers and a narrow two-layer crown. */
function oakLike(c: Ctx, birch: boolean): Pix {
  const { b, shape } = c;
  const seed = 40 + shape * 7 + (birch ? 100 : 0);
  const pal = birch ? leafPalFrom(mix(b.leaves[0], [112, 156, 70], 0.55)) : leafPal(b);
  const leaves = leafMat(pal, seed);
  const log = birch ? birchMat(seed) : logMat(logPal(b), seed);
  const v = new Vox();
  const h = (birch ? 6 : 5) + (shape % 2);
  v.box(0, 0, 0, 0, h, 0, log);
  for (const ly of [h - 2, h - 1]) {
    for (let z = -2; z <= 2; z++) {
      for (let x = -2; x <= 2; x++) {
        const corner = Math.abs(x) === 2 && Math.abs(z) === 2;
        if (corner && hash2(x + ly * 5, z, seed) < 0.6) continue;
        if (!v.get(x, ly, z)) v.set(x, ly, z, leaves);
      }
    }
  }
  for (const ly of [h, h + 1]) {
    for (let z = -1; z <= 1; z++) {
      for (let x = -1; x <= 1; x++) {
        const corner = Math.abs(x) === 1 && Math.abs(z) === 1;
        if (corner && (ly === h + 1 || hash2(x, z + ly, seed + 2) < 0.5)) continue;
        v.set(x, ly, z, leaves);
      }
    }
  }
  const img = renderVox(v, { s: 5, t: TREE_T, f: 4, ax: 0, az: 0, seed, cap: snowCap(c) });
  return finish(img);
}

function leafPalFrom(base: RGB): Pal {
  return ramp(base, shade(base, 1.2), shade(base, 0.74));
}

function snowCap(c: Ctx): Mat | undefined {
  return c.b.snow ? snowMat(5 + c.shape) : undefined;
}

function darkOak(c: Ctx): Pix {
  const { b, shape } = c;
  const seed = 240 + shape * 7;
  const leaves = leafMat(leafPal(b), seed);
  const log = logMat(logPal(b), seed);
  const v = new Vox();
  const h = 4 + (shape % 2);
  v.square = true;
  v.box(0, 0, 0, 1, h + 1, 1, log);
  v.disc(0.5, h, 0.5, 3.5, 3, leaves, 0.25, seed);
  v.disc(0.5, h + 1, 0.5, 3.5, 3, leaves, 0.45, seed + 1);
  v.disc(0.5, h + 2, 0.5, 2.5, 2, leaves, 0.3, seed + 2);
  const img = renderVox(v, { s: 4, t: TREE_T, f: 4, ax: 0.5, az: 0.5, seed });
  return finish(img);
}

function spruce(c: Ctx): Pix {
  const { b, shape } = c;
  const seed = 300 + shape * 5;
  const leaves = leafMat(leafPal(b), seed);
  const log = logMat(logPal(b), seed);
  const v = new Vox();
  const big = shape >= 2;
  const tiers: [number, number][] = big
    ? [
        [2, 3],
        [3, 2],
        [4, 1],
        [5, 2],
        [6, 1],
        [7, 1],
        [8, 0],
      ]
    : [
        [2, 2],
        [3, 1],
        [4, 2],
        [5, 1],
        [6, 1],
        [7, 0],
      ];
  const top = tiers[tiers.length - 1]?.[0] ?? 7;
  v.box(0, 0, 0, 0, top - 1, 0, log);
  for (const [y, r] of tiers) {
    for (let z = -r; z <= r; z++) {
      for (let x = -r; x <= r; x++) {
        const ax = Math.abs(x);
        const az = Math.abs(z);
        if (r >= 2 && ax + az > r + (r >= 3 ? 1 : 0)) continue;
        if (r === 1 && ax === 1 && az === 1 && hash2(x, z + y, seed) < 0.7) continue;
        if (!v.get(x, y, z) || (x === 0 && z === 0 && y >= top - 1)) v.set(x, y, z, leaves);
      }
    }
  }
  v.set(0, top + 1, 0, leaves);
  const img = renderVox(v, { s: 4, t: TREE_T, f: 4, ax: 0, az: 0, seed, cap: snowCap(c) });
  return finish(img);
}

function swampOak(c: Ctx): Pix {
  const { b, shape } = c;
  const seed = 420 + shape * 7;
  const leaves = leafMat(leafPal(b), seed);
  const log = logMat(logPal(b), seed);
  const v = new Vox();
  const h = 4 + (shape % 2);
  v.box(0, 0, 0, 0, h, 0, log);
  v.disc(0, h - 1, 0, 3, 3, leaves, 0.35, seed);
  v.disc(0, h, 0, 3, 3, leaves, 0.55, seed + 1);
  v.disc(0, h + 1, 0, 2, 2, leaves, 0.4, seed + 2);
  v.disc(0, h + 2, 0, 1, 1, leaves, 0.5, seed + 3);
  const img = renderVox(v, { s: 4, t: TREE_T, f: 4, ax: 0, az: 0, seed, padBottom: 0 });
  finish(img);
  hangVines(img, v, leaves, 4, 4, seed);
  return img;
}

function jungleTree(c: Ctx): Pix {
  const { b, shape } = c;
  const seed = 520 + shape * 7;
  const leaves = leafMat(leafPal(b), seed);
  const log = logMat(logPal(b), seed);
  const v = new Vox();
  const h = 7 + (shape % 2);
  v.box(0, 0, 0, 1, h + 1, 1, log);
  v.disc(0.5, h, 0.5, 3.5, 3, leaves, 0.3, seed);
  v.disc(0.5, h + 1, 0.5, 3.5, 3, leaves, 0.5, seed + 1);
  v.disc(0.5, h + 2, 0.5, 2.5, 2, leaves, 0.35, seed + 2);
  v.disc(0.5, h + 3, 0.5, 1.5, 1, leaves, 0.4, seed + 3);
  const img = renderVox(v, { s: 4, t: TREE_T, f: 4, ax: 0.5, az: 0.5, seed });
  finish(img);
  hangVines(img, v, leaves, 4, 4, seed);
  // Cocoa pods on the trunk.
  const p = img.at(0, 2 + (shape % 3), 1);
  const pod: RGB[] = [
    [196, 120, 52],
    [150, 86, 36],
    [104, 60, 26],
  ];
  const px = p.X + 1 + (shape % 2) * 4;
  fill(img.buf, px, p.front + 1, px + 2, p.front + 3, pod[1] ?? WHITE_WARM);
  put(img.buf, px, p.front + 1, pod[0] ?? WHITE_WARM);
  fill(img.buf, px, p.front + 4, px + 2, p.front + 4, pod[2] ?? WHITE_WARM);
  return img;
}

function jungleBush(c: Ctx): Pix {
  const { b, shape } = c;
  const seed = 620 + shape * 7;
  const leaves = leafMat(leafPalFrom(mix(b.leaves[0], [58, 120, 40], 0.4)), seed, 0.3);
  const log = logMat(logPal(b), seed);
  const v = new Vox();
  v.set(0, 0, 0, log);
  v.disc(0, 0, 0, 2.2, 2, leaves, 0.4, seed);
  v.disc(0, 1, 0, 1.6, 1.4, leaves, 0.4, seed + 1);
  if (shape >= 2) v.disc(0, 2, 0, 0.8, 0.8, leaves, 0.2, seed + 2);
  const img = renderVox(v, { s: 4, t: TREE_T, f: 4, ax: 0, az: 0.5, seed });
  return finish(img);
}

function cherryTree(c: Ctx): Pix {
  const { b, shape } = c;
  const seed = 720 + shape * 7;
  const leaves = leafMat(leafPal(b), seed);
  const log = logMat(logPal(b), seed);
  const v = new Vox();
  const dir = shape % 2 === 0 ? 1 : -1;
  v.box(0, 0, 0, 0, 2, 0, log);
  // Forked trunk: one branch leaning each way, the main one longer.
  v.set(dir, 3, 0, log);
  v.set(2 * dir, 4, 0, log);
  v.set(-dir, 3, 0, log);
  v.set(-2 * dir, 4, 0, log);
  v.set(2 * dir, 5, 0, log);
  v.disc(0, 5, 0, 4, 2, leaves, 0.35, seed);
  v.disc(0, 6, 0, 3.6, 2, leaves, 0.5, seed + 1);
  v.disc(dir * 0.5, 7, 0, 2.4, 1.2, leaves, 0.45, seed + 2);
  // Hanging leaves under the rim.
  for (let x = -4; x <= 4; x++) {
    if (Math.abs(x) >= 2 && hash2(x, 4, seed + 4) < 0.35) v.set(x, 4, 1, leaves);
  }
  const img = renderVox(v, { s: 4, t: TREE_T, f: 4, ax: 0, az: 0, seed, padBottom: 2, padSide: 2 });
  finish(img);
  // Falling petals around and below the canopy.
  const petal: RGB[] = [
    [252, 206, 226],
    [236, 150, 190],
  ];
  const top = img.at(0, 4, 2).front;
  const x0 = img.at(-3, 4, 0).X;
  const x1 = img.at(4, 4, 0).X;
  for (let k = 0; k < 12; k++) {
    const x = x0 + Math.floor(hash2(k, shape, seed + 5) * (x1 - x0));
    const y = top + Math.floor(hash2(k, shape, seed + 6) * (img.buf.h - top));
    if (img.buf.get(x, y) !== 0) continue;
    put(img.buf, x, y, petal[k % 2] ?? WHITE_WARM);
  }
  return img;
}

function hugeMushroom(c: Ctx): Pix {
  const { shape } = c;
  const seed = 820 + shape * 7;
  const stem: Mat = {
    pal: ramp([214, 206, 190], [236, 230, 216], [178, 168, 150]),
    tex: (u, v) => (hash2(u, v, seed) < 0.15 ? 1 : hash2(u, v, seed + 1) < 0.1 ? -1 : 0),
  };
  const red = shape % 2 === 0;
  const v = new Vox();
  const tall = shape >= 2 ? 1 : 0;
  if (red) {
    const capPal = ramp([196, 40, 36], [222, 64, 54], [150, 26, 26]);
    const cap: Mat = {
      pal: capPal,
      tex: (u, v2) => (hash2(u, v2, seed + 2) < 0.1 ? 1 : 0),
      over: (u, v2) => {
        // Irregular white spots: 2x2 blobs on a jittered 5-px grid.
        const cu = Math.floor(u / 5);
        const cv = Math.floor(v2 / 4);
        const ou = Math.floor(hash2(cu, cv, seed + 4) * 3);
        const ov = Math.floor(hash2(cu, cv, seed + 5) * 2);
        const lu = u - cu * 5 - ou;
        const lv = v2 - cv * 4 - ov;
        const inSpot = lu >= 0 && lu < 2 && lv >= 0 && lv < 2;
        return inSpot && hash2(cu, cv, seed + 3) < 0.55 ? [244, 238, 228] : undefined;
      },
    };
    const top = 5 + tall;
    v.box(0, 0, 0, 0, top - 1, 0, stem);
    for (let y = top - 3; y < top; y++) {
      for (let z = -2; z <= 2; z++) {
        for (let x = -2; x <= 2; x++) {
          const ring = Math.max(Math.abs(x), Math.abs(z)) === 2;
          if (ring && !(Math.abs(x) === 2 && Math.abs(z) === 2)) v.set(x, y, z, cap);
        }
      }
    }
    v.box(-1, top, -1, 1, top, 1, cap);
    const img = renderVox(v, { s: 5, t: 2, f: 4, ax: 0, az: 0, seed });
    return finish(img);
  }
  const capPal = ramp([150, 112, 82], [172, 134, 100], [116, 84, 60]);
  const cap: Mat = {
    pal: capPal,
    tex: (u, v2) => (hash2(u, v2, seed + 2) < 0.12 ? -1 : hash2(u, v2, seed + 3) < 0.1 ? 1 : 0),
  };
  const top = 4 + tall;
  v.box(0, 0, 0, 0, top - 1, 0, stem);
  for (let z = -3; z <= 3; z++) {
    for (let x = -3; x <= 3; x++) {
      if (Math.abs(x) === 3 && Math.abs(z) === 3) continue;
      v.set(x, top, z, cap);
    }
  }
  const img = renderVox(v, { s: 4, t: TREE_T, f: 4, ax: 0, az: 0, seed });
  return finish(img);
}

// ---------------------------------------------------------------------------------------------------
// Rocks

/** Low mound of blocks: a 4x2 base (one corner dropped) under a 2x1 or 2x2 hump. */
function rockShape(v: Vox, shape: number, m: (y: number) => Mat, seed: number): void {
  v.box(0, 0, 0, 3, 0, 1, m(0));
  v.set(hash2(shape, 1, seed) < 0.5 ? 0 : 3, 0, hash2(shape, 2, seed) < 0.5 ? 0 : 1, null);
  const hx = 1 + (shape === 1 ? 1 : 0);
  v.box(hx - (shape === 2 ? 1 : 0), 1, 0, hx + 1, 1, shape >= 2 ? 1 : 0, m(1));
  if (shape === 3) v.set(hx + 1, 0, 2, m(0));
}

function boulderLike(c: Ctx, mat: Mat, cap?: Mat): Pix {
  const v = new Vox();
  rockShape(v, c.shape, () => mat, 200);
  const img = renderVox(v, { s: 4, t: 3, f: 4, ax: 1.5, az: 0.5, seed: 200 + c.shape, cap });
  return finish(img);
}

function boulder(c: Ctx): Pix {
  return boulderLike(c, stoneMat(210 + c.shape));
}

function mossyBoulder(c: Ctx): Pix {
  return boulderLike(c, mossyMat(c.b, 220 + c.shape));
}

function snowyRock(c: Ctx): Pix {
  const m = stoneMat(230 + c.shape);
  return boulderLike(c, m, snowMat(231));
}

function sandstoneRock(c: Ctx): Pix {
  const pal: Pal = ramp([216, 196, 134], [232, 216, 158], [186, 164, 104]);
  const m: Mat = {
    pal,
    tex: (u, v, top) => {
      if (top) return hash2(u, v, 7) < 0.1 ? 1 : 0;
      const band = v % 4 === 3 ? 1 : v % 4 === 0 ? -1 : 0;
      return band + (hash2(u, v, 8) < 0.08 ? 1 : 0);
    },
  };
  return boulderLike(c, m);
}

/** Badlands terracotta: every block layer a different clay band. */
const TERRACOTTA: RGB[] = [
  [160, 84, 44],
  [186, 134, 40],
  [208, 176, 158],
  [146, 64, 48],
  [112, 74, 52],
  [182, 98, 56],
];

function terracottaRock(c: Ctx): Pix {
  const mats = TERRACOTTA.map((col, i): Mat => ({
    pal: ramp(col),
    tex: (u, v) => (hash2(u, v, 900 + i) < 0.1 ? 1 : hash2(u, v, 950 + i) < 0.06 ? -1 : 0),
  }));
  const pick = (y: number): Mat => mats[(y + c.shape) % mats.length] ?? (mats[0] as Mat);
  const v = new Vox();
  const o = c.shape % 2;
  v.box(0, 0, 0, 3, 0, 1, pick(0));
  v.set(o ? 0 : 3, 0, 0, null);
  v.box(o, 1, 0, 2 + o, 1, 1, pick(1));
  v.box(o, 2, 0, 1 + o, 2, c.shape >= 2 ? 1 : 0, pick(2));
  if (c.shape === 3) v.set(1, 3, 0, pick(3));
  const img = renderVox(v, { s: 4, t: 2, f: 3, ax: 1.5, az: 0.5, seed: 240 + c.shape });
  return finish(img);
}

function basalt(c: Ctx): Pix {
  const pal: Pal = ramp([76, 74, 84], [100, 98, 110], [54, 52, 62]);
  const m: Mat = {
    pal,
    tex: (u, v, top) => {
      if (top) return (Math.abs((u % 6) - 3) + Math.abs((v % 6) - 3)) % 3 === 0 ? 1 : 0;
      return (u % 3 === 2 ? 1 : 0) + (hash2(u, v >> 2, 260) < 0.12 ? 1 : 0);
    },
  };
  const v = new Vox();
  const h = 3 + (c.shape % 2);
  v.box(0, 0, 0, 1, h, 0, m);
  if (c.shape >= 2) v.set(1, h, 0, null);
  const img = renderVox(v, { s: 6, t: 3, f: 5, ax: 0.5, az: 0, seed: 250 + c.shape });
  return finish(img);
}

// ---------------------------------------------------------------------------------------------------
// Blocks

const ORE_FLECKS: [RGB, RGB, RGB][] = [
  [
    [70, 70, 74],
    [34, 34, 38],
    [18, 18, 20],
  ], // coal
  [
    [236, 202, 176],
    [214, 166, 132],
    [160, 112, 82],
  ], // iron
  [
    [255, 246, 120],
    [250, 210, 40],
    [196, 140, 20],
  ], // gold
  [
    [90, 132, 240],
    [36, 74, 196],
    [22, 44, 132],
  ], // lapis
  [
    [255, 96, 80],
    [214, 20, 20],
    [130, 6, 6],
  ], // redstone
  [
    [214, 255, 250],
    [92, 232, 222],
    [36, 160, 160],
  ], // diamond
];

function smoothStone(seed: number): Mat {
  return {
    pal: STONE,
    tex: (u, v) => {
      const a = hash2(u >> 1, v, seed);
      return a < 0.14 ? 1 : a > 0.9 ? -1 : 0;
    },
  };
}

/** One stone block with clusters of ore. */
function ore(c: Ctx): Pix {
  const buf = new PixBuffer(14, 17);
  const seed = 900 + c.shape * 3;
  drawBox(buf, 1, 1, 12, 5, 10, smoothStone(seed), seed);
  const fl = ORE_FLECKS[c.type] ?? ORE_FLECKS[0];
  if (fl) {
    const spots: [number, number][] = [
      [3, 8],
      [8, 9],
      [5, 12],
      [9, 13],
      [3, 2],
      [8, 3],
    ];
    spots.forEach(([sx, sy], i) => {
      const jx = sx + Math.floor(hash2(i, c.shape, seed) * 2);
      const jy = sy + Math.floor(hash2(i, c.shape, seed + 1) * 2);
      put(buf, jx, jy, fl[0]);
      put(buf, jx + 1, jy, fl[1]);
      put(buf, jx, jy + 1, fl[1]);
      put(buf, jx + 1, jy + 1, fl[2]);
      if (hash2(i, c.shape, seed + 2) < 0.5 && jy < 6) put(buf, jx + 2, jy, fl[1]);
    });
  }
  return finish({ buf, ox: 7, oy: 13 });
}

function plankMat(pal: Pal, seed: number): Mat {
  return {
    pal,
    tex: (u, v, top) => {
      const line = top ? v % 3 === 2 : v % 4 === 3;
      return (line ? 1 : 0) + (hash2(u >> 2, v, seed) < 0.12 ? 1 : 0);
    },
  };
}

function chest(c: Ctx): Pix {
  const locked = c.kind === 'locked_chest';
  const buf = new PixBuffer(16, 15);
  const pal: Pal = locked
    ? ramp([104, 70, 50], [126, 88, 62], [76, 50, 36])
    : ramp([170, 112, 44], [196, 138, 60], [132, 84, 32]);
  drawBox(buf, 1, 1, 14, 5, 8, plankMat(pal, 31), 31);
  const dark: RGB = locked ? [42, 28, 22] : [70, 42, 18];
  fill(buf, 1, 8, 14, 8, dark); // lid seam
  fill(buf, 1, 1, 14, 1, pal[1]);
  if (locked) {
    const iron: RGB = [168, 170, 180];
    const ironD: RGB = [110, 112, 124];
    for (const x of [3, 12]) {
      fill(buf, x, 1, x, 13, iron);
      put(buf, x, 6, ironD);
      put(buf, x, 13, ironD);
    }
    fill(buf, 6, 7, 9, 11, [244, 196, 50]);
    fill(buf, 9, 7, 9, 11, [196, 146, 30]);
    fill(buf, 7, 5, 8, 6, [150, 150, 160]);
    put(buf, 7, 9, [60, 40, 10]);
    put(buf, 7, 10, [60, 40, 10]);
  } else {
    fill(buf, 7, 7, 8, 10, [206, 206, 214]);
    fill(buf, 8, 7, 8, 10, [140, 140, 150]);
    put(buf, 7, 9, [60, 60, 66]);
  }
  return finish({ buf, ox: 8, oy: 13 });
}

function melon(c: Ctx): Pix {
  const pumpkin = c.kind === 'pumpkin';
  const buf = new PixBuffer(12, 14);
  const pal: Pal = pumpkin
    ? ramp([224, 124, 26], [246, 156, 48], [182, 92, 16])
    : ramp([92, 158, 50], [126, 186, 70], [58, 112, 34]);
  const m: Mat = {
    pal,
    tex: (u, v, top) => {
      if (top) {
        return pumpkin ? (u % 3 === 0 ? 1 : 0) : hash2(u, v, 3) < 0.25 ? 1 : 0;
      }
      if (pumpkin) return u % 3 === 0 ? 1 : 0;
      return (u + (v >> 2)) % 3 === 0 ? 1 : (u + (v >> 2)) % 3 === 1 ? -1 : 0;
    },
  };
  drawBox(buf, 1, 2, 10, 4, 7, m, 55);
  const stem: RGB = pumpkin ? [96, 120, 40] : [120, 96, 40];
  fill(buf, 5, 2, 6, 3, stem);
  put(buf, 6, 1, shade(stem, 0.7));
  if (!pumpkin) put(buf, 7, 2, shade(stem, 0.8));
  return finish({ buf, ox: 6, oy: 11 });
}

function beacon(): Pix {
  const buf = new PixBuffer(18, 22);
  const iron: Mat = {
    pal: ramp([210, 212, 218], [232, 234, 238], [170, 172, 180]),
    tex: (u, v, top) => (top ? 0 : (u + 1) % 5 === 0 || v % 4 === 0 ? 1 : 0),
  };
  drawBox(buf, 1, 13, 16, 4, 4, iron, 61);
  const glass: Mat = {
    pal: ramp([176, 214, 222], [214, 240, 246], [130, 168, 180]),
    tex: () => 0,
  };
  drawBox(buf, 4, 2, 10, 4, 9, glass, 62);
  // Through the glass: obsidian floor and the glowing core.
  fill(buf, 5, 13, 12, 14, [44, 32, 62]);
  fill(buf, 6, 8, 11, 12, [110, 236, 244]);
  fill(buf, 7, 9, 10, 11, [210, 255, 255]);
  fill(buf, 8, 10, 9, 10, [255, 255, 255]);
  fill(buf, 11, 9, 11, 12, [60, 176, 196]);
  fill(buf, 5, 3, 12, 4, [214, 248, 252]);
  return finish({ buf, ox: 9, oy: 19 });
}

function campfire(): Pix {
  const buf = new PixBuffer(18, 16);
  const log = logMat(ramp([110, 76, 44], [134, 96, 58], [78, 52, 30]), 71);
  const end: RGB = [196, 160, 100];
  drawBox(buf, 2, 6, 14, 2, 3, log, 71); // back log
  drawBox(buf, 2, 7, 3, 6, 3, log, 72); // side logs
  drawBox(buf, 13, 7, 3, 6, 3, log, 73);
  fill(buf, 5, 9, 12, 12, [60, 40, 26]);
  fill(buf, 6, 10, 11, 11, [255, 120, 30]);
  drawBox(buf, 1, 11, 16, 2, 3, log, 74); // front log
  put(buf, 1, 13, end);
  put(buf, 16, 13, end);
  // Flame.
  fill(buf, 6, 5, 11, 10, [250, 120, 20]);
  fill(buf, 7, 2, 10, 8, [255, 168, 40]);
  fill(buf, 8, 0, 9, 6, [255, 214, 80]);
  fill(buf, 8, 5, 9, 9, [255, 246, 190]);
  put(buf, 6, 4, [255, 168, 40]);
  put(buf, 11, 3, [255, 168, 40]);
  return finish({ buf, ox: 9, oy: 13 });
}

function anvil(): Pix {
  const buf = new PixBuffer(18, 15);
  const iron: Mat = {
    pal: ramp([92, 92, 102], [120, 120, 132], [64, 64, 72]),
    tex: (u, v) => (hash2(u, v, 81) < 0.12 ? 1 : 0),
  };
  drawBox(buf, 4, 9, 10, 2, 3, iron, 81); // foot
  drawBox(buf, 6, 7, 6, 0, 3, iron, 82); // waist
  drawBox(buf, 1, 1, 16, 3, 3, iron, 83); // face and horn
  // Taper the horn.
  buf.set(1, 5, 0);
  buf.set(1, 6, 0);
  buf.set(2, 6, 0);
  return finish({ buf, ox: 9, oy: 13 });
}

function enchantTable(): Pix {
  const buf = new PixBuffer(16, 19);
  const obsidian: Mat = {
    pal: ramp([40, 28, 56], [62, 46, 84], [24, 16, 34]),
    tex: (u, v) => (hash2(u, v, 91) < 0.14 ? -1 : 0),
    over: (u, v, top) => (!top && hash2(u, v, 92) < 0.06 ? [120, 90, 200] : undefined),
  };
  drawBox(buf, 1, 7, 14, 4, 7, obsidian, 91);
  const cloth: RGB[] = [
    [214, 60, 60],
    [176, 34, 40],
    [120, 20, 30],
  ];
  fill(buf, 1, 7, 14, 10, cloth[1] ?? WHITE_WARM);
  fill(buf, 2, 7, 13, 7, cloth[0] ?? WHITE_WARM);
  fill(buf, 1, 11, 14, 12, cloth[2] ?? WHITE_WARM);
  for (const x of [2, 5, 8, 11]) put(buf, x + 1, 12, cloth[1] ?? WHITE_WARM);
  const gem: RGB = [96, 232, 236];
  put(buf, 1, 7, gem);
  put(buf, 14, 7, gem);
  put(buf, 2, 10, gem);
  put(buf, 13, 10, gem);
  // Floating open book: cover, two pages, dark spine.
  fill(buf, 3, 2, 12, 4, [120, 70, 34]);
  fill(buf, 4, 1, 7, 3, [244, 238, 220]);
  fill(buf, 8, 1, 11, 3, [226, 218, 196]);
  fill(buf, 4, 3, 7, 3, [214, 206, 184]);
  fill(buf, 7, 1, 8, 4, [90, 50, 24]);
  return finish({ buf, ox: 8, oy: 16 });
}

function tnt(): Pix {
  const buf = new PixBuffer(12, 14);
  const red: Mat = {
    pal: ramp([200, 48, 38], [226, 72, 56], [150, 30, 26]),
    tex: (u, _v, top) => (top ? 0 : u % 3 === 0 ? 1 : 0),
  };
  drawBox(buf, 1, 1, 10, 4, 8, red, 101);
  // Top: pale cap with the fuse.
  fill(buf, 2, 2, 9, 4, [214, 200, 186]);
  fill(buf, 5, 2, 6, 3, [70, 60, 50]);
  // White label band with "TNT" in 3x3 letters.
  fill(buf, 1, 6, 10, 10, [236, 232, 224]);
  const ink: RGB = [40, 36, 34];
  for (const x0 of [1, 7]) {
    fill(buf, x0, 7, x0 + 2, 7, ink);
    fill(buf, x0 + 1, 8, x0 + 1, 9, ink);
  }
  fill(buf, 4, 7, 4, 9, ink);
  fill(buf, 6, 7, 6, 9, ink);
  put(buf, 5, 8, ink);
  return finish({ buf, ox: 6, oy: 11 });
}

function magma(c: Ctx): Pix {
  const buf = new PixBuffer(16, 12);
  const m: Mat = {
    pal: [
      [255, 220, 90],
      [255, 150, 30],
      [196, 70, 20],
      [110, 36, 22],
      [64, 22, 18],
    ],
    tex: (u, v, top) => {
      const crack = (u + 2 * v + Math.floor(hash2(u >> 2, v >> 1, 911 + c.shape) * 3)) % 5 === 0;
      if (crack) return top ? -2 : -1;
      return hash2(u, v, 912 + c.shape) < 0.3 ? 2 : 1;
    },
  };
  drawBox(buf, 1, 1, 14, 7, 3, m, 913);
  return finish({ buf, ox: 8, oy: 7 });
}

function cobweb(c: Ctx): Pix {
  const buf = new PixBuffer(17, 15);
  const w = pack([238, 240, 246]);
  const g = pack([184, 188, 198]);
  const cx = 8;
  const cy = 7;
  for (let i = -8; i <= 8; i++) {
    buf.set(cx + i, cy, w);
    if (Math.abs(i) <= 7) {
      buf.set(cx, cy + i, w);
      buf.set(cx + i, cy + i, g);
      buf.set(cx + i, cy - i, g);
    }
  }
  // Square-ish rings like the block texture.
  for (const r of [3, 6]) {
    for (let i = -r; i <= r; i++) {
      const k = Math.abs(i) === r ? 0 : 1;
      buf.set(cx + i, cy - r + (Math.abs(i) > r - 2 ? 1 : 0) * k, w);
      buf.set(cx + i, cy + r - (Math.abs(i) > r - 2 ? 1 : 0) * k, w);
      buf.set(cx - r, cy + i, w);
      buf.set(cx + r, cy + i, w);
    }
  }
  for (let k = 0; k < 6; k++) {
    const x = Math.floor(hash2(k, c.shape, 120) * 17);
    const y = Math.floor(hash2(k, c.shape, 121) * 15);
    buf.set(x, y, 0);
  }
  return { buf, ox: 8, oy: 11 };
}

function cactus(c: Ctx): Pix {
  const tall = c.shape % 2 === 0 ? 3 : 2;
  const flower = c.shape >= 2;
  const pal: Pal = ramp([70, 140, 56], [96, 168, 72], [48, 106, 40]);
  const m: Mat = {
    pal,
    tex: (u, v, top) => {
      if (top) {
        const ring = u % 8 === 1 || u % 8 === 6 || v % 4 === 0;
        return ring ? 0 : -1;
      }
      return u % 3 === 1 ? 1 : 0;
    },
    over: (u, v, top) => {
      if (top) return undefined;
      const r = hash2(u, v, 131);
      return r < 0.05 ? [232, 228, 190] : r < 0.09 ? [24, 50, 20] : undefined;
    },
  };
  const v = new Vox();
  v.box(0, 0, 0, 0, tall - 1, 0, m);
  const img = renderVox(v, { s: 8, t: 4, f: 8, ax: 0, az: 0, seed: 130, padTop: flower ? 3 : 0 });
  if (flower) {
    const p = img.at(0, tall - 1, 0);
    const pink: RGB[] = [
      [250, 150, 196],
      [226, 92, 150],
      [255, 220, 236],
    ];
    const x = p.X + 2 + (c.shape % 2);
    fill(img.buf, x, p.top - 2, x + 3, p.top, pink[1] ?? WHITE_WARM);
    fill(img.buf, x + 1, p.top - 3, x + 2, p.top - 1, pink[0] ?? WHITE_WARM);
    put(img.buf, x + 1, p.top - 2, pink[2] ?? WHITE_WARM);
    put(img.buf, x + 1, p.top + 1, [60, 120, 40]);
  }
  return finish(img);
}

// ---------------------------------------------------------------------------------------------------
// Ground plants (pixel maps and blades)

function blades(pal: Pal, shape: number, n: number, minH: number, maxH: number, seed: number): Pix {
  const buf = new PixBuffer(14, maxH + 2);
  const bottom = maxH;
  for (let i = 0; i < n; i++) {
    const x = 2 + Math.floor((i * 10) / (n - 1)) + (hash2(i, shape, seed) < 0.3 ? 1 : 0);
    const h = minH + Math.floor(hash2(i, shape, seed + 1) * (maxH - minH + 1));
    const lean = hash2(i, shape, seed + 2) < 0.5 ? -1 : 1;
    for (let k = 0; k < h; k++) {
      const y = bottom - k;
      const xx = x + (k > h * 0.6 ? lean : 0);
      const c = k >= h - 1 ? pal[0] : k > h * 0.6 ? pal[1] : k < 2 ? pal[3] : pal[2];
      put(buf, xx, y, c);
    }
  }
  return { buf, ox: 7, oy: bottom };
}

function tallGrass(c: Ctx): Pix {
  const pal = plantPal(c.b);
  const img = blades(pal, c.shape, 6 + (c.shape % 2) * 2, 3, 8 + (c.shape >> 1), 77);
  return finish(img, shade(pal[4], 0.6));
}

function dryGrass(c: Ctx): Pix {
  const pal = ramp([196, 156, 84], [222, 186, 110], [150, 110, 56]);
  const img = blades(pal, c.shape, 6, 2, 7, 78);
  return finish(img, [70, 44, 24]);
}

function deadBush(c: Ctx): Pix {
  const key: Record<string, RGB> = { a: [150, 104, 56], b: [112, 74, 40], c: [176, 132, 76] };
  const rows =
    c.shape % 2 === 0
      ? [
          'c.....c..c',
          '.a...a..a.',
          '..a.ab.a..',
          'c..ba.bc..',
          '.a..bab..c',
          '..a.bb.aa.',
          '...abba...',
          '....bb....',
          '....bb....',
        ]
      : [
          '..c....c..',
          'c..a..a...',
          '.a..ab..ac',
          '..a.ba.a..',
          '...bab.b..',
          '.c..bb.a..',
          '..aabba...',
          '....bb....',
        ];
  const buf = pixmap(rows, key);
  return finish({ buf, ox: 5, oy: buf.h - 2 }, [62, 40, 22]);
}

function fern(c: Ctx, large: boolean): Pix {
  const pal = large ? leafPalFrom(mix(c.b.leaves[0], [60, 130, 40], 0.3)) : plantPal(c.b);
  const key: Record<string, RGB> = { l: pal[1], g: pal[2], d: pal[3], h: pal[0] };
  const small = [
    '.h.....h..',
    'l.g...g.l.',
    '.lg.h.gl..',
    '..ld.dl.h.',
    'h.gdgdg.l.',
    '.lg.dd.gl.',
    '..l.dd.l..',
    '....dd....',
  ];
  const tall = [
    '......h......',
    '..h..ldl..h..',
    '.l.g.ldl.g.l.',
    'l..ldgdgdl..l',
    '.g..ldddl..g.',
    '..lg.ddd.gl..',
    'h..ldgdgdl..h',
    '.l..lddd..l..',
    '..lg.ddd.gl..',
    '.l..ldgdl..l.',
    '...lg.d.gl...',
    '.....ddd.....',
    '......d......',
  ];
  const rows = large ? tall : small;
  const flip = c.shape % 2 === 1;
  const buf = pixmap(flip ? rows.map((r) => [...r].reverse().join('')) : rows, key);
  return finish({ buf, ox: Math.floor(buf.w / 2), oy: buf.h - 2 }, shade(pal[4], 0.6));
}

function sweetBerryBush(c: Ctx): Pix {
  const pal = leafPalFrom([52, 96, 52]);
  const key: Record<string, RGB> = {
    l: pal[1],
    g: pal[2],
    d: pal[3],
    k: pal[4],
    r: [214, 30, 44],
    R: [255, 110, 110],
  };
  const buf = pixmap(
    [
      '...lgl.l...',
      '.lglggdgl..',
      'lgRrdglgRl.',
      'gdrgdgdgrgl',
      'lgdglRgdgdg',
      'gdgdgrdkdgd',
      '.dkdgdkdkd.',
      '..k.d.d.k..',
    ],
    key,
  );
  void c;
  return finish({ buf, ox: 6, oy: buf.h - 2 });
}

function sugarCane(c: Ctx): Pix {
  const pal = ramp([132, 184, 80], [164, 212, 104], [96, 146, 56]);
  const buf = new PixBuffer(12, 22);
  const stalks: [number, number][] = [
    [3, 14 + (c.shape % 2) * 3],
    [6, 19],
    [9, 12 + (c.shape % 3) * 2],
  ];
  for (const [x, h] of stalks) {
    for (let k = 0; k < h; k++) {
      const y = 20 - k;
      const node = k % 5 === 4;
      put(buf, x, y, node ? pal[3] : pal[1]);
      put(buf, x + 1, y, node ? pal[4] : pal[2]);
      if (k % 5 === 2 && k > 3) put(buf, x + (k % 2 === 0 ? -1 : 2), y - 1, pal[0]);
    }
  }
  return finish({ buf, ox: 6, oy: 20 });
}

function bamboo(c: Ctx): Pix {
  const pal = ramp([96, 160, 52], [128, 190, 72], [64, 120, 36]);
  const leaf = leafPalFrom([74, 150, 46]);
  const buf = new PixBuffer(18, 46);
  const stalks: [number, number][] = [
    [4, 26 + (c.shape % 2) * 6],
    [8, 40 - (c.shape % 3) * 3],
    [12, 30 + (c.shape >> 1) * 4],
  ];
  for (const [x, h] of stalks) {
    for (let k = 0; k < h; k++) {
      const y = 44 - k;
      const node = k % 6 === 5;
      put(buf, x, y, node ? pal[3] : pal[1]);
      put(buf, x + 1, y, node ? pal[4] : pal[2]);
      put(buf, x + 2, y, node ? pal[4] : pal[3]);
    }
    // Leaf tufts at the top and on a node.
    const ty = 44 - h;
    for (const [dx, dy] of [
      [-2, 1],
      [-1, 0],
      [3, 0],
      [4, 1],
      [-3, 2],
      [5, 2],
      [1, -1],
    ] as const) {
      put(buf, x + dx, ty + dy, leaf[(dx + dy + 8) % 3] ?? leaf[1]);
    }
    put(buf, x - 1, ty + 9, leaf[2]);
    put(buf, x - 2, ty + 10, leaf[1]);
    put(buf, x + 3, ty + 14, leaf[2]);
  }
  return finish({ buf, ox: 9, oy: 44 });
}

const FLOWER_ROWS: Record<string, readonly string[]> = {
  poppy: [
    '..rrr..',
    '.rRrRr.',
    '.rRkRr.',
    '..rRr..',
    '...g...',
    '.l.g...',
    '.llg.l.',
    '...gll.',
    '...g...',
  ],
  dandelion: [
    '.......',
    '..yyy..',
    '.yYyYy.',
    '..yYy..',
    '...g...',
    '...g.l.',
    '.l.gl..',
    '..lg...',
    '...g...',
  ],
  cornflower: [
    '.b.b.b.',
    '..bBb..',
    '.bBkBb.',
    '..bbb..',
    '...g...',
    '.l.g...',
    '..lg.l.',
    '...gl..',
    '...g...',
  ],
  oxeye_daisy: [
    '..www..',
    '.wWyWw.',
    '.wyyyw.',
    '..wWw..',
    '...g...',
    '...g.l.',
    '.l.gl..',
    '..lg...',
    '...g...',
  ],
  allium: [
    '..ppp..',
    '.pPpPp.',
    '.pPPPp.',
    '..ppp..',
    '...g...',
    '...g...',
    '..lg...',
    '...gl..',
    '...g...',
  ],
  blue_orchid: [
    '.c...c.',
    'cCc.cCc',
    '.c.g.c.',
    '..g.g..',
    '...g...',
    '.l.g.l.',
    '..lgl..',
    '...g...',
    '...g...',
  ],
  pink_tulip: [
    '..p.p..',
    '.pPpPp.',
    '.pPpPp.',
    '..pPp..',
    '...g...',
    '.l.g.l.',
    '.llgll.',
    '..lgl..',
    '...g...',
  ],
  red_mushroom: ['..rrr..', '.rwrrr.', 'rrrrwrr', 'RRRRRRR', '...s...', '..sss..', '..sSs..'],
  brown_mushroom: ['.......', '..bbb..', '.bBbbb.', 'bBBBBBb', '...s...', '..sss..', '..sSs..'],
};

const FLOWER_KEY: Record<string, RGB> = {
  r: [214, 40, 36],
  R: [160, 22, 26],
  k: [36, 26, 24],
  y: [250, 222, 60],
  Y: [220, 170, 30],
  b: [70, 110, 226],
  B: [42, 70, 170],
  w: [244, 244, 236],
  W: [206, 208, 204],
  p: [196, 112, 226],
  P: [150, 74, 186],
  c: [70, 174, 236],
  C: [30, 120, 196],
  s: [222, 212, 190],
  S: [184, 172, 150],
};

function flowerSprite(c: Ctx, style: PropStyle): Pix {
  const pal = plantPal(c.b);
  const key: Record<string, RGB> = { ...FLOWER_KEY, g: pal[3], l: pal[1] };
  if (style === 'pink_tulip') {
    key.p = [244, 154, 196];
    key.P = [212, 104, 156];
  }
  if (style === 'brown_mushroom') {
    key.b = [160, 120, 90];
    key.B = [118, 84, 60];
  }
  const rows = FLOWER_ROWS[style] ?? FLOWER_ROWS.poppy ?? [];
  const flip = c.shape % 2 === 1;
  const buf = pixmap(flip ? rows.map((r) => [...r].reverse().join('')) : rows, key);
  return finish({ buf, ox: 4, oy: buf.h - 2 });
}

function pinkPetals(c: Ctx): Pix {
  const buf = new PixBuffer(18, 12);
  const pink: RGB[] = [
    [255, 214, 232],
    [244, 166, 204],
    [214, 116, 164],
  ];
  const stem = plantPal(c.b)[3];
  const n = 5 + (c.shape % 3);
  for (let k = 0; k < n; k++) {
    const x = 3 + Math.floor(hash2(k, c.shape, 140) * 12);
    const y = 2 + Math.floor(hash2(k, c.shape, 141) * 7);
    // Four-petal flower lying flat, lit petals up-left, with a stem tick and a dark petal under it.
    put(buf, x + 1, y + 2, stem);
    put(buf, x - 1, y, pink[1] ?? WHITE_WARM);
    put(buf, x + 1, y, pink[2] ?? WHITE_WARM);
    put(buf, x, y - 1, pink[0] ?? WHITE_WARM);
    put(buf, x - 1, y - 1, pink[0] ?? WHITE_WARM);
    put(buf, x, y + 1, pink[2] ?? WHITE_WARM);
    put(buf, x + 1, y + 1, pink[2] ?? WHITE_WARM);
    put(buf, x, y, [252, 232, 150]);
  }
  return finish({ buf, ox: 9, oy: 8 }, [150, 70, 110]);
}

// ---------------------------------------------------------------------------------------------------
// Style table

// ---------------------------------------------------------------------------------------------------
// Structure props (village and desert temple, v1.4)

const OAK_LIGHT: Pal = ramp([200, 164, 100], [222, 188, 124], [156, 120, 68]);
const SPRUCE_DARK: Pal = ramp([112, 82, 48], [134, 100, 60], [80, 58, 34]);
const IRON: RGB = [168, 170, 180];
const IRON_D: RGB = [110, 112, 124];
const GOLD: RGB = [244, 196, 50];
const GOLD_D: RGB = [196, 146, 30];

/** Village chest: light oak with two iron straps and an iron clasp. */
function chestVillage(c: Ctx): Pix {
  const buf = new PixBuffer(16, 15);
  const pal = c.biome === 'snowy_taiga' ? SPRUCE_DARK : OAK_LIGHT;
  drawBox(buf, 1, 1, 14, 5, 8, plankMat(pal, 41), 41);
  fill(buf, 1, 8, 14, 8, [86, 58, 28]); // lid seam
  fill(buf, 1, 1, 14, 1, pal[1]);
  for (const x of [3, 12]) {
    fill(buf, x, 1, x, 13, IRON);
    put(buf, x, 6, IRON_D);
    put(buf, x, 13, IRON_D);
  }
  fill(buf, 6, 7, 9, 10, IRON); // clasp
  fill(buf, 9, 7, 9, 10, IRON_D);
  fill(buf, 7, 5, 8, 6, IRON_D);
  put(buf, 7, 9, [50, 52, 60]);
  return finish({ buf, ox: 8, oy: 13 });
}

/** Pyramid chest: lapis body, gold straps and a gold lock. */
function chestPyramid(): Pix {
  const buf = new PixBuffer(16, 15);
  const lapis: Pal = ramp([44, 76, 176], [70, 108, 214], [28, 48, 120]);
  const m: Mat = {
    pal: lapis,
    tex: (u, v, top) => (hash2(u, v, 51) < (top ? 0.18 : 0.12) ? 1 : 0),
    over: (u, v) => (hash2(u, v, 52) < 0.05 ? [150, 190, 255] : undefined),
  };
  drawBox(buf, 1, 1, 14, 5, 8, m, 51);
  fill(buf, 1, 8, 14, 8, [22, 34, 92]);
  fill(buf, 1, 1, 14, 1, [96, 132, 232]);
  for (const x of [2, 13]) {
    fill(buf, x, 1, x, 13, GOLD);
    fill(buf, x + (x < 8 ? 1 : -1), 2, x + (x < 8 ? 1 : -1), 13, GOLD_D);
  }
  fill(buf, 1, 7, 14, 7, GOLD); // gold band over the seam
  fill(buf, 6, 6, 9, 11, GOLD);
  fill(buf, 9, 6, 9, 11, GOLD_D);
  fill(buf, 7, 8, 8, 9, [60, 40, 10]);
  put(buf, 6, 6, [255, 236, 140]);
  return finish({ buf, ox: 8, oy: 13 });
}

const CROP_KEY: Record<string, RGB> = {
  g: [74, 138, 44],
  G: [108, 172, 58],
  d: [52, 100, 34],
  y: [222, 186, 72],
  Y: [246, 214, 104],
  b: [166, 126, 46],
  o: [232, 130, 30],
  O: [196, 96, 18],
  w: [238, 240, 214],
  p: [160, 30, 70],
};
const CROP_ROWS: readonly (readonly string[])[] = [
  // Wheat
  [
    '..Y..Y..Y..',
    '..y..y..y..',
    '.Yy.Yy.Yy..',
    '.yb.yb.yb..',
    '..g..g..g..',
    '.gG.gG.gG..',
    '.g..g..g...',
    '.d..d..d...',
  ],
  // Carrots
  ['..G..G..G..', '.GgG.GgG.G.', '.gdg.gdg.g.', '..o..o..o..', '..O..O..O..', '...........'],
  // Potatoes
  ['.G..G..G...', 'GgGGgGGgG..', 'gdgdgdgdg..', '.w..w..w...', '.g..g..g...'],
  // Beetroots
  ['.G.G.G.G...', 'GgGgGgGgG..', '.p.p.p.p...', '.d.d.d.d...'],
];

function crop(c: Ctx): Pix {
  const rows = CROP_ROWS[c.type % CROP_ROWS.length] ?? CROP_ROWS[0] ?? [];
  const buf = pixmap(rows, CROP_KEY, 1);
  return { buf, ox: Math.floor(buf.w / 2), oy: buf.h - 1 };
}

function well(): Pix {
  const buf = new PixBuffer(22, 30);
  const wood = plankMat(SPRUCE_DARK, 61);
  // Posts and the little roof.
  drawBox(buf, 2, 8, 3, 2, 14, wood, 61);
  drawBox(buf, 17, 8, 3, 2, 14, wood, 62);
  drawBox(buf, 1, 4, 20, 5, 3, wood, 63);
  fill(buf, 3, 3, 18, 3, SPRUCE_DARK[1]);
  // Cobble basin with water.
  drawBox(buf, 3, 16, 16, 6, 6, stoneMat(64), 64);
  fill(buf, 6, 17, 15, 20, [62, 120, 214]);
  fill(buf, 6, 17, 15, 17, [48, 92, 176]);
  fill(buf, 8, 19, 11, 19, [150, 196, 250]);
  // Rope and bucket.
  fill(buf, 10, 8, 10, 15, [198, 170, 120]);
  fill(buf, 9, 14, 12, 16, [132, 100, 60]);
  return finish({ buf, ox: 11, oy: 26 });
}

function pressurePlate(): Pix {
  const buf = new PixBuffer(16, 11);
  // A stone slab sunk a little into the floor: lit rim, darker body, an amber rune hinting at the trap.
  fill(buf, 1, 2, 14, 8, [118, 118, 124]);
  fill(buf, 2, 3, 13, 7, [150, 150, 156]);
  fill(buf, 1, 2, 14, 2, [188, 188, 194]);
  fill(buf, 1, 8, 14, 8, [80, 80, 86]);
  fill(buf, 14, 3, 14, 8, [96, 96, 102]);
  fill(buf, 6, 4, 9, 6, [226, 150, 40]);
  fill(buf, 7, 5, 8, 5, [255, 214, 120]);
  put(buf, 5, 5, [196, 120, 30]);
  put(buf, 10, 5, [196, 120, 30]);
  return finish({ buf, ox: 8, oy: 7 });
}

function workbench(): Pix {
  const buf = new PixBuffer(16, 17);
  const top: Mat = {
    pal: OAK_LIGHT,
    tex: (u, v, isTop) => (isTop ? (u % 4 === 0 || v % 4 === 0 ? 1 : 0) : v % 4 === 3 ? 1 : 0),
  };
  drawBox(buf, 1, 2, 14, 5, 8, top, 71);
  fill(buf, 1, 9, 14, 12, [92, 62, 34]); // dark front
  fill(buf, 3, 10, 5, 11, IRON); // saw
  fill(buf, 8, 10, 12, 10, [196, 160, 98]);
  fill(buf, 9, 11, 11, 11, [150, 110, 60]);
  return finish({ buf, ox: 8, oy: 13 });
}

const BOOK_COLORS: RGB[] = [
  [150, 48, 44],
  [54, 96, 160],
  [70, 130, 70],
  [196, 150, 60],
  [110, 70, 130],
];

function bookshelf(): Pix {
  const buf = new PixBuffer(16, 17);
  drawBox(buf, 1, 2, 14, 4, 9, plankMat(OAK_LIGHT, 81), 81);
  for (const row of [0, 1]) {
    const y0 = 7 + row * 4;
    fill(buf, 2, y0, 13, y0 + 2, [60, 40, 22]);
    for (let x = 2; x <= 13; x++) {
      const col = BOOK_COLORS[Math.floor(hash2(x, row, 82) * BOOK_COLORS.length)] ?? BOOK_COLORS[0];
      if (col && hash2(x, row, 83) < 0.9) fill(buf, x, y0, x, y0 + 2 - (x % 3 === 0 ? 1 : 0), col);
    }
  }
  return finish({ buf, ox: 8, oy: 13 });
}

function bed(c: Ctx): Pix {
  const buf = new PixBuffer(14, 26);
  const blankets: Pal[] = [
    ramp([196, 44, 44], [226, 72, 68], [140, 28, 32]),
    ramp([54, 90, 190], [84, 122, 224], [36, 60, 134]),
    ramp([60, 150, 70], [90, 182, 98], [40, 104, 50]),
  ];
  const wool = blankets[c.type % blankets.length] ?? OAK_LIGHT;
  drawBox(buf, 1, 1, 12, 16, 6, plankMat(OAK_LIGHT, 91), 91);
  fill(buf, 1, 1, 12, 16, [236, 232, 224]); // sheets
  fill(buf, 2, 2, 11, 6, [250, 248, 244]); // pillow
  fill(buf, 2, 6, 11, 6, [214, 210, 202]);
  fill(buf, 1, 8, 12, 16, wool[2]);
  fill(buf, 1, 8, 12, 8, wool[0]);
  fill(buf, 12, 8, 12, 16, wool[3]);
  fill(buf, 1, 17, 12, 22, [96, 66, 36]); // frame front
  fill(buf, 1, 17, 12, 17, [150, 112, 64]);
  return finish({ buf, ox: 7, oy: 23 });
}

function lantern(): Pix {
  const buf = new PixBuffer(9, 22);
  fill(buf, 3, 4, 4, 19, [92, 64, 36]); // post
  fill(buf, 3, 4, 3, 19, [118, 84, 48]);
  fill(buf, 3, 2, 8, 2, [92, 64, 36]); // arm
  fill(buf, 6, 3, 6, 4, IRON_D);
  fill(buf, 5, 5, 7, 8, [255, 206, 90]); // lantern
  fill(buf, 6, 6, 6, 7, [255, 246, 190]);
  fill(buf, 5, 5, 7, 5, IRON_D);
  fill(buf, 5, 9, 7, 9, IRON_D);
  return finish({ buf, ox: 4, oy: 19 });
}

function hayBale(): Pix {
  const buf = new PixBuffer(16, 16);
  const straw: Mat = {
    pal: ramp([214, 178, 66], [238, 204, 94], [168, 130, 38]),
    tex: (u, v, top) =>
      top ? (hash2(u, v, 95) < 0.3 ? 1 : 0) : hash2(u >> 1, v, 96) < 0.3 ? 1 : 0,
    over: (_u, v, top) => (!top && (v % 7 === 0 || v % 7 === 1) ? [158, 52, 40] : undefined),
  };
  drawBox(buf, 1, 1, 14, 6, 7, straw, 94);
  return finish({ buf, ox: 8, oy: 12 });
}

type Painter = (c: Ctx, style: PropStyle) => Pix;

const flowerPainter: Painter = (c, style) => flowerSprite(c, style);

const PAINTERS: Record<PropStyle, Painter> = {
  oak: (c) => oakLike(c, false),
  birch: (c) => oakLike(c, true),
  dark_oak: darkOak,
  spruce,
  cherry_tree: cherryTree,
  jungle_tree: jungleTree,
  jungle_bush: jungleBush,
  swamp_oak: swampOak,
  huge_mushroom: hugeMushroom,
  boulder,
  mossy_boulder: mossyBoulder,
  sandstone_rock: sandstoneRock,
  snowy_rock: snowyRock,
  terracotta_rock: terracottaRock,
  basalt,
  tall_grass: tallGrass,
  fern: (c) => fern(c, false),
  large_fern: (c) => fern(c, true),
  sweet_berry_bush: sweetBerryBush,
  dead_bush: deadBush,
  dry_grass: dryGrass,
  sugar_cane: sugarCane,
  poppy: flowerPainter,
  dandelion: flowerPainter,
  cornflower: flowerPainter,
  oxeye_daisy: flowerPainter,
  allium: flowerPainter,
  blue_orchid: flowerPainter,
  pink_tulip: flowerPainter,
  red_mushroom: flowerPainter,
  brown_mushroom: flowerPainter,
  pink_petals: pinkPetals,
  ore,
  chest,
  locked_chest: chest,
  cactus,
  melon,
  pumpkin: melon,
  beacon,
  campfire,
  anvil,
  enchant_table: enchantTable,
  tnt_trap: tnt,
  cobweb,
  magma,
  bamboo,
  chest_village: chestVillage,
  chest_pyramid: chestPyramid,
  crop,
  well,
  pressure_plate: pressurePlate,
  workbench,
  bookshelf,
  bed,
  lantern,
  hay_bale: hayBale,
  // Jungle temple, trial chamber, pillager outpost, witch hut (world/structureSprites.ts).
  ...STRUCTURE2_PAINTERS,
};

/** Every style the painters handle (tests check propStyleFor never leaves this set). */
export const PROP_STYLES = Object.keys(PAINTERS) as PropStyle[];

/** Build counters: `fallbacks` counts styles without a painter (should stay 0). */
export const propSpriteStats = { built: 0, fallbacks: 0 };

/** Paint a prop without touching the DOM (no cache). */
export function propPixels(kind: PropKind, biome: BiomeId, variant: number): PropPixels {
  const style = propStyleFor(biome, kind, variant);
  let painter: Painter | undefined = PAINTERS[style];
  if (!painter) {
    propSpriteStats.fallbacks++;
    painter = boulder;
  }
  const ctx: Ctx = {
    biome,
    b: BIOMES[biome],
    kind,
    type: variant % 8,
    shape: Math.floor(variant / 8),
  };
  const img = painter(ctx, style);
  propSpriteStats.built++;
  return { buf: img.buf, ox: img.ox, oy: img.oy, style };
}

const cache = new Map<string, Sprite>();

export function propSprite(kind: PropKind, biome: BiomeId, variant: number): Sprite {
  const key = `${kind}/${biome}/${variant}`;
  let s = cache.get(key);
  if (!s) {
    const p = propPixels(kind, biome, variant);
    s = { canvas: p.buf.toCanvas(), ox: p.ox, oy: p.oy };
    cache.set(key, s);
  }
  return s;
}

/**
 * Gallery pages of [kind, variant] samples (variant = type + 8 * shape), for the debug gallery: trees,
 * rocks and ores, ground plants, crafted blocks.
 */
export const PROP_GALLERY: [PropKind, number][][] = [
  [
    ['tree', 0],
    ['tree', 8],
    ['tree', 1],
    ['tree', 2],
    ['tree', 10],
    ['tree', 3],
    ['tree', 19],
    ['cactus', 0],
    ['cactus', 17],
  ],
  [
    ['boulder', 0],
    ['boulder', 8],
    ['boulder', 16],
    ['boulder', 24],
    ['ore', 0],
    ['ore', 1],
    ['ore', 2],
    ['ore', 3],
    ['ore', 4],
    ['ore', 5],
    ['bamboo', 0],
  ],
  [
    ['tallgrass', 0],
    ['tallgrass', 8],
    ['tallgrass', 16],
    ['tallgrass', 24],
    ['flower', 0],
    ['flower', 1],
    ['flower', 2],
    ['flower', 3],
    ['melon', 0],
    ['pumpkin', 0],
    ['cobweb', 0],
    ['magma', 0],
  ],
  [
    ['chest', 0],
    ['locked_chest', 0],
    ['beacon', 0],
    ['campfire', 0],
    ['anvil', 0],
    ['enchant_table', 0],
    ['tnt_trap', 0],
  ],
  [
    ['chest_village', 0],
    ['chest_pyramid', 0],
    ['crop', 0],
    ['crop', 1],
    ['crop', 2],
    ['crop', 3],
    ['well', 0],
    ['pressure_plate', 0],
    ['workbench', 0],
    ['bookshelf', 0],
    ['bed', 0],
    ['bed', 1],
    ['lantern', 0],
    ['hay_bale', 0],
  ],
  STRUCTURE2_GALLERY.slice(0, 11),
  STRUCTURE2_GALLERY.slice(11),
];

let shadow: HTMLCanvasElement | null = null;

/** Soft elliptical ground shadow, drawn centred on an entity's feet. */
export function shadowSprite(): HTMLCanvasElement {
  if (!shadow) {
    shadow = document.createElement('canvas');
    shadow.width = 24;
    shadow.height = 8;
    const ctx = shadow.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(12, 4, 11, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return shadow;
}
