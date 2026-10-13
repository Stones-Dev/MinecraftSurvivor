/**
 * Feet anchoring for the layered hero sheets. Their swing frames are trimmed and anchored differently from the
 * idle frames (the feet sit 2-6 px above the anchor and a couple of px sideways), so a hero that swings would
 * jump on screen. The feet are found from the pixels of a frame and the swing frame is shifted so its feet land
 * where the idle feet are. Pure maths here; `Atlas.feetOf` reads the pixels.
 */
export interface Feet {
  /** Horizontal centre of the feet relative to the anchor (frame px, unflipped; negative = left of it). */
  x: number;
  /** Distance in px from the bottom of the feet up to the anchor (0 = feet on the anchor line). */
  lift: number;
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
export function findFeet(bottoms: ArrayLike<number>, ox: number, oy: number): Feet | null {
  const n = bottoms.length;
  let i = 0;
  while (i < n) {
    const b = bottoms[i] ?? -1;
    let j = i;
    while (j + 1 < n && b >= 0 && bottoms[j + 1] === b) j++;
    if (b >= 0 && j - i + 1 >= MIN_FOOT_RUN) return { x: (i + j + 1) / 2 - ox, lift: oy - (b + 1) };
    i = j + 1;
  }
  return null;
}

/** Whole-pixel shift (frame space: +x right when unflipped, +y down) that puts `cur`'s feet where `ref`'s are. */
export function feetShift(ref: Feet | null, cur: Feet | null): { dx: number; dy: number } {
  if (!ref || !cur) return { dx: 0, dy: 0 };
  return { dx: Math.round(ref.x - cur.x), dy: Math.round(cur.lift - ref.lift) };
}
