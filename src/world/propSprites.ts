/** Procedural prop sprites, painted once per (kind, biome, variant) and cached. */
import { hash2 } from '../core/noise';
import { blob, mix, pack, PixBuffer, type RGB } from '../core/pixelart';
import { BIOMES, type BiomeId } from './biomes';
import type { PropKind } from './props';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Feet anchor inside the sprite. */
  ox: number;
  oy: number;
}

const OUTLINE: RGB = [24, 28, 20];
const cache = new Map<string, Sprite>();

function finish(buf: PixBuffer, ox: number, oy: number): Sprite {
  buf.outline(OUTLINE);
  return { canvas: buf.toCanvas(), ox, oy };
}

function rect(buf: PixBuffer, x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const p = pack(c);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) buf.set(x, y, p);
}

function tree(biome: BiomeId, type: number, shape: number): Sprite {
  const b = BIOMES[biome];
  const [lBase, lLight, lDark] =
    type === 1 ? (b.leaves.map((c) => mix(c, [200, 230, 120], 0.22)) as [RGB, RGB, RGB]) : b.leaves;
  const seed = 40 + type * 100 + shape * 7;
  const pick = (dx: number, dy: number, r: number): RGB => {
    if (dy < -3 && dx < 2 && r < 0.5) return lLight;
    if (dy > 4 && r < 0.55) return lDark;
    return r < 0.12 ? lLight : r > 0.88 ? lDark : lBase;
  };
  if (type === 3) return spruce(biome, shape);
  if (type === 2) {
    const buf = new PixBuffer(36, 42);
    rect(buf, 14, 26, 21, 40, b.trunk[0]);
    rect(buf, 19, 26, 21, 40, b.trunk[1]);
    blob(buf, 18, 16, 16, 14, seed, pick);
    return finish(buf, 18, 40);
  }
  if (type === 1) {
    const buf = new PixBuffer(26, 34);
    rect(buf, 11, 20, 13, 33, [232, 232, 224]);
    rect(buf, 13, 20, 13, 33, [196, 196, 188]);
    for (let y = 22; y < 33; y += 3)
      if (hash2(y, shape, 5) < 0.7) rect(buf, 11, y, 12, y, [40, 40, 40]);
    blob(buf, 13, 11, 11, 10, seed, pick);
    return finish(buf, 13, 32);
  }
  const buf = new PixBuffer(28, 36);
  rect(buf, 12, 22, 15, 34, b.trunk[0]);
  rect(buf, 15, 22, 15, 34, b.trunk[1]);
  blob(buf, 14, 13, 13, 12, seed, pick);
  return finish(buf, 14, 34);
}

/** Layered conifer; snow caps on the upper edge of every tier in snowy biomes. */
function spruce(biome: BiomeId, shape: number): Sprite {
  const b = BIOMES[biome];
  const buf = new PixBuffer(26, 40);
  rect(buf, 11, 31, 14, 39, b.trunk[0]);
  rect(buf, 14, 31, 14, 39, b.trunk[1]);
  const snow = b.snow;
  for (let tier = 0; tier < 4; tier++) {
    const top = 2 + tier * 8;
    const half = 4 + tier * 3;
    for (let row = 0; row < 11; row++) {
      const w = Math.floor((half * (row + 1)) / 11) + 1;
      for (let x = 13 - w; x <= 12 + w; x++) {
        const r = hash2(x, top + row, 300 + shape * 5 + tier);
        let c = r < 0.15 ? b.leaves[1] : r > 0.85 ? b.leaves[2] : b.leaves[0];
        if (snow && (row < 3 || (row < 5 && r < 0.4)))
          c = r < 0.5 ? [248, 250, 255] : [214, 228, 242];
        buf.set(x, top + row, pack(c));
      }
    }
  }
  return finish(buf, 13, 38);
}

function cactus(shape: number): Sprite {
  const g: RGB = [74, 146, 62];
  const gl: RGB = [102, 174, 80];
  const gd: RGB = [50, 108, 44];
  const buf = new PixBuffer(16, 26);
  rect(buf, 6, 3, 9, 24, g);
  rect(buf, 6, 3, 6, 24, gl);
  rect(buf, 9, 3, 9, 24, gd);
  const leftArm = shape % 2 === 0;
  if (leftArm) {
    rect(buf, 2, 12, 5, 14, g);
    rect(buf, 2, 8, 3, 13, g);
  } else {
    rect(buf, 10, 10, 13, 12, g);
    rect(buf, 12, 6, 13, 11, g);
  }
  for (let i = 0; i < 9; i++) {
    const x = 6 + Math.floor(hash2(i, shape, 21) * 4);
    const y = 4 + Math.floor(hash2(i, shape, 22) * 19);
    buf.set(x, y, pack([236, 232, 190]));
  }
  return finish(buf, 8, 24);
}

const ORE_COLORS: RGB[] = [
  [34, 34, 38], // coal
  [222, 176, 140], // iron
  [250, 210, 60], // gold
  [48, 84, 214], // lapis
  [210, 36, 36], // redstone
  [90, 232, 232], // diamond
];

function boulder(type: number, shape: number, ore: boolean): Sprite {
  const buf = new PixBuffer(18, 15);
  blob(buf, 9, 8, 8, 6, 200 + shape * 11, (dx, dy, r) => {
    if (dy < -1 && dx < 1 && r < 0.6) return [172, 172, 172];
    if (dy > 2 && r < 0.6) return [104, 104, 108];
    return r < 0.15 ? [156, 156, 156] : [138, 138, 138];
  });
  if (ore) {
    const c = ORE_COLORS[type] ?? ORE_COLORS[0] ?? [0, 0, 0];
    for (let k = 0; k < 7; k++) {
      const x = 3 + Math.floor(hash2(k, shape, 901) * 11);
      const y = 3 + Math.floor(hash2(k, shape, 902) * 8);
      if (buf.get(x, y) !== 0 && buf.get(x + 1, y) !== 0) {
        buf.set(x, y, pack(c));
        buf.set(x + 1, y, pack(c));
        buf.set(x, y + 1, pack(c));
      }
    }
  }
  return finish(buf, 9, 13);
}

function chest(locked: boolean): Sprite {
  const buf = new PixBuffer(16, 14);
  const body: RGB = locked ? [92, 70, 60] : [146, 98, 42];
  const lid: RGB = locked ? [112, 86, 74] : [172, 122, 54];
  rect(buf, 1, 6, 14, 12, body);
  rect(buf, 1, 2, 14, 5, lid);
  rect(buf, 1, 6, 14, 6, [60, 40, 20]);
  rect(buf, 1, 9, 14, 9, locked ? [70, 52, 44] : [120, 78, 32]);
  if (locked) {
    rect(buf, 3, 2, 3, 12, [150, 150, 160]);
    rect(buf, 12, 2, 12, 12, [150, 150, 160]);
    rect(buf, 6, 6, 9, 9, [236, 190, 50]);
    rect(buf, 7, 4, 8, 5, [190, 150, 40]);
  } else {
    rect(buf, 7, 5, 8, 7, [232, 200, 70]);
  }
  return finish(buf, 8, 13);
}

function tallGrass(biome: BiomeId, shape: number): Sprite {
  const b = BIOMES[biome];
  const buf = new PixBuffer(12, 10);
  const dry = biome === 'desert';
  for (let i = 0; i < 6; i++) {
    const x = 1 + i * 2;
    const h = 4 + Math.floor(hash2(i, shape, 77) * 5);
    for (let y = 9; y > 9 - h; y--) {
      const c: RGB = dry
        ? hash2(x, y, 78) < 0.4
          ? [150, 112, 60]
          : [118, 86, 44]
        : hash2(x, y, 78) < 0.4
          ? b.leaves[1]
          : b.leaves[0];
      buf.set(x, y, pack(c));
    }
  }
  return finish(buf, 6, 9);
}

function flower(biome: BiomeId, type: number): Sprite {
  const b = BIOMES[biome];
  const head: RGB = type === 0 ? [214, 56, 56] : type === 1 ? [240, 210, 60] : [80, 120, 230];
  const buf = new PixBuffer(8, 10);
  rect(buf, 4, 4, 4, 9, b.leaves[2]);
  rect(buf, 3, 1, 5, 3, head);
  buf.set(4, 2, pack([255, 240, 160]));
  return finish(buf, 4, 9);
}

function melon(pumpkin: boolean): Sprite {
  const buf = new PixBuffer(12, 11);
  blob(buf, 6, 6, 5, 4, pumpkin ? 55 : 66, (_dx, dy, r) => {
    if (pumpkin) return r < 0.3 ? [232, 128, 24] : dy > 1 ? [190, 96, 14] : [246, 150, 40];
    return r < 0.3 ? [86, 170, 60] : dy > 1 ? [40, 110, 40] : [120, 196, 80];
  });
  rect(buf, 5, 1, 6, 2, pumpkin ? [90, 120, 40] : [70, 100, 40]);
  return finish(buf, 6, 9);
}

function beacon(): Sprite {
  const buf = new PixBuffer(16, 20);
  rect(buf, 1, 14, 14, 18, [34, 28, 48]);
  rect(buf, 2, 13, 13, 13, [60, 50, 80]);
  rect(buf, 4, 4, 11, 12, [120, 232, 240]);
  rect(buf, 5, 5, 6, 8, [230, 255, 255]);
  rect(buf, 9, 9, 11, 12, [60, 170, 190]);
  return finish(buf, 8, 18);
}

function campfire(): Sprite {
  const buf = new PixBuffer(16, 14);
  rect(buf, 1, 10, 14, 12, [92, 62, 34]);
  rect(buf, 2, 8, 6, 10, [112, 78, 44]);
  rect(buf, 9, 8, 13, 10, [112, 78, 44]);
  rect(buf, 6, 4, 9, 9, [255, 130, 20]);
  rect(buf, 7, 2, 8, 6, [255, 200, 60]);
  rect(buf, 7, 5, 8, 8, [255, 245, 170]);
  return finish(buf, 8, 12);
}

function anvil(): Sprite {
  const buf = new PixBuffer(16, 14);
  rect(buf, 1, 2, 14, 5, [96, 98, 110]);
  rect(buf, 2, 2, 13, 3, [140, 142, 156]);
  rect(buf, 5, 6, 10, 8, [76, 78, 90]);
  rect(buf, 3, 9, 12, 12, [60, 62, 72]);
  rect(buf, 1, 4, 2, 5, [76, 78, 90]);
  return finish(buf, 8, 12);
}

function enchantTable(): Sprite {
  const buf = new PixBuffer(16, 14);
  rect(buf, 1, 6, 14, 12, [30, 24, 36]);
  rect(buf, 1, 4, 14, 6, [160, 30, 40]);
  rect(buf, 2, 3, 13, 3, [200, 50, 60]);
  rect(buf, 6, 0, 9, 2, [230, 220, 190]);
  rect(buf, 7, 1, 8, 1, [90, 220, 255]);
  rect(buf, 3, 9, 4, 10, [90, 220, 255]);
  rect(buf, 11, 9, 12, 10, [90, 220, 255]);
  return finish(buf, 8, 12);
}

function tntTrap(): Sprite {
  const buf = new PixBuffer(14, 8);
  rect(buf, 1, 2, 12, 6, [190, 40, 36]);
  rect(buf, 1, 4, 12, 4, [236, 232, 220]);
  rect(buf, 6, 0, 7, 1, [70, 60, 40]);
  return finish(buf, 7, 7);
}

function cobweb(shape: number): Sprite {
  const buf = new PixBuffer(18, 14);
  const w = pack([236, 238, 244]);
  for (let i = 0; i < 18; i++) {
    buf.set(i, 7, w);
    if (i < 14) buf.set(9, i, w);
    buf.set(i, ((i * 14) / 18) | 0, w);
    buf.set(i, 13 - (((i * 14) / 18) | 0), w);
  }
  for (const r of [3, 6]) {
    for (let a = 0; a < 24; a++) {
      const t = (a / 24) * Math.PI * 2;
      buf.set(Math.round(9 + Math.cos(t) * r * 1.2), Math.round(7 + Math.sin(t) * r * 0.9), w);
    }
  }
  void shape;
  return { canvas: buf.toCanvas(), ox: 9, oy: 10 };
}

function magma(shape: number): Sprite {
  const buf = new PixBuffer(16, 11);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 16; x++) {
      const r = hash2(x, y, 910 + shape);
      buf.set(x, y + 1, pack(r < 0.25 ? [255, 190, 50] : r < 0.6 ? [226, 86, 18] : [70, 28, 20]));
    }
  }
  return finish(buf, 8, 9);
}

export function propSprite(kind: PropKind, biome: BiomeId, variant: number): Sprite {
  const key = `${kind}/${biome}/${variant}`;
  let s = cache.get(key);
  if (!s) {
    const type = variant % 8;
    const shape = Math.floor(variant / 8);
    switch (kind) {
      case 'tree':
        s = tree(biome, type, shape);
        break;
      case 'boulder':
        s = boulder(0, shape, false);
        break;
      case 'ore':
        s = boulder(type, shape, true);
        break;
      case 'chest':
        s = chest(false);
        break;
      case 'locked_chest':
        s = chest(true);
        break;
      case 'tallgrass':
        s = tallGrass(biome, shape);
        break;
      case 'flower':
        s = flower(biome, type);
        break;
      case 'cactus':
        s = cactus(shape);
        break;
      case 'melon':
        s = melon(false);
        break;
      case 'pumpkin':
        s = melon(true);
        break;
      case 'beacon':
        s = beacon();
        break;
      case 'campfire':
        s = campfire();
        break;
      case 'anvil':
        s = anvil();
        break;
      case 'enchant_table':
        s = enchantTable();
        break;
      case 'tnt_trap':
        s = tntTrap();
        break;
      case 'cobweb':
        s = cobweb(shape);
        break;
      case 'magma':
        s = magma(shape);
        break;
    }
    cache.set(key, s);
  }
  return s;
}

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
