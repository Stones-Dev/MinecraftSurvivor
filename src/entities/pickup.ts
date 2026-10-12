export type PickupKind = 'xp' | 'emerald';

export class Pickup {
  /** Pickups have no collision radius for the hash; kept for symmetry. */
  readonly radius = 3;
  magnet = false;
  vx = 0;
  vy = 0;
  age = 0;

  constructor(
    readonly kind: PickupKind,
    public x: number,
    public y: number,
    readonly value: number,
  ) {}
}
