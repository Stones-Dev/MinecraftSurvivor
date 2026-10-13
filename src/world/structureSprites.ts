/**
 * Prop sprites of the structures, part 2 (jungle temple, trial chamber, pillager outpost, witch hut, the
 * village's legendary chest). Hand-authored pixel art in the same 3/4 look as propSprites.ts: a lit top face,
 * a front face, light from the top-left, a dark 1 px outline. They have no biome variants; `type` is the prop's
 * `variant % 8` (lever colour, mark order, caged pet...).
 *
 * propSprites.ts spreads `STRUCTURE2_PAINTERS` into its painter table, so a new kind only needs a
 * painter here plus its entry in world/props.ts.
 */
import { hash2 } from '../core/noise';
import { PixBuffer, type RGB, pack } from '../core/pixelart';
import type { BiomeId } from './biomes';
import type { PropKind } from './props';

interface Pix {
  buf: PixBuffer;
  ox: number;
  oy: number;
}

type Painter = (c: { type: number; biome: BiomeId }) => Pix;

const OUTLINE: RGB = [24, 28, 20];

function put(buf: PixBuffer, x: number, y: number, c: RGB): void {
  buf.set(x, y, pack(c));
}

function fill(buf: PixBuffer, x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const p = pack(c);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) buf.set(x, y, p);
}

/** Pixel rows at (x0, y0): '.' and ' ' are transparent, other characters are looked up in `key`. */
function rows(
  buf: PixBuffer,
  x0: number,
  y0: number,
  lines: readonly string[],
  key: Readonly<Record<string, RGB>>,
): void {
  lines.forEach((line, j) => {
    for (let i = 0; i < line.length; i++) {
      const c = key[line.charAt(i)];
      if (c) put(buf, x0 + i, y0 + j, c);
    }
  });
}

function done(buf: PixBuffer, ox: number, oy: number): Pix {
  buf.outline(OUTLINE);
  return { buf, ox, oy };
}

/** A box: lit top face of depth `t`, front face of height `f`, lit left column, dark right column and bottom row. */
function box(
  buf: PixBuffer,
  x: number,
  y: number,
  w: number,
  t: number,
  f: number,
  top: RGB,
  front: RGB,
  dark: RGB,
  light: RGB,
): void {
  fill(buf, x, y, x + w - 1, y + t - 1, top);
  fill(buf, x, y + t, x + w - 1, y + t + f - 1, front);
  fill(buf, x, y, x + w - 1, y, light);
  fill(buf, x, y + t, x, y + t + f - 1, light);
  fill(buf, x + w - 1, y + t, x + w - 1, y + t + f - 1, dark);
  fill(buf, x, y + t + f - 1, x + w - 1, y + t + f - 1, dark);
}

// ---------------------------------------------------------------------------------------------------
// Palettes

const MOSS: RGB = [70, 118, 46];
const MOSS_L: RGB = [98, 150, 62];
const MOSS_D: RGB = [44, 82, 34];
const STONE_L: RGB = [150, 154, 142];
const STONE: RGB = [122, 126, 116];
const STONE_D: RGB = [82, 86, 78];
const WOOD: RGB = [150, 112, 64];
const WOOD_L: RGB = [182, 142, 84];
const WOOD_D: RGB = [98, 70, 38];
const DARK_WOOD: RGB = [78, 56, 30];
const COPPER: RGB = [198, 112, 80];
const COPPER_L: RGB = [230, 154, 112];
const COPPER_D: RGB = [128, 68, 48];
const TEAL: RGB = [82, 166, 138];
const TEAL_L: RGB = [140, 214, 180];
const TEAL_D: RGB = [48, 108, 92];
const GOLD: RGB = [244, 196, 50];
const GOLD_D: RGB = [196, 146, 30];
const IRON: RGB = [168, 170, 180];
const IRON_D: RGB = [96, 98, 110];

/** Lever and mark colours (index = prop type): red, blue, yellow. */
export const MARK_COLORS: readonly RGB[] = [
  [226, 64, 56],
  [64, 118, 232],
  [248, 210, 60],
];
/** Orders of the three marks, indexed by the mark prop's type (0..5). */
export const MARK_ORDERS: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

// ---------------------------------------------------------------------------------------------------
// Jungle temple

function chestJungle(): Pix {
  const buf = new PixBuffer(16, 15);
  box(buf, 1, 1, 14, 5, 8, [120, 92, 54], [96, 70, 40], [58, 40, 22], [146, 116, 70]);
  fill(buf, 1, 8, 14, 8, [48, 32, 18]); // lid seam
  for (const x of [3, 12]) fill(buf, x, 1, x, 13, [68, 74, 52]); // mossy straps
  fill(buf, 6, 7, 9, 10, GOLD);
  fill(buf, 9, 7, 9, 10, GOLD_D);
  put(buf, 7, 9, [60, 40, 10]);
  // Moss creeping over the lid and the front.
  for (let i = 0; i < 26; i++) {
    const x = 1 + Math.floor(hash2(i, 1, 501) * 14);
    const y = 1 + Math.floor(hash2(i, 2, 501) * 12);
    put(buf, x, y, hash2(i, 3, 501) < 0.5 ? MOSS : MOSS_L);
  }
  // A vine hanging off the front.
  fill(buf, 2, 9, 2, 12, MOSS_D);
  put(buf, 3, 11, MOSS_L);
  return done(buf, 8, 13);
}

/** Dispenser: a stone block with a dark muzzle on the side that faces the corridor. type 0 shoots east, 1 west. */
function dispenser(c: { type: number }): Pix {
  const buf = new PixBuffer(16, 17);
  box(buf, 2, 3, 12, 4, 9, STONE_L, STONE, STONE_D, [168, 172, 160]);
  // Cobble speckle.
  for (let i = 0; i < 18; i++) {
    const x = 3 + Math.floor(hash2(i, 5, 502) * 9);
    const y = 8 + Math.floor(hash2(i, 6, 502) * 7);
    put(buf, x, y, hash2(i, 7, 502) < 0.5 ? STONE_D : STONE_L);
  }
  const east = c.type === 0;
  const mx = east ? 9 : 3; // muzzle column
  fill(buf, mx, 8, mx + 3, 11, [26, 28, 30]);
  fill(buf, mx, 8, mx + 3, 8, [48, 50, 54]);
  // Arrow tip peeking out of the muzzle.
  fill(buf, east ? mx + 2 : mx, 9, east ? mx + 3 : mx + 1, 10, [210, 200, 170]);
  // Tripwire hook and string stub.
  put(buf, east ? 13 : 2, 9, IRON);
  fill(buf, east ? 13 : 0, 10, east ? 15 : 2, 10, [226, 226, 214]);
  // Moss on the top.
  put(buf, 4, 3, MOSS);
  put(buf, 5, 4, MOSS_L);
  put(buf, 10, 3, MOSS);
  return done(buf, 8, 14);
}

function lever(c: { type: number }, on = false): Pix {
  const buf = new PixBuffer(14, 20);
  const col = MARK_COLORS[c.type % 3] ?? MARK_COLORS[0] ?? [200, 40, 40];
  const colD: RGB = [col[0] * 0.65, col[1] * 0.65, col[2] * 0.65];
  // Mossy pedestal.
  box(buf, 2, 11, 10, 3, 5, STONE_L, STONE, STONE_D, [168, 172, 160]);
  put(buf, 4, 12, MOSS);
  put(buf, 5, 13, MOSS_L);
  put(buf, 9, 12, MOSS);
  // The lever: handle slanting left (up) or right (pulled), colour knob at the tip.
  if (!on) {
    for (let i = 0; i < 6; i++) put(buf, 7 - Math.floor(i / 2), 10 - i, WOOD_L);
    fill(buf, 3, 3, 5, 5, col);
    fill(buf, 3, 3, 4, 3, [255, 255, 255]);
    fill(buf, 5, 4, 5, 5, colD);
  } else {
    for (let i = 0; i < 6; i++) put(buf, 7 + Math.floor(i / 2), 10 - i, WOOD_L);
    fill(buf, 8, 3, 10, 5, col);
    fill(buf, 8, 3, 9, 3, [255, 255, 255]);
    fill(buf, 10, 4, 10, 5, colD);
    // A little glow under the knob.
    put(buf, 7, 11, [255, 240, 160]);
    put(buf, 8, 11, [255, 240, 160]);
  }
  fill(buf, 6, 10, 8, 10, IRON_D);
  return done(buf, 7, 16);
}

/** The wall plaque: three coloured dots in the order the levers must be pulled. */
function colorMarks(c: { type: number }): Pix {
  const buf = new PixBuffer(22, 14);
  box(buf, 1, 1, 20, 2, 10, [96, 100, 90], [70, 74, 66], [44, 48, 42], [118, 122, 110]);
  fill(buf, 2, 3, 19, 3, GOLD_D);
  fill(buf, 2, 10, 19, 10, GOLD_D);
  const order = MARK_ORDERS[c.type % 6] ?? MARK_ORDERS[0] ?? [0, 1, 2];
  order.forEach((ci, i) => {
    const col = MARK_COLORS[ci] ?? [255, 255, 255];
    const x = 4 + i * 6;
    fill(buf, x, 5, x + 3, 8, col);
    fill(buf, x, 5, x + 1, 5, [255, 255, 255]);
    fill(buf, x + 3, 6, x + 3, 8, [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6]);
    fill(buf, x, 8, x + 3, 8, [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6]);
  });
  put(buf, 3, 4, MOSS);
  put(buf, 18, 4, MOSS_L);
  return done(buf, 11, 12);
}

/** A sliding stone door: one 16x16 wall block (the tile it fills), mossy bricks with a carved groove. */
function stoneDoor(): Pix {
  const buf = new PixBuffer(16, 16);
  fill(buf, 0, 0, 15, 15, STONE);
  fill(buf, 0, 0, 15, 2, STONE_L); // lit top lip
  fill(buf, 0, 13, 15, 15, STONE_D); // dark south face
  for (const y of [5, 9]) fill(buf, 0, y, 15, y, STONE_D);
  for (const [x, y] of [
    [4, 3],
    [11, 3],
    [8, 6],
    [3, 7],
    [12, 7],
    [6, 10],
    [13, 10],
  ] as const)
    fill(buf, x, y, x, y + 2, STONE_D);
  // Carved rune groove and moss.
  fill(buf, 6, 4, 9, 4, [58, 62, 54]);
  fill(buf, 7, 6, 8, 11, [58, 62, 54]);
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(hash2(i, 8, 503) * 16);
    const y = Math.floor(hash2(i, 9, 503) * 13);
    put(buf, x, y, hash2(i, 10, 503) < 0.5 ? MOSS : MOSS_D);
  }
  fill(buf, 0, 0, 0, 12, STONE_L);
  fill(buf, 15, 3, 15, 12, STONE_D);
  return { buf, ox: 8, oy: 8 };
}

function vineCurtain(): Pix {
  const buf = new PixBuffer(16, 18);
  for (let x = 1; x < 15; x++) {
    if (hash2(x, 1, 504) < 0.35) continue;
    const len = 6 + Math.floor(hash2(x, 2, 504) * 11);
    for (let y = 0; y < len; y++) {
      const c = y % 5 === 4 ? MOSS_L : y % 3 === 0 ? MOSS : MOSS_D;
      put(buf, x + (y % 6 === 5 ? 1 : 0), y, c);
    }
    put(buf, x + 1, Math.floor(len / 2), MOSS_L);
  }
  fill(buf, 1, 0, 14, 0, MOSS_D);
  buf.outline([20, 40, 18]);
  return { buf, ox: 8, oy: 17 };
}

// ---------------------------------------------------------------------------------------------------
// Trial chamber

function trialSpawner(): Pix {
  const buf = new PixBuffer(22, 28);
  // Tuff base and copper frame.
  box(buf, 3, 14, 16, 4, 9, [150, 150, 140], [112, 114, 106], [74, 76, 70], [176, 176, 164]);
  fill(buf, 3, 18, 18, 18, COPPER_D);
  fill(buf, 3, 22, 18, 22, COPPER_D);
  fill(buf, 3, 14, 18, 14, TEAL_L);
  // Cage bars with a dark interior.
  fill(buf, 5, 19, 16, 21, [22, 30, 36]);
  for (const x of [5, 8, 11, 14, 16]) fill(buf, x, 19, x, 21, TEAL);
  // A little spinning mob silhouette inside.
  fill(buf, 9, 19, 12, 21, [30, 60, 88]);
  put(buf, 10, 20, [120, 210, 255]);
  // Blue soul flame on top.
  const flame: Record<string, RGB> = {
    a: [120, 220, 255],
    b: [60, 150, 255],
    c: [34, 86, 214],
    w: [230, 250, 255],
  };
  rows(
    buf,
    7,
    2,
    [
      '.....a......',
      '....aba.....',
      '....abba..a.',
      '...abwwba.ab',
      '..aabwwbbaab',
      '.abbbwwbbbba',
      '.abbbwwbbbba',
      '..bbbwwbbbc.',
      '...bbbbbbcc.',
      '....cbbbcc..',
    ],
    flame,
  );
  return done(buf, 11, 23);
}

function trialKey(): Pix {
  const buf = new PixBuffer(12, 14);
  const k: Record<string, RGB> = {
    g: [60, 214, 190],
    G: [150, 250, 230],
    d: [30, 130, 120],
    o: [236, 130, 40],
  };
  rows(
    buf,
    1,
    1,
    [
      '..GGGG..',
      '.GggggG.',
      '.Gg..gd.',
      '.Gg..gd.',
      '.Gggggd.',
      '..dgdd..',
      '...gd...',
      '...gd...',
      '...gdgg.',
      '...gd...',
      '...gdgg.',
      '...dd...',
    ],
    k,
  );
  put(buf, 3, 3, [255, 255, 255]);
  // Glow dots around it.
  for (const [x, y] of [
    [0, 4],
    [10, 8],
    [1, 11],
    [9, 2],
  ] as const)
    put(buf, x, y, [170, 255, 240]);
  return done(buf, 6, 12);
}

function vault(): Pix {
  const buf = new PixBuffer(18, 18);
  box(buf, 1, 1, 16, 5, 10, COPPER_L, COPPER, COPPER_D, [244, 190, 150]);
  // Oxidised patches.
  for (let i = 0; i < 30; i++) {
    const x = 2 + Math.floor(hash2(i, 11, 505) * 14);
    const y = 2 + Math.floor(hash2(i, 12, 505) * 13);
    put(buf, x, y, hash2(i, 13, 505) < 0.6 ? TEAL : TEAL_D);
  }
  fill(buf, 1, 7, 16, 7, COPPER_D); // lid seam
  // Heavy lock plate with a keyhole and a faint ominous glow.
  fill(buf, 6, 8, 11, 13, [44, 56, 60]);
  fill(buf, 6, 8, 11, 8, [86, 110, 116]);
  fill(buf, 8, 9, 9, 10, [150, 250, 230]);
  fill(buf, 8, 11, 9, 12, [20, 24, 28]);
  for (const x of [2, 15]) fill(buf, x, 1, x, 14, TEAL_D);
  return done(buf, 9, 15);
}

/** Copper bars filling one door tile: vertical bars over a see-through gap, with a lit top rail. */
function copperBars(): Pix {
  const buf = new PixBuffer(16, 16);
  fill(buf, 0, 0, 15, 2, TEAL_L);
  fill(buf, 0, 3, 15, 3, TEAL);
  fill(buf, 0, 13, 15, 14, COPPER_D);
  fill(buf, 0, 15, 15, 15, [60, 40, 30]);
  for (const x of [1, 4, 7, 10, 13]) {
    fill(buf, x, 4, x + 1, 12, COPPER);
    fill(buf, x, 4, x, 12, COPPER_L);
    fill(buf, x + 1, 4, x + 1, 12, COPPER_D);
    put(buf, x, 6, TEAL);
    put(buf, x + 1, 9, TEAL_D);
  }
  fill(buf, 0, 8, 15, 8, TEAL_D);
  return { buf, ox: 8, oy: 8 };
}

// ---------------------------------------------------------------------------------------------------
// Pillager outpost

function outpostBanner(): Pix {
  const buf = new PixBuffer(16, 40);
  // Pole with a gold finial.
  fill(buf, 7, 4, 8, 37, DARK_WOOD);
  fill(buf, 7, 4, 7, 37, WOOD);
  fill(buf, 5, 1, 10, 3, GOLD);
  fill(buf, 6, 0, 9, 0, GOLD);
  fill(buf, 10, 1, 10, 3, GOLD_D);
  // The ominous banner: cyan cloth with a white-and-black pattern, swallowtail bottom.
  const cloth: RGB = [52, 156, 170];
  const clothD: RGB = [36, 112, 124];
  fill(buf, 2, 6, 13, 24, cloth);
  fill(buf, 13, 6, 13, 24, clothD);
  fill(buf, 2, 6, 13, 6, [92, 196, 206]);
  for (let i = 0; i < 4; i++)
    fill(buf, 2 + i * 3, 25 + (i % 2 === 0 ? 0 : 3), 4 + i * 3, 27, clothD);
  fill(buf, 2, 24, 13, 25, cloth);
  // Pattern: a pale rhombus with a dark core, like the raid banner.
  fill(buf, 5, 10, 10, 10, [236, 244, 244]);
  fill(buf, 4, 11, 11, 17, [236, 244, 244]);
  fill(buf, 5, 18, 10, 18, [236, 244, 244]);
  fill(buf, 6, 12, 9, 16, [38, 42, 52]);
  fill(buf, 7, 13, 8, 15, [120, 150, 160]);
  fill(buf, 2, 20, 4, 22, [38, 42, 52]);
  fill(buf, 11, 20, 13, 22, [38, 42, 52]);
  // Base post.
  fill(buf, 5, 36, 10, 38, DARK_WOOD);
  fill(buf, 5, 36, 10, 36, WOOD_L);
  return done(buf, 8, 37);
}

/** Wooden cage with bars; type 0 holds a toucan-like bird, 1 a bat-like one. */
function cage(c: { type: number }, open = false): Pix {
  const buf = new PixBuffer(22, 24);
  // Floor plank and roof beam.
  box(buf, 2, 14, 18, 3, 3, WOOD_L, WOOD, WOOD_D, [206, 168, 106]);
  fill(buf, 2, 3, 19, 4, WOOD);
  fill(buf, 2, 3, 19, 3, WOOD_L);
  fill(buf, 2, 5, 19, 5, WOOD_D);
  // Corner posts and bars.
  for (const x of [2, 18]) {
    fill(buf, x, 3, x + 1, 17, WOOD);
    fill(buf, x, 3, x, 17, WOOD_L);
    fill(buf, x + 1, 3, x + 1, 17, WOOD_D);
  }
  const bars = open ? [5, 8, 11] : [5, 8, 11, 14];
  for (const x of bars) {
    fill(buf, x, 6, x, 14, IRON);
    put(buf, x, 6, [220, 222, 232]);
  }
  if (open) {
    // The door swung open to the right.
    fill(buf, 15, 6, 16, 14, WOOD_D);
    fill(buf, 17, 8, 21, 12, IRON_D);
  } else {
    fill(buf, 14, 6, 14, 14, IRON);
    // The captive behind the bars.
    if (c.type % 2 === 0) {
      fill(buf, 7, 10, 12, 13, [28, 28, 34]); // toucan body
      fill(buf, 6, 8, 9, 10, [28, 28, 34]);
      fill(buf, 4, 8, 6, 9, [244, 150, 36]); // beak
      put(buf, 7, 8, [255, 255, 255]);
      fill(buf, 8, 11, 10, 12, [250, 250, 250]);
    } else {
      fill(buf, 8, 9, 11, 12, [84, 62, 56]); // bat body
      fill(buf, 5, 8, 7, 11, [60, 44, 40]);
      fill(buf, 12, 8, 14, 11, [60, 44, 40]);
      put(buf, 8, 10, [255, 220, 120]);
      put(buf, 11, 10, [255, 220, 120]);
    }
    // Padlock.
    fill(buf, 13, 12, 15, 14, GOLD);
    put(buf, 14, 13, [60, 40, 10]);
  }
  return done(buf, 11, 18);
}

function chestLegendary(): Pix {
  const buf = new PixBuffer(18, 17);
  box(buf, 1, 1, 16, 5, 9, [150, 90, 200], [112, 60, 164], [66, 34, 108], [188, 134, 232]);
  fill(buf, 1, 7, 16, 7, [40, 20, 70]);
  for (const x of [2, 15]) {
    fill(buf, x, 1, x, 14, GOLD);
    fill(buf, x + (x < 8 ? 1 : -1), 2, x + (x < 8 ? 1 : -1), 14, GOLD_D);
  }
  fill(buf, 1, 6, 16, 6, GOLD);
  fill(buf, 7, 5, 10, 11, GOLD);
  fill(buf, 10, 5, 10, 11, GOLD_D);
  fill(buf, 8, 8, 9, 9, [60, 40, 10]);
  for (const [x, y] of [
    [0, 3],
    [17, 5],
    [4, 0],
    [13, 0],
  ] as const)
    put(buf, x, y, [255, 240, 170]);
  return done(buf, 9, 14);
}

// ---------------------------------------------------------------------------------------------------
// Witch hut

function cauldron(c: { type: number }, empty = false): Pix {
  const buf = new PixBuffer(18, 18);
  const iron: RGB = [52, 54, 62];
  const ironL: RGB = [92, 96, 108];
  // Legs, body and rim.
  fill(buf, 3, 14, 4, 16, iron);
  fill(buf, 13, 14, 14, 16, iron);
  fill(buf, 2, 6, 15, 14, iron);
  fill(buf, 2, 6, 3, 14, ironL);
  fill(buf, 14, 6, 15, 14, [30, 32, 38]);
  fill(buf, 1, 4, 16, 6, ironL);
  fill(buf, 1, 6, 16, 6, [30, 32, 38]);
  // Liquid (or the dark empty inside).
  if (empty) {
    fill(buf, 3, 4, 14, 5, [22, 22, 28]);
  } else {
    fill(buf, 3, 4, 14, 5, [96, 214, 70]);
    fill(buf, 3, 4, 8, 4, [150, 250, 110]);
    put(buf, 11, 5, [70, 170, 50]);
    // Bubbles.
    const t = c.type;
    for (const [x, y] of [
      [5 + (t % 2), 2],
      [9, 1],
      [12, 3],
    ] as const) {
      put(buf, x, y, [190, 255, 150]);
      put(buf, x + 1, y, [96, 214, 70]);
    }
  }
  return done(buf, 9, 16);
}

function blackCat(): Pix {
  const buf = new PixBuffer(14, 14);
  const body: RGB = [30, 30, 38];
  const bodyL: RGB = [58, 58, 70];
  // Sitting cat seen from the front: body, head with ears, tail curling on the right.
  fill(buf, 3, 6, 9, 12, body);
  fill(buf, 3, 6, 4, 12, bodyL);
  fill(buf, 3, 2, 9, 6, body);
  fill(buf, 3, 2, 3, 6, bodyL);
  put(buf, 3, 1, body);
  put(buf, 4, 0, body);
  put(buf, 9, 1, body);
  put(buf, 8, 0, body);
  fill(buf, 5, 4, 5, 4, [250, 220, 60]);
  fill(buf, 8, 4, 8, 4, [250, 220, 60]);
  put(buf, 6, 5, [210, 120, 140]);
  put(buf, 7, 5, [210, 120, 140]);
  fill(buf, 10, 8, 11, 12, body);
  put(buf, 12, 7, body);
  put(buf, 11, 7, body);
  fill(buf, 4, 12, 5, 12, bodyL);
  fill(buf, 7, 12, 8, 12, bodyL);
  return done(buf, 6, 12);
}

export type Structure2Kind = Extract<
  PropKind,
  | 'chest_jungle'
  | 'dispenser'
  | 'lever'
  | 'lever_on'
  | 'color_marks'
  | 'stone_door'
  | 'vine_curtain'
  | 'trial_spawner'
  | 'trial_key'
  | 'vault'
  | 'copper_bars'
  | 'outpost_banner'
  | 'cage'
  | 'cage_open'
  | 'chest_legendary'
  | 'cauldron'
  | 'cauldron_empty'
  | 'black_cat'
>;

export const STRUCTURE2_PAINTERS: Record<Structure2Kind, Painter> = {
  chest_jungle: chestJungle,
  dispenser,
  lever: (c) => lever(c, false),
  lever_on: (c) => lever(c, true),
  color_marks: colorMarks,
  stone_door: stoneDoor,
  vine_curtain: vineCurtain,
  trial_spawner: trialSpawner,
  trial_key: trialKey,
  vault,
  copper_bars: copperBars,
  outpost_banner: outpostBanner,
  cage: (c) => cage(c, false),
  cage_open: (c) => cage(c, true),
  chest_legendary: chestLegendary,
  cauldron: (c) => cauldron(c, false),
  cauldron_empty: (c) => cauldron(c, true),
  black_cat: blackCat,
};

/** Prop kinds painted by this file with the gallery's sample variants (lever colours, mark orders...). */
export const STRUCTURE2_GALLERY: [Structure2Kind, number][] = [
  ['chest_jungle', 0],
  ['dispenser', 0],
  ['dispenser', 1],
  ['lever', 0],
  ['lever', 1],
  ['lever_on', 2],
  ['color_marks', 0],
  ['color_marks', 3],
  ['stone_door', 0],
  ['vine_curtain', 0],
  ['trial_spawner', 0],
  ['trial_key', 0],
  ['vault', 0],
  ['copper_bars', 0],
  ['outpost_banner', 0],
  ['cage', 0],
  ['cage', 1],
  ['cage_open', 0],
  ['chest_legendary', 0],
  ['cauldron', 0],
  ['cauldron_empty', 0],
  ['black_cat', 0],
];
