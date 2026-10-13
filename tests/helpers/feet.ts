/**
 * Reference implementation of the feet measurement that `tools/build_atlas.py` does at build time (kept here so
 * the tests can check the numbers stored in atlas.json against the frame pixels).
 */
export interface MeasuredFeet {
  /** Horizontal centre of the first foot relative to the anchor. */
  x: number;
  /** Distance in px from the bottom of the feet up to the anchor. */
  lift: number;
  /** Horizontal centre of the whole foot band (both shoes) relative to the anchor. */
  cx: number;
}

/** Narrowest run of equally low columns that counts as a foot (the hero's shoes are 5-6 px wide). */
const MIN_FOOT_RUN = 4;

/** Lowest opaque row of every column of an RGBA image (-1 for an empty column). */
export function columnBottoms(
  rgba: ArrayLike<number>,
  w: number,
  h: number,
  alphaMin = 20,
): Int16Array {
  const out = new Int16Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    for (let y = h - 1; y >= 0; y--) {
      if ((rgba[(y * w + x) * 4 + 3] ?? 0) > alphaMin) {
        out[x] = y;
        break;
      }
    }
  }
  return out;
}

/**
 * Find the feet in a frame from its per-column bottoms: the leftmost run of at least four columns that end on the
 * same row (a weapon or a cape to the right may reach lower, so the first run wins, not the lowest). `ox`/`oy`
 * is the frame's anchor. Null when no such run exists.
 */
export function findFeet(bottoms: ArrayLike<number>, ox: number, oy: number): MeasuredFeet | null {
  const n = bottoms.length;
  let i = 0;
  while (i < n) {
    const b = bottoms[i] ?? -1;
    let j = i;
    while (j + 1 < n && b >= 0 && bottoms[j + 1] === b) j++;
    if (b >= 0 && j - i + 1 >= MIN_FOOT_RUN) {
      let lo = n;
      let hi = -1;
      for (let x = 0; x < n; x++) {
        const bx = bottoms[x] ?? -1;
        if (bx >= b - 1 && bx <= b + 1) {
          lo = Math.min(lo, x);
          hi = Math.max(hi, x);
        }
      }
      return { x: (i + j + 1) / 2 - ox, lift: oy - (b + 1), cx: (lo + hi + 1) / 2 - ox };
    }
    i = j + 1;
  }
  return null;
}
