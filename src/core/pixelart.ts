/** Procedural pixel-art helpers: packed-pixel buffers, palettes, outlines (docs/PLAN.md 2.5). */
import { hash2 } from './noise';

export type RGB = readonly [number, number, number];

/** Pack to the little-endian ABGR layout of ImageData. */
export function pack(c: RGB): number {
  return ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
}

export function shade(c: RGB, f: number): RGB {
  const k = (v: number): number => Math.max(0, Math.min(255, Math.round(v * f)));
  return [k(c[0]), k(c[1]), k(c[2])];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = (x: number, y: number): number => Math.round(x + (y - x) * t);
  return [k(a[0], b[0]), k(a[1], b[1]), k(a[2], b[2])];
}

export class PixBuffer {
  readonly data: Uint32Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint32Array(w * h);
  }

  set(x: number, y: number, packed: number): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = packed;
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x] ?? 0;
  }

  /** 1 px outline on transparent pixels that touch an opaque pixel (4-neighbourhood). */
  outline(color: RGB): void {
    const packed = pack(color);
    const src = this.data.slice();
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x] !== 0) continue;
        const near =
          (x > 0 && src[y * this.w + x - 1] !== 0) ||
          (x < this.w - 1 && src[y * this.w + x + 1] !== 0) ||
          (y > 0 && src[(y - 1) * this.w + x] !== 0) ||
          (y < this.h - 1 && src[(y + 1) * this.w + x] !== 0);
        if (near) this.data[y * this.w + x] = packed;
      }
    }
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    const bytes = new Uint8ClampedArray(this.data.slice().buffer as ArrayBuffer);
    ctx.putImageData(new ImageData(bytes, this.w, this.h), 0, 0);
    return canvas;
  }
}

/** Filled noisy ellipse; `pick` chooses the colour for each pixel from a [0,1) value and its offset. */
export function blob(
  buf: PixBuffer,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  pick: (dx: number, dy: number, r: number) => RGB,
): void {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const edge = 1 - 0.28 * hash2(x, y, seed);
      if (dx * dx + dy * dy < edge)
        buf.set(x, y, pack(pick(x - cx, y - cy, hash2(x, y, seed + 1))));
    }
  }
}
