import type { EnemyDef } from '../data/enemies';

export type EnemyState =
  'move' | 'aim' | 'fuse' | 'windup' | 'leap' | 'cast' | 'blink' | 'orbit' | 'rest' | 'dying';

export class Enemy {
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

  /** Secondary cooldown (summon, heal pulse, blink, charge rest). */
  cd2 = 0;
  /** Id of the summoner that created this enemy (0 = none). */
  summonerId = 0;
  /** Seconds of rage left (zombified piglins; speed x1.5). */
  angry = 0;
  /** Trail timer for burning ground (magma cubes). */
  trailT = 0;
  /** Orbit angle for divers. */
  orbit = 0;

  // Status effects (see systems/status.ts).
  burnT = 0;
  burnDps = 0;
  poisonT = 0;
  poisonDps = 0;
  witherT = 0;
  witherDps = 0;
  slowT = 0;
  slowF = 1;
  stunT = 0;
  freezeT = 0;
  statusAcc = 0;
  /** Shield HP granted by shielders (absorbs damage first). */
  shield = 0;
  /** Charged ("shiny") mobs: x2 HP, x5 XP, drop a Spawn Egg. */
  charged = false;
  /** Mini-boss / boss marker (bosses never despawn). */
  boss: 'mini' | 'boss' | null = null;

  /** `id` is allocated per run (RunState.nextEnemyId) so simulations stay deterministic. */
  constructor(
    readonly def: EnemyDef,
    readonly id: number,
  ) {
    this.radius = def.radius;
    this.speed = def.speed;
  }

  /** Movement multiplier from slow / stun / freeze. */
  moveMult(): number {
    if (this.stunT > 0) return 0;
    return this.slowT > 0 ? this.slowF : 1;
  }

  get dying(): boolean {
    return this.state === 'dying';
  }
}
