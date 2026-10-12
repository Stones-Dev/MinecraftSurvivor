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

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
