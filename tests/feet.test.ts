import { describe, expect, it } from 'vitest';
import { columnBottoms, feetShift, findFeet } from '../src/core/feet';

/** Per-column lowest opaque rows of real hero frames (read from public/atlas, with their anchors). */
const FRAMES = {
  'steve.24.0': {
    ox: 16.0,
    oy: 35,
    bottoms: [
      12, 34, 34, 34, 34, 34, 34, 26, 33, 33, 33, 33, 33, 33, 24, 24, 24, 24, 23, 22, 23, 23, 23,
      18, 17, 16, 15, 15, 14, 13, 12, 12, 11, 10,
    ],
  },
  'steve.136.0': {
    ox: 20.5,
    oy: 45,
    bottoms: [
      4, 13, 12, 17, 38, 38, 38, 38, 38, 38, 30, 37, 37, 37, 37, 37, 37, 24, 24, 23, 22, 15,
    ],
  },
  'steve.136.2': {
    ox: 19.5,
    oy: 41,
    bottoms: [
      9, 8, 13, 34, 34, 34, 34, 34, 34, 26, 33, 33, 33, 33, 33, 33, 26, 29, 29, 29, 29, 29, 30, 31,
      32, 34, 35, 36, 38, 39, 40, 40, 40, 40, 40, 40, 40, 38, 34, 29,
    ],
  },
  'rana.38.0': {
    ox: 11.5,
    oy: 34,
    bottoms: [
      16, 17, 17, 33, 33, 33, 33, 33, 29, 27, 32, 32, 32, 32, 32, 27, 26, 26, 26, 21, 20, 19, 18,
      16,
    ],
  },
  'rana.143.2': {
    ox: 13.5,
    oy: 36,
    bottoms: [
      16, 17, 33, 33, 33, 33, 33, 29, 29, 27, 32, 32, 32, 32, 32, 29, 30, 31, 32, 33, 34, 34, 35,
      35, 35, 34, 29,
    ],
  },
} as const;

const feet = (k: keyof typeof FRAMES) => findFeet(FRAMES[k].bottoms, FRAMES[k].ox, FRAMES[k].oy);

describe('feet anchoring maths', () => {
  it('finds the lowest opaque row per column of an RGBA image', () => {
    const w = 3;
    const h = 4;
    const px = new Uint8ClampedArray(w * h * 4);
    px[(2 * w + 0) * 4 + 3] = 255; // column 0, row 2
    px[(3 * w + 2) * 4 + 3] = 255; // column 2, row 3
    px[(1 * w + 2) * 4 + 3] = 255;
    px[(3 * w + 1) * 4 + 3] = 10; // too faint
    expect(Array.from(columnBottoms(px, w, h))).toEqual([2, -1, 3]);
  });

  it('reads the idle feet as standing on the anchor and the swing feet as lifted', () => {
    expect(feet('steve.24.0')).toEqual({ x: -12, lift: 0 }); // shoes at columns 1..6
    expect(feet('steve.136.0')?.lift).toBe(6);
    expect(feet('rana.38.0')?.lift).toBe(0);
    expect(feet('rana.143.2')?.lift).toBe(2);
  });

  it('prefers the first foot run over a weapon that reaches lower to the right', () => {
    // steve.136.2: the sword tip is the lowest thing (row 40) but the feet are the first flat run (row 34).
    expect(feet('steve.136.2')?.lift).toBe(6);
    expect(findFeet([5, 5, 5, 5], 0, 6)).toEqual({ x: 2, lift: 0 }); // 4 equal columns qualify
    expect(findFeet([5, 5, 5, 6, 6], 0, 6)).toBeNull(); // no run of four
    expect(findFeet([-1, -1, -1, -1], 0, 6)).toBeNull(); // empty columns are no feet
  });

  it('shifts a swing frame so its feet land on the idle feet (baseline and centre)', () => {
    for (const [idle, swing] of [
      ['steve.24.0', 'steve.136.0'],
      ['steve.24.0', 'steve.136.2'],
      ['rana.38.0', 'rana.143.2'],
    ] as const) {
      const ref = feet(idle);
      const cur = feet(swing);
      const { dx, dy } = feetShift(ref, cur);
      // After the shift the feet are on the same row and within a pixel of the same column.
      expect(cur && ref && cur.lift - dy).toBe(ref?.lift);
      expect(Math.abs((cur?.x ?? 0) + dx - (ref?.x ?? 0))).toBeLessThanOrEqual(0.5);
      expect(dy).toBeGreaterThan(0); // the swing sprite is moved down onto the ground
    }
    expect(feetShift(feet('steve.24.0'), feet('steve.24.0'))).toEqual({ dx: 0, dy: 0 });
    expect(feetShift(null, feet('steve.24.0'))).toEqual({ dx: 0, dy: 0 });
  });
});
