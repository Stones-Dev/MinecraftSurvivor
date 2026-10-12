import type { EnemyDef } from '../data/enemies';

export type EnemyState = 'move' | 'aim' | 'fuse' | 'windup' | 'leap' | 'dying';

let nextId = 1;

export class Enemy {
  readonly id = nextId++;
  x = 0;
  y = 0;
  radius: number;
  hp = 1;
  maxHp = 1;
  dmg = 1;
  speed: number;
  /** Knockback velocity, decays quickly. */
  kx = 0;
  ky = 0;
  facing: 1 | -1 = 1;
  /** Seconds of white hit flash left. */
  hurtT = 0;
  animT = 0;
  state: EnemyState = 'move';
  stateT = 0;
  cd = 0;
  /** Locked target point for aimed shots and leaps. */
  tx = 0;
  ty = 0;
  elite = false;
  splitDepth = 0;
  /** Time since the death animation started. */
  deathT = 0;
  /** Seconds the enemy has been far from the player (despawn logic). */
  farT = 0;

  constructor(readonly def: EnemyDef) {
    this.radius = def.radius;
    this.speed = def.speed;
  }

  get dying(): boolean {
    return this.state === 'dying';
  }
}
