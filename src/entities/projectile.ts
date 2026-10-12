export class Projectile {
  px = 0;
  py = 0;
  alive = true;
  /** Enemy ids already hit (piercing arrows hit each enemy once). */
  readonly hits = new Set<number>();

  constructor(
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    readonly radius: number,
    public dmg: number,
    public pierce: number,
    readonly friendly: boolean,
    public life: number,
  ) {
    this.px = x;
    this.py = y;
  }
}
