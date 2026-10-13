/**
 * Feet anchoring for the layered hero sheets. Their frames are trimmed and anchored differently (the swing frames
 * sit 2-6 px above the idle feet line and a couple of px sideways, the idle frames carry the sword on one side of
 * the anchor), so a hero that swings or turns would jump on screen. `tools/build_atlas.py` measures the feet of every
 * hero frame from its pixels and stores them in atlas.json (`fx`, `fy`, `bx`); this file is the shift maths.
 */
export interface Feet {
  /** Horizontal centre of the first foot relative to the anchor (frame px, unflipped; negative = left of it). */
  x: number;
  /** Distance in px from the bottom of the feet up to the anchor (0 = feet on the anchor line). */
  lift: number;
  /** Horizontal centre of both feet (the body centre) relative to the anchor. */
  cx: number;
}

/** Whole-pixel shift (frame space: +x right when unflipped, +y down) that puts `cur`'s feet where `ref`'s are. */
export function feetShift(ref: Feet | null, cur: Feet | null): { dx: number; dy: number } {
  if (!ref || !cur) return { dx: 0, dy: 0 };
  return { dx: Math.round(ref.x - cur.x), dy: Math.round(cur.lift - ref.lift) };
}

/**
 * Whole-pixel x shift (frame space, same convention as `feetShift`) that puts the body centre of `feet` on the
 * anchor column. Mirroring around the anchor then keeps the body in place, so turning (or walking from one row of
 * the walk sheet into another) never hops sideways.
 */
export function centerShift(feet: Feet | null): number {
  return feet ? Math.round(-feet.cx) : 0;
}
