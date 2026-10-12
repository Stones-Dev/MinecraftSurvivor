/** Short-lived visual effects; purely cosmetic, never read by gameplay code. */
export type FxKind = 'arc' | 'ring' | 'spark' | 'text';

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
    ...extra,
  };
}
