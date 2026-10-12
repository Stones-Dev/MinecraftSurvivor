import type { RunState } from '../game';
import type { Enemy } from './enemy';

export type ProjStyle =
  | 'arrow'
  | 'bolt'
  | 'trident'
  | 'snowball'
  | 'potion_harm'
  | 'potion_poison'
  | 'fireball'
  | 'skull'
  | 'skull_blue'
  | 'hook'
  | 'spit'
  | 'bubble';

/**
 * A moving damage source. Plain projectiles fly straight and are swept against enemies (friendly)
 * or the player (hostile). Optional fields add behaviours: lobbing (potions), boomerang return
 * (trident), homing, status effects, and hooks for custom logic.
 */
export class Projectile {
  px = 0;
  py = 0;
  alive = true;
  /** Enemy ids already hit (piercing projectiles hit each enemy once per pass). */
  readonly hits = new Set<number>();
  style: ProjStyle = 'arrow';
  knock = 40;

  // Status effects applied to enemies on hit (seconds / damage per second).
  burn = 0;
  burnDps = 0;
  poison = 0;
  poisonDps = 0;
  slowT = 0;
  slowF = 1;
  freeze = 0;
  stun = 0;

  // Lob: travel from (sx, sy) to (tx, ty) in lobDur seconds along an arc, then call onLand.
  lobDur = 0;
  lobT = 0;
  sx = 0;
  sy = 0;
  tx = 0;
  ty = 0;
  height = 18;

  // Boomerang: fly out to maxDist, then return to the hero.
  boomerang = false;
  maxDist = 0;
  phase: 0 | 1 = 0;
  speed = 0;

  /** Explosion radius when a hostile projectile lands (ghast fireballs). */
  blast = 0;

  // Homing.
  homing = false;
  turn = 0;
  target: Enemy | null = null;

  onHit?: (run: RunState, p: Projectile, e: Enemy) => void;
  onLand?: (run: RunState, p: Projectile) => void;
  onTick?: (run: RunState, p: Projectile, dt: number) => void;

  constructor(
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    readonly radius: number,
    public dmg: number,
    public pierce: number,
    public friendly: boolean,
    public life: number,
  ) {
    this.px = x;
    this.py = y;
    this.sx = x;
    this.sy = y;
    this.speed = Math.hypot(vx, vy);
  }
}
