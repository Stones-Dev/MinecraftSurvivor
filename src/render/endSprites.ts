/**
 * Procedural art of the End (PROVISIONAL: there is no dragon, crystal or End art in the source sheets, so all of
 * it is drawn by code in the same blocky 3/4 look as world/propSprites.ts, no third-party pixels involved).
 *
 * Every sprite is a pure function that returns a `PixBuffer` (node-safe, testable), plus a cached
 * `HTMLCanvasElement` getter for the renderer. Contents: the starfield tiles behind the island, the obsidian
 * pillar, the End crystal (8 spin frames) and its iron cage, the Ender Dragon (flap frames, dive, perched
 * and open-mouth poses), the Dragon Egg and the End portal frame block.
 */
import { hash2 } from '../core/noise';
import { mix, pack, PixBuffer, shade, type RGB } from '../core/pixelart';
import { endTexture } from '../world/endTiles';

// ---------------------------------------------------------------------------------------------------
// Primitives

type Pal = readonly [RGB, RGB, RGB, RGB, RGB];

/** Five-tone ramp (lightest first) around `c`. */
function ramp(c: RGB, lit = 1.5, dark = 0.6): Pal {
  return [shade(c, lit * 1.25), shade(c, lit), c, shade(c, dark), shade(c, dark * 0.62)];
}

function put(buf: PixBuffer, x: number, y: number, c: RGB): void {
  buf.set(Math.round(x), Math.round(y), pack(c));
}

function rect(buf: PixBuffer, x: number, y: number, w: number, h: number, c: RGB): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(buf, x + i, y + j, c);
}

/** A free-standing voxel box: lit top face (`t` px deep), front face, darker right edge and bottom. */
function vbox(
  buf: PixBuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  pal: Pal,
  seed: number,
): void {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const top = j < t;
      let tone = top ? 1 : 2;
      const n = hash2(x + i, y + j, seed);
      if (n > 0.9) tone -= 1;
      else if (n < 0.1) tone += 1;
      if (i === 0 || (top && j === 0)) tone -= 1;
      if (!top && (i === w - 1 || j === h - 1)) tone += 1;
      if (top && i === w - 1) tone += 1;
      put(buf, x + i, y + j, pal[Math.max(0, Math.min(4, tone))] ?? pal[2]);
    }
  }
}

/** Scanline polygon fill; `colour(x, y)` picks each pixel. */
function fillPoly(
  buf: PixBuffer,
  pts: readonly (readonly [number, number])[],
  colour: (x: number, y: number) => RGB | null,
): void {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (!a || !b) continue;
      const ya = a[1];
      const yb = b[1];
      const sy = y + 0.5;
      if ((ya <= sy && yb > sy) || (yb <= sy && ya > sy)) {
        xs.push(a[0] + ((sy - ya) / (yb - ya)) * (b[0] - a[0]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = xs[k] ?? 0;
      const xb = xs[k + 1] ?? 0;
      for (let x = Math.round(xa); x < Math.round(xb); x++) {
        const c = colour(x, y);
        if (c) put(buf, x, y, c);
      }
    }
  }
}

function line(
  buf: PixBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: RGB,
  thick = 1,
): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = y0 + ((y1 - y0) * i) / n;
    for (let j = 0; j < thick; j++) for (let k = 0; k < thick; k++) put(buf, x + k, y + j, c);
  }
}

/** Rim light on the top-left silhouette, shadow on the bottom-right (before the outline pass). */
function relight(buf: PixBuffer): void {
  const src = buf.data.slice();
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= buf.w || y >= buf.h ? 0 : (src[y * buf.w + x] ?? 0);
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const c = at(x, y);
      if (c === 0) continue;
      const lit = at(x, y - 1) === 0 || at(x - 1, y) === 0;
      const dark = at(x, y + 1) === 0 || at(x + 1, y) === 0;
      if (!lit && !dark) continue;
      const f = lit && !dark ? 1.32 : dark && !lit ? 0.68 : 1;
      const r = Math.min(255, Math.round((c & 255) * f));
      const g = Math.min(255, Math.round(((c >>> 8) & 255) * f));
      const b = Math.min(255, Math.round(((c >>> 16) & 255) * f));
      buf.data[y * buf.w + x] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Starfield (outside the island)

export const STAR_TILE = 192;

/** One tileable layer of stars (layer 0 = far and dim, 2 = near and bright). Transparent where there is none. */
export function starfieldPixels(layer: number): PixBuffer {
  const buf = new PixBuffer(STAR_TILE, STAR_TILE);
  const density = [0.011, 0.007, 0.0045][layer] ?? 0.007;
  for (let y = 0; y < STAR_TILE; y++) {
    for (let x = 0; x < STAR_TILE; x++) {
      const h = hash2(x, y, 7100 + layer * 31);
      if (h >= density) continue;
      const k = h / density;
      const tint: RGB = k < 0.5 ? [200, 190, 255] : k < 0.8 ? [150, 210, 230] : [236, 160, 255];
      const f = [0.45, 0.7, 1][layer] ?? 0.7;
      put(buf, x, y, shade(tint, f));
      if (layer === 2 && k > 0.93) {
        // A few brighter four-pointed stars on the near layer.
        put(buf, x + 1, y, shade(tint, 0.6));
        put(buf, x - 1, y, shade(tint, 0.6));
        put(buf, x, y + 1, shade(tint, 0.6));
        put(buf, x, y - 1, shade(tint, 0.6));
      }
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------------------------------
// Obsidian pillar

export const PILLAR_W = 26;
export const PILLAR_H = 66;

/** Obsidian tower with violet veins, a lit top and a bedrock cap the crystal sits on. Feet at the bottom centre. */
export function pillarPixels(variant = 0): PixBuffer {
  const buf = new PixBuffer(PILLAR_W + 4, PILLAR_H + 4);
  const tex = endTexture('obsidian', variant);
  const top = 9;
  const x0 = 2;
  const y0 = 2;
  for (let j = 0; j < PILLAR_H; j++) {
    for (let i = 0; i < PILLAR_W; i++) {
      const isTop = j < top;
      const t = tex[((isTop ? j + 4 : j) & 15) * 16 + ((i + (isTop ? 3 : 0)) & 15)] ?? 0;
      let r = t & 255;
      let g = (t >>> 8) & 255;
      let b = (t >>> 16) & 255;
      let f = isTop ? 1.7 : 1;
      // Left rim lit, right side and base in shadow, vertical banding every 16 rows like stacked blocks.
      if (i === 0) f *= 1.5;
      if (!isTop && i >= PILLAR_W - 4) f *= 0.62 + 0.1 * (PILLAR_W - 1 - i);
      if (!isTop && (j - top) % 16 === 15) f *= 0.6;
      if (!isTop && j >= PILLAR_H - 3) f *= 0.6;
      r = Math.min(255, Math.round(r * f));
      g = Math.min(255, Math.round(g * f));
      b = Math.min(255, Math.round(b * f));
      put(buf, x0 + i, y0 + j, [r, g, b]);
    }
  }
  // Bedrock cap under the crystal.
  rect(buf, x0 + 4, y0 + 1, PILLAR_W - 8, 5, [54, 54, 60]);
  rect(buf, x0 + 5, y0 + 2, PILLAR_W - 10, 3, [88, 88, 96]);
  buf.outline([6, 2, 12]);
  return buf;
}

// ---------------------------------------------------------------------------------------------------
// End crystal and cage

export const CRYSTAL_FRAMES = 8;
export const CRYSTAL_W = 20;
export const CRYSTAL_H = 28;

/** Spinning octahedron in a glass cube; frame k of CRYSTAL_FRAMES (the facet width swings with the angle). */
export function crystalPixels(frame: number): PixBuffer {
  const buf = new PixBuffer(CRYSTAL_W, CRYSTAL_H);
  const cx = CRYSTAL_W / 2;
  const phi = (frame / CRYSTAL_FRAMES) * Math.PI * 2;
  const hw = 3 + 6 * Math.abs(Math.cos(phi));
  const cy = 13;
  const face = Math.sin(phi) > 0;
  // Outer glass cube (translucent look: thin rim only).
  const glass: RGB = [196, 120, 255];
  for (let i = 0; i < 14; i++) {
    put(buf, cx - 7 + i, cy - 9, glass);
    put(buf, cx - 7 + i, cy + 9, glass);
  }
  for (let j = 0; j < 19; j++) {
    put(buf, cx - 7, cy - 9 + j, glass);
    put(buf, cx + 6, cy - 9 + j, glass);
  }
  // The octahedron: top and bottom halves, left facet lit, right facet dark; the spin swaps them.
  const topPts: [number, number][] = [
    [cx, cy - 8],
    [cx + hw, cy],
    [cx - hw, cy],
  ];
  const botPts: [number, number][] = [
    [cx - hw, cy],
    [cx + hw, cy],
    [cx, cy + 8],
  ];
  const lit: RGB = face ? [255, 120, 214] : [200, 70, 190];
  const dim: RGB = face ? [160, 40, 160] : [226, 100, 210];
  fillPoly(buf, topPts, (x) => (x < cx ? lit : dim));
  fillPoly(buf, botPts, (x) => (x < cx ? shade(lit, 0.8) : shade(dim, 0.7)));
  // Bright core.
  rect(buf, cx - 1, cy - 2, 2, 4, [255, 232, 250]);
  put(buf, cx, cy - 4, [255, 255, 255]);
  // Bedrock base plate.
  rect(buf, cx - 7, CRYSTAL_H - 5, 14, 5, [44, 44, 50]);
  rect(buf, cx - 6, CRYSTAL_H - 5, 12, 2, [92, 92, 100]);
  buf.outline([10, 4, 18]);
  return buf;
}

/** Iron bars around a crystal (drawn over it while the cage stands). */
export function cagePixels(): PixBuffer {
  const buf = new PixBuffer(CRYSTAL_W + 8, CRYSTAL_H + 4);
  const iron: Pal = ramp([150, 152, 160], 1.2, 0.55);
  const x0 = 1;
  const y0 = 2;
  const w = CRYSTAL_W + 6;
  const h = CRYSTAL_H;
  for (const y of [0, h - 1]) rect(buf, x0, y0 + y, w, 2, iron[2]);
  for (let i = 0; i < 6; i++) {
    const x = x0 + Math.round((i * (w - 2)) / 5);
    rect(buf, x, y0, 2, h, iron[i === 0 ? 0 : 2]);
    rect(buf, x + 1, y0, 1, h, iron[3]);
  }
  rect(buf, x0, y0 + Math.floor(h / 2), w, 1, iron[3]);
  buf.outline([14, 14, 18]);
  return buf;
}

// ---------------------------------------------------------------------------------------------------
// Ender Dragon

export const DRAGON_W = 208;
export const DRAGON_H = 156;
/** Body centre inside the dragon sprite. */
export const DRAGON_CX = 100;
export const DRAGON_CY = 76;

export interface DragonPose {
  /** Wing spread 0 (raised, foreshortened) .. 1 (fully spread, downstroke). */
  flap: number;
  mode: 'fly' | 'dive' | 'perch';
  mouth: boolean;
  /** -1..1 sideways curl of the tail. */
  tail: number;
}

const SKIN = ramp([44, 28, 66], 1.75, 0.6);
const BELLY = ramp([66, 44, 92], 1.5, 0.6);
const BONE: RGB = [118, 82, 158];
const BONE_LIT: RGB = [170, 130, 214];
const MEMBRANE: RGB = [40, 24, 60];
const EYE: RGB = [255, 70, 232];

function wing(
  buf: PixBuffer,
  sx: number,
  sy: number,
  dirY: 1 | -1,
  pose: DragonPose,
  near: boolean,
): void {
  const perch = pose.mode === 'perch';
  const dive = pose.mode === 'dive';
  const span = (perch ? 0.38 : 0.5 + 0.5 * pose.flap) * 62 * (near ? 1.08 : 1);
  // Finger angles (degrees from straight up/down), leading edge first; a dive sweeps the wings back.
  const sweep = perch ? 70 : dive ? 46 : 0;
  const angles = [14, 40, 64, 88].map((a) => a + sweep);
  const lens = [1, 0.95, 0.8, 0.6];
  const tips: [number, number][] = angles.map((a, i) => {
    // Angle from straight out (up for the far wing, down for the near one); the leading finger leans forward.
    const r = ((a - 22) * Math.PI) / 180;
    const L = span * (lens[i] ?? 1);
    return [sx - Math.sin(r) * L, sy + dirY * Math.cos(r) * L];
  });
  const first = tips[0] ?? [sx, sy];
  const poly: [number, number][] = [[sx, sy], ...tips, [sx - 24, sy + dirY * 4]];
  const base = near ? shade(MEMBRANE, 1.25) : MEMBRANE;
  fillPoly(buf, poly, (x, y) => {
    const n = hash2(x, y, near ? 811 : 733);
    const d = Math.hypot(x - sx, y - sy) / Math.max(1, span);
    if (n < 0.025 && d > 0.55) return null; // torn holes at the rim
    let f = 1 + (n - 0.5) * 0.25 - d * 0.18;
    if (((x + y) >> 2) % 5 === 0) f *= 0.88; // faint stitching in the membrane
    return shade(base, f);
  });
  // Bones: a thick arm to the first knuckle, thinner fingers to the tips.
  const knuckle: [number, number] = [sx + (first[0] - sx) * 0.5, sy + (first[1] - sy) * 0.5];
  line(buf, sx, sy, knuckle[0], knuckle[1], BONE_LIT, 2);
  for (const t of tips) {
    line(buf, knuckle[0], knuckle[1], t[0], t[1], BONE, 1);
    put(buf, t[0], t[1], [226, 214, 240]);
    put(buf, t[0] - 1, t[1] + dirY, [226, 214, 240]);
  }
  rect(buf, Math.round(knuckle[0]) - 1, Math.round(knuckle[1]) - 1, 3, 3, BONE_LIT);
}

/** The dragon, facing right. */
export function dragonPixels(pose: DragonPose): PixBuffer {
  const buf = new PixBuffer(DRAGON_W, DRAGON_H);
  const cx = DRAGON_CX;
  const cy = DRAGON_CY;
  // Far wing, behind everything.
  wing(buf, cx - 6, cy - 10, -1, pose, false);
  // Tail: segments shrinking toward a spike, curling with pose.tail.
  const segs = 7;
  for (let i = segs - 1; i >= 0; i--) {
    const t = i / (segs - 1);
    const w = 20 - i * 2.3;
    const h = 15 - i * 1.7;
    const x = cx - 26 - i * 12;
    const y = cy + 4 + Math.sin(t * Math.PI) * pose.tail * 12 + i * 1.6 - h / 2;
    vbox(buf, Math.round(x - w / 2), Math.round(y), Math.round(w), Math.round(h), 4, SKIN, 100 + i);
    // A spine spike on every other segment.
    if (i % 2 === 0)
      fillPoly(
        buf,
        [
          [x - 2, y + 1],
          [x + 2, y + 1],
          [x, y - 5],
        ],
        () => BONE,
      );
  }
  const tipX = cx - 26 - (segs - 1) * 12 - 7;
  const tipY = cy + 4 + 0 + (segs - 1) * 1.6;
  fillPoly(
    buf,
    [
      [tipX + 4, tipY - 4],
      [tipX + 4, tipY + 4],
      [tipX - 8, tipY],
    ],
    (_x, y) => (y < tipY ? BONE_LIT : BONE),
  );
  // Legs (folded under the body; longer when perched).
  const legH = pose.mode === 'perch' ? 12 : 6;
  vbox(buf, cx - 12, cy + 12, 9, legH, 2, SKIN, 211);
  vbox(buf, cx + 6, cy + 12, 9, legH, 2, SKIN, 212);
  // Body: a lit back box over a lighter belly box.
  vbox(buf, cx - 26, cy - 14, 52, 30, 10, SKIN, 300);
  rect(buf, cx - 24, cy + 8, 48, 6, BELLY[2]);
  rect(buf, cx - 24, cy + 8, 48, 1, BELLY[1]);
  // Back spikes.
  for (let i = 0; i < 6; i++) {
    const x = cx - 22 + i * 8;
    fillPoly(
      buf,
      [
        [x, cy - 14],
        [x + 5, cy - 14],
        [x + 2, cy - 21 + (i % 2)],
      ],
      (px) => (px < x + 2 ? BONE_LIT : BONE),
    );
  }
  // Neck: three boxes rising toward the head.
  const nx = cx + 22;
  const ny = cy - 6;
  const rise = pose.mode === 'dive' ? 3 : 0;
  vbox(buf, nx, ny - 2 + rise, 18, 16, 5, SKIN, 401);
  vbox(buf, nx + 11, ny - 11 + rise, 16, 15, 5, SKIN, 402);
  vbox(buf, nx + 21, ny - 19 + rise, 15, 14, 5, SKIN, 403);
  // Head: skull, snout and jaw.
  const hx = cx + 52;
  const hy = cy - 36 + rise;
  vbox(buf, hx, hy, 26, 16, 6, SKIN, 501);
  vbox(buf, hx + 22, hy + 4, 18, 10, 4, SKIN, 502);
  const jawDrop = pose.mouth ? 8 : 1;
  vbox(buf, hx + 4, hy + 15 + jawDrop - 1, 34, 5, 2, BELLY, 503);
  if (pose.mouth) {
    rect(buf, hx + 20, hy + 14, 20, jawDrop + 1, [120, 20, 90]);
    rect(buf, hx + 22, hy + 14, 2, 3, [240, 230, 250]);
    rect(buf, hx + 30, hy + 14, 2, 3, [240, 230, 250]);
    rect(buf, hx + 36, hy + 14, 2, 3, [240, 230, 250]);
  }
  // Horns and brow ridge.
  fillPoly(
    buf,
    [
      [hx + 2, hy + 1],
      [hx + 8, hy + 1],
      [hx - 4, hy - 11],
    ],
    (x) => (x < hx + 3 ? BONE_LIT : BONE),
  );
  fillPoly(
    buf,
    [
      [hx + 9, hy + 1],
      [hx + 14, hy + 1],
      [hx + 4, hy - 9],
    ],
    (x) => (x < hx + 8 ? BONE_LIT : BONE),
  );
  // Nostrils and the eye.
  put(buf, hx + 37, hy + 6, [8, 4, 14]);
  put(buf, hx + 37, hy + 8, [8, 4, 14]);
  // Near wing in front of the body.
  wing(buf, cx - 2, cy + 10, 1, pose, true);
  relight(buf);
  buf.outline([8, 3, 16]);
  // Glowing eye last so the lighting passes do not dull it.
  rect(buf, hx + 17, hy + 5, 5, 3, EYE);
  rect(buf, hx + 18, hy + 5, 2, 1, [255, 220, 250]);
  put(buf, hx + 16, hy + 6, shade(EYE, 0.6));
  return buf;
}

// ---------------------------------------------------------------------------------------------------
// Dragon Egg, End portal frame

const EGG_TONES: readonly RGB[] = [
  [58, 34, 94],
  [30, 16, 52],
  [16, 8, 30],
  [8, 4, 16],
  [4, 2, 10],
];

export const EGG_W = 22;
export const EGG_H = 30;

/** Black ovoid with violet speckles. Feet at the bottom centre. */
export function eggPixels(): PixBuffer {
  const buf = new PixBuffer(EGG_W, EGG_H);
  const cx = EGG_W / 2;
  const cy = 16;
  for (let y = 0; y < EGG_H; y++) {
    for (let x = 0; x < EGG_W; x++) {
      const dy = (y - cy) / 14;
      // Wider at the bottom, narrower at the top: an egg.
      const rx = (dy < 0 ? 8 - 3 * -dy : 8) * Math.sqrt(Math.max(0, 1 - dy * dy)) + 0.6;
      const dx = x + 0.5 - cx;
      if (Math.abs(dx) >= rx || Math.abs(dy) >= 1) continue;
      let tone = 2;
      if (dx < -rx * 0.35 && dy < 0.3) tone = 1;
      if (dx > rx * 0.3 || dy > 0.7) tone = 3;
      const n = hash2(x, y, 9100);
      const base: RGB = EGG_TONES[tone] ?? EGG_TONES[2] ?? [16, 8, 30];
      put(buf, x, y, n > 0.9 ? [196, 120, 255] : n > 0.84 ? [110, 60, 168] : base);
    }
  }
  put(buf, 7, 9, [255, 240, 255]);
  put(buf, 8, 8, [226, 190, 255]);
  buf.outline([4, 0, 10]);
  return buf;
}

export const FRAME_BLOCK = 12;

/** Top face of an end-stone-brick frame block, with an eye of ender (green) on top when `eye` is set. */
export function portalFramePixels(eye: boolean): PixBuffer {
  const s = FRAME_BLOCK;
  const buf = new PixBuffer(s, s + 3);
  const tex = endTexture('end_stone', 2);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const t = tex[(y + 2) * 16 + x + 2] ?? 0;
      let r = t & 255;
      let g = (t >>> 8) & 255;
      let b = (t >>> 16) & 255;
      // Brick mortar: two courses with offset joints.
      const row = y < 6 ? 0 : 1;
      const jx = (x + (row === 0 ? 0 : 6)) % 12;
      if (y === 5 || y === s - 1 || jx === 0) {
        r *= 0.66;
        g *= 0.66;
        b *= 0.6;
      }
      put(buf, x, y, [Math.round(r), Math.round(g), Math.round(b)]);
    }
  }
  // Front lip (3/4 view): the block is three px tall.
  rect(buf, 0, s, s, 3, [104, 100, 70]);
  rect(buf, 0, s + 2, s, 1, [72, 70, 48]);
  if (eye) {
    rect(buf, 2, 3, 8, 6, [30, 52, 40]);
    rect(buf, 3, 4, 6, 4, [18, 108, 74]);
    rect(buf, 4, 5, 4, 2, [60, 224, 150]);
    put(buf, 5, 5, [220, 255, 240]);
    put(buf, 6, 6, [10, 40, 30]);
  }
  buf.outline([34, 30, 20]);
  return buf;
}

// ---------------------------------------------------------------------------------------------------
// Canvas caches (browser only)

const canvasCache = new Map<string, HTMLCanvasElement>();

function cached(key: string, make: () => PixBuffer): HTMLCanvasElement {
  let c = canvasCache.get(key);
  if (!c) {
    c = make().toCanvas();
    canvasCache.set(key, c);
  }
  return c;
}

export function starfieldCanvas(layer: number): HTMLCanvasElement {
  return cached(`star:${layer}`, () => starfieldPixels(layer));
}
export function pillarCanvas(variant = 0): HTMLCanvasElement {
  return cached(`pillar:${variant}`, () => pillarPixels(variant));
}
export function crystalCanvas(frame: number): HTMLCanvasElement {
  const k = ((frame % CRYSTAL_FRAMES) + CRYSTAL_FRAMES) % CRYSTAL_FRAMES;
  return cached(`crystal:${k}`, () => crystalPixels(k));
}
export function cageCanvas(): HTMLCanvasElement {
  return cached('cage', cagePixels);
}
export function eggCanvas(): HTMLCanvasElement {
  return cached('egg', eggPixels);
}
export function frameBlockCanvas(eye: boolean): HTMLCanvasElement {
  return cached(`frame:${eye}`, () => portalFramePixels(eye));
}

/** Flap frames in the animation cycle (the pose of frame k is `flapOf(k)`). */
export const FLAP_FRAMES = 6;
export function flapOf(frame: number): number {
  return 0.5 + 0.5 * Math.cos((frame / FLAP_FRAMES) * Math.PI * 2);
}

export function dragonCanvas(pose: DragonPose): HTMLCanvasElement {
  const flap = Math.round(pose.flap * (FLAP_FRAMES - 1)) / (FLAP_FRAMES - 1);
  const tail = Math.round(pose.tail * 2) / 2;
  const key = `dragon:${pose.mode}:${flap.toFixed(2)}:${pose.mouth ? 1 : 0}:${tail}`;
  return cached(key, () => dragonPixels({ ...pose, flap, tail }));
}

/** Mix helper re-exported for the draw code (a colour halfway between two). */
export const blend = mix;
