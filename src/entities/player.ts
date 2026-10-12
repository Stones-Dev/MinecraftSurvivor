import type { InputSource } from '../core/input';
import type { BiomeId } from '../world/biomes';
import { SOUL_SLOW, WATER_SLOW, type World } from '../world/world';

/** Art px per second squared: full speed in about 0.1 s, a stop in about 0.07 s. */
const ACCEL = 720;
const BRAKE = 1100;
const ICE_ACCEL = 170;
const ICE_BRAKE = 95;
/** Distance in art px covered per half-stride of the walk cycle. */
const STRIDE = 7;

export class Player {
  x = 0;
  y = 0;
  /** Previous-step position (NaN = just spawned/teleported) and the interpolated render position. */
  prevX = Number.NaN;
  prevY = Number.NaN;
  rx = 0;
  ry = 0;

  /** Sprites face right by default; -1 mirrors them. */
  facing: 1 | -1 = 1;
  moving = false;
  /** Facing forced by an attack for a moment (weapons aim; movement takes over afterwards). */
  aimT = 0;
  aimFacing: 1 | -1 = 1;
  /** Distance-driven walk cycle phase in half-strides (integer part flips the foot) and a footfall flag. */
  walkPhase = 0;
  footfall = false;
  /** Hitbox radius in art px (set from the hero at run start). */
  radius = 5;
  /** Last non-zero move direction (unit vector; starts facing down): 4-direction sprite heroes read it. */
  moveDX = 0;
  moveDY = 1;
  speed = 72; // art px per second (4.5 tiles/s)
  speedMult = 1;
  /** Environmental speed factor set each step (snowfall, cobwebs). */
  envMult = 1;
  /** Current velocity (art px/s); only differs from the input on ice. */
  vx = 0;
  vy = 0;

  hp = 110;
  maxHp = 110;
  armor = 0;
  regen = 0;
  /** Invulnerability seconds left after a hit. */
  iframes = 0;
  /** White flash seconds left. */
  hurtT = 0;
  /** Sword swing animation seconds left. */
  swingT = 0;
  /** Ability cast animation: seconds left and the total length it was started with. */
  castT = 0;
  castDur = 0;
  /** Slowed by enemy attacks (seconds left; movement x0.6). */
  slowT = 0;
  /** Damage over time on the hero: poison (cannot kill), wither and burning (can). */
  dotT = 0;
  dotDps = 0;
  dotKind: 'poison' | 'wither' | 'burn' = 'poison';
  /** Regeneration disabled while > 0 (husk hunger). */
  hungerT = 0;
  dead = false;

  update(dt: number, input: InputSource, world: World, biome: BiomeId, waterImmune = false): void {
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.swingT = Math.max(0, this.swingT - dt);
    this.castT = Math.max(0, this.castT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.hungerT = Math.max(0, this.hungerT - dt);
    if (this.dead) return;
    if (this.regen > 0 && this.hungerT <= 0) this.heal(this.regen * dt);
    const v = input.moveVector();
    const surface = world.surface(this.x, this.y, biome);
    const water =
      surface === 'water' && !waterImmune ? WATER_SLOW : surface === 'soul' ? SOUL_SLOW : 1;
    const sp = this.speed * this.speedMult * this.envMult * water * (this.slowT > 0 ? 0.6 : 1);
    const wantX = v.x * sp;
    const wantY = v.y * sp;
    // Accelerate towards the wanted velocity and brake when the keys are released, so starts and stops
    // ease in instead of snapping; ice keeps the old slippery feel with much lower rates.
    const input2 = v.x !== 0 || v.y !== 0;
    if (input2) {
      const len = Math.hypot(v.x, v.y);
      this.moveDX = v.x / len;
      this.moveDY = v.y / len;
    }
    const ice = surface === 'ice';
    const rate = ice ? (input2 ? ICE_ACCEL : ICE_BRAKE) : input2 ? ACCEL : BRAKE;
    const dvx = wantX - this.vx;
    const dvy = wantY - this.vy;
    const dv = Math.hypot(dvx, dvy);
    const maxDv = rate * dt;
    if (dv <= maxDv) {
      this.vx = wantX;
      this.vy = wantY;
    } else {
      this.vx += (dvx / dv) * maxDv;
      this.vy += (dvy / dv) * maxDv;
    }
    const speedNow = Math.hypot(this.vx, this.vy);
    this.moving = input2 || speedNow > 6;
    this.aimT = Math.max(0, this.aimT - dt);
    if (this.aimT > 0) this.facing = this.aimFacing;
    else if (v.x !== 0) this.facing = v.x > 0 ? 1 : -1;
    // Walk cycle: advance by distance travelled so the feet match the ground speed.
    this.footfall = false;
    if (speedNow > 8) {
      const before = Math.floor(this.walkPhase);
      this.walkPhase += (speedNow * dt) / STRIDE;
      if (Math.floor(this.walkPhase) !== before) this.footfall = true;
    } else {
      this.walkPhase = Math.round(this.walkPhase / 2) * 2; // settle on a standing pose
    }
    if (speedNow < 0.01) return;
    const next = world.collide(this.x + this.vx * dt, this.y + this.vy * dt, this.radius, biome);
    this.x = next.x;
    this.y = next.y;
  }

  /** Apply damage after armor (BRIEF section 9: dmg * 100 / (100 + armor)); returns the damage dealt. */
  hurt(raw: number): number {
    if (this.iframes > 0 || this.dead) return 0;
    const dmg = Math.max(1, Math.round((raw * 100) / (100 + this.armor)));
    this.hp -= dmg;
    this.iframes = 0.6;
    this.hurtT = 0.15;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
    return dmg;
  }

  /** Face a direction because of an attack (held for a quarter of a second, then movement decides again). */
  aim(dir: 1 | -1): void {
    this.aimFacing = dir;
    this.aimT = 0.25;
    this.facing = dir;
  }

  /** Forget the previous position so the next render does not slide across a teleport. */
  snap(): void {
    this.prevX = Number.NaN;
    this.prevY = Number.NaN;
  }

  heal(amount: number): void {
    if (!this.dead) this.hp = Math.min(this.maxHp, this.hp + amount);
  }
}
