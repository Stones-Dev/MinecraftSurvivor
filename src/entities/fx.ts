/** Short-lived visual effects; purely cosmetic, never read by gameplay code. */
export type FxKind = 'arc' | 'ring' | 'spark' | 'text' | 'bolt';

export interface Fx {
  kind: FxKind;
  x: number;
  y: number;
  t: number;
  life: number;
  /** arc: start/end angle; ring: unused. */
  a0: number;
  a1: number;
  /** arc/ring radius (ring grows from 0 to r). */
  r: number;
  vx: number;
  vy: number;
  text: string;
  color: string;
  /** bolt: world-space polyline [x0, y0, x1, y1, ...]. */
  pts: number[];
}

export function makeFx(
  kind: FxKind,
  x: number,
  y: number,
  life: number,
  extra: Partial<Fx> = {},
): Fx {
  return {
    kind,
    x,
    y,
    t: 0,
    life,
    a0: 0,
    a1: 0,
    r: 0,
    vx: 0,
    vy: 0,
    text: '',
    color: '#fff',
    pts: [],
    ...extra,
  };
}

/** A jagged lightning polyline between two world points. */
export function boltPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  jitter: number,
  rand: () => number,
): number[] {
  const pts = [x0, y0];
  const segs = Math.max(2, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 10));
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    pts.push(
      x0 + (x1 - x0) * t + (rand() - 0.5) * jitter,
      y0 + (y1 - y0) * t + (rand() - 0.5) * jitter,
    );
  }
  pts.push(x1, y1);
  return pts;
}
