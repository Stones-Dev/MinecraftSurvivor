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

function boulder(type: number, shape: number, ore: boolean): Sprite {
  const buf = new PixBuffer(18, 15);
  blob(buf, 9, 8, 8, 6, 200 + shape * 11, (dx, dy, r) => {
    if (dy < -1 && dx < 1 && r < 0.6) return [172, 172, 172];
    if (dy > 2 && r < 0.6) return [104, 104, 108];
    return r < 0.15 ? [156, 156, 156] : [138, 138, 138];
  });
  if (ore) {
    const c: RGB = type === 0 ? [30, 30, 34] : [222, 176, 140];
    for (let k = 0; k < 6; k++) {
      const x = 3 + Math.floor(hash2(k, shape, 901) * 11);
      const y = 3 + Math.floor(hash2(k, shape, 902) * 8);
      if (buf.get(x, y) !== 0 && buf.get(x + 1, y) !== 0) {
        buf.set(x, y, pack(c));
        buf.set(x + 1, y, pack(c));
      }
    }
  }
  return finish(buf, 9, 13);
}

function chest(): Sprite {
  const buf = new PixBuffer(16, 14);
  rect(buf, 1, 6, 14, 12, [146, 98, 42]);
  rect(buf, 1, 2, 14, 5, [172, 122, 54]);
  rect(buf, 1, 6, 14, 6, [90, 58, 24]);
  rect(buf, 1, 9, 14, 9, [120, 78, 32]);
  rect(buf, 7, 5, 8, 7, [232, 200, 70]);
  return finish(buf, 8, 13);
}

function tallGrass(biome: BiomeId, shape: number): Sprite {
  const b = BIOMES[biome];
  const buf = new PixBuffer(12, 10);
  for (let i = 0; i < 6; i++) {
    const x = 1 + i * 2;
    const h = 4 + Math.floor(hash2(i, shape, 77) * 5);
    for (let y = 9; y > 9 - h; y--)
      buf.set(x, y, pack(hash2(x, y, 78) < 0.4 ? b.leaves[1] : b.leaves[0]));
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

export function propSprite(kind: PropKind, biome: BiomeId, variant: number): Sprite {
  const key = `${kind}/${biome}/${variant}`;
  let s = cache.get(key);
  if (!s) {
    const type = variant % 4;
    const shape = Math.floor(variant / 4);
    s =
      kind === 'tree'
        ? tree(biome, type, shape)
        : kind === 'boulder'
          ? boulder(0, shape, false)
          : kind === 'ore'
            ? boulder(type, shape, true)
            : kind === 'chest'
              ? chest()
              : kind === 'tallgrass'
                ? tallGrass(biome, shape)
                : flower(biome, type);
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
