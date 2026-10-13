/** Squared distance from point (cx, cy) to the segment (ax, ay)-(bx, by). */
export function segDist2(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - cx;
  const qy = ay + dy * t - cy;
  return qx * qx + qy * qy;
}

/** Swept hit test: does a circle of radius pr travelling a->b touch a circle (cx, cy, r)? */
export function sweepHit(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  pr: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const sum = pr + r;
  return segDist2(ax, ay, bx, by, cx, cy) <= sum * sum;
}

/** Squared distance between the segments (ax, ay)-(bx, by) and (cx, cy)-(dx, dy). */
export function segSegDist2(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): number {
  const d1x = bx - ax;
  const d1y = by - ay;
  const d2x = dx - cx;
  const d2y = dy - cy;
  const den = d1x * d2y - d1y * d2x;
  if (den !== 0) {
    const t = ((cx - ax) * d2y - (cy - ay) * d2x) / den;
    const u = ((cx - ax) * d1y - (cy - ay) * d1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    segDist2(ax, ay, bx, by, cx, cy),
    segDist2(ax, ay, bx, by, dx, dy),
    segDist2(cx, cy, dx, dy, ax, ay),
    segDist2(cx, cy, dx, dy, bx, by),
  );
}

/**
 * Swept hit test against a standing body: a circle of radius `pr` travelling a->b against a vertical capsule of
 * horizontal radius `r` whose axis runs from (cx, yLow) up to (cx, yHigh) (screen y grows downwards, so
 * yHigh < yLow). Sprites are side views, so a shot at the head or the torso must hit, not only one at the feet.
 */
export function sweepHitCapsule(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  pr: number,
  cx: number,
  yLow: number,
  yHigh: number,
  r: number,
): boolean {
  const sum = pr + r;
  return segSegDist2(ax, ay, bx, by, cx, yLow, cx, yHigh) <= sum * sum;
}

/**
 * Vertical extent of a body for hit tests: from just above the ankles (`BODY_LOW`) up to 80% of its drawn sprite
 * height, at most `BODY_CAP` (a Warden is about 61 px tall on screen, a Raid Captain about 51 px).
 */
export const BODY_LOW = 4;
export const BODY_CAP = 56;
export function bodyTop(spriteHeight: number): number {
  return Math.max(BODY_LOW, Math.min(BODY_CAP, spriteHeight * 0.8));
}

/**
 * The hero's hurtbox for hostile projectiles: a vertical capsule from just above the ankles up to the shoulders
 * (a bit under the 28-32 px sprite, so the head is not a free hit). It was a single ankle circle at y-6 until the
 * v1.3 pass; hostile ranged pressure was lowered to pay for the taller box (docs/BALANCE.md).
 */
export const HERO_BODY_LOW = 4;
export const HERO_BODY_TOP = 22;

/** The parts of an enemy definition that give its drawn height. */
interface BodyDef {
  height?: number;
  scale?: number;
}

/** Drawn sprite height of an enemy: the base height times the draw scale (bosses are 1.35x to 1.8x). */
export function drawnHeight(def: BodyDef): number {
  return (def.height ?? 28) * (def.scale ?? 1);
}

/** Height above the feet of the top of an enemy's hit capsule. */
export function enemyBodyTop(def: BodyDef): number {
  return bodyTop(drawnHeight(def));
}

/** World y of the centre of an enemy's hit capsule: where a ranged weapon should aim to hit the centre of mass. */
export function aimPointY(e: { y: number; def: BodyDef }): number {
  return e.y - (BODY_LOW + enemyBodyTop(e.def)) / 2;
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
