import type { AllyDef, PetDef } from '../data/companions';

/** A companion fighting beside the hero: has HP, goes "downed" and returns after 20 s at 50% HP. */
export class Ally {
  hp: number;
  readonly maxHp: number;
  downed = false;
  respawnT = 0;
  cd = 1;
  cd2 = 0;
  contactCd = 0;
  hurtT = 0;
  facing = 1;
  dx = 0;
  dy = 1;
  moving = false;
  /** Seconds of the current attack animation (for a little lunge). */
  atkT = 0;
  /** Seconds since the last time this ally was used in a stat computation (unused, keeps shape). */
  t = 0;

  constructor(
    readonly def: AllyDef,
    readonly level: number,
    readonly slot: number,
    public x: number,
    public y: number,
  ) {
    this.maxHp = Math.round(def.hp * (1 + 0.2 * (level - 1)));
    this.hp = this.maxHp;
  }
}

/** The pet: invulnerable, follows with a lazy spring. */
export class PetState {
  vx = 0;
  vy = 0;
  facing = 1;
  moving = false;
  t = 0;
  cd = 0;
  /** Seconds until the next bark/squawk is allowed. */
  noiseCd = 0;

  constructor(
    readonly def: PetDef,
    readonly level: number,
    public x: number,
    public y: number,
  ) {}
}
