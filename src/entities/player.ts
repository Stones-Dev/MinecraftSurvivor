import type { InputSource } from '../core/input';
import type { BiomeId } from '../world/biomes';
import { SOUL_SLOW, WATER_SLOW, type World } from '../world/world';

/** Art px per second squared: full speed in about 0.1 s, a stop in about 0.07 s. */
const ACCEL = 720;
const BRAKE = 1100;
/** Rate when the input opposes the current velocity (a 180 degree reversal at base speed takes about 0.08 s). */
const TURN_BRAKE = 1800;
/** Below this speed (art px/s) the velocity direction is meaningless, so turning uses the plain ACCEL. */
const TURN_MIN_SPEED = 8;
/** cos(angle between input and velocity) below which a turn counts as sharp. */
const TURN_COS = 0.2;
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

  /**
   * Body facing (sprites face right by default; -1 mirrors them). It follows the horizontal movement input and
   * keeps its last value while moving only vertically or when the keys are released; attacks never flip it while
   * the hero moves, so a hero running left and shooting right does not moonwalk.
   */
  facing: 1 | -1 = 1;
  moving = false;
  /** Direction of the last attack (weapons aim at a target; `aim()`) and seconds it stays relevant. */
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
  /** In the middle of a sharp turn (see `update`). */
  private turning = false;

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
    const speedScale = Math.max(1, sp / this.speed);
    const curSpeed = Math.hypot(this.vx, this.vy);
    let rate: number;
    if (ice) rate = input2 ? ICE_ACCEL : ICE_BRAKE;
    else if (!input2) rate = BRAKE * speedScale;
    else {
      // A sharp turn (input more than ~80 degrees off the current velocity) runs at the higher TURN_BRAKE rate
      // until the velocity has caught up with the input, so a reversal is one quick move and not a slow
      // second half after the velocity crosses zero. All rates scale with the speed multiplier so a reversal
      // takes about as long at any speed.
      if (curSpeed > TURN_MIN_SPEED) {
        const cos = (v.x * this.vx + v.y * this.vy) / (Math.hypot(v.x, v.y) * curSpeed);
        if (cos < TURN_COS) this.turning = true;
      }
      rate = (this.turning ? TURN_BRAKE : ACCEL) * speedScale;
      if (this.turning && Math.hypot(wantX - this.vx, wantY - this.vy) < sp * 0.12)
        this.turning = false;
    }
    if (!input2 || ice) this.turning = false;
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
    this.aimT = Math.max(0, this.aimT - dt);
    if (v.x !== 0) this.facing = v.x > 0 ? 1 : -1;
    else if (!input2 && this.aimT > 0 && Math.hypot(this.vx, this.vy) < 6) this.facing = this.aimFacing;
    if (Math.hypot(this.vx, this.vy) >= 0.01) {
      const wx = this.x + this.vx * dt;
      const wy = this.y + this.vy * dt;
      const next = world.collide(wx, wy, this.radius, biome);
      // The push-out of a solid prop (tree, wall) points along its normal: drop the velocity component into it
      // so the hero slides along it instead of running in place against it.
      const cx = next.x - wx;
      const cy = next.y - wy;
      const clen = Math.hypot(cx, cy);
      if (clen > 1e-4) {
        const vn = (this.vx * cx + this.vy * cy) / clen;
        if (vn < 0) {
          this.vx -= (vn * cx) / clen;
          this.vy -= (vn * cy) / clen;
        }
      }
      this.x = next.x;
      this.y = next.y;
    }
    const speedNow = Math.hypot(this.vx, this.vy);
    this.moving = speedNow > 6;
    // Walk cycle: advance by distance travelled so the feet match the ground speed.
    this.footfall = false;
    if (speedNow > 8) {
      const before = Math.floor(this.walkPhase);
      this.walkPhase += (speedNow * dt) / STRIDE;
      if (Math.floor(this.walkPhase) !== before) this.footfall = true;
    } else {
      this.walkPhase = Math.round(this.walkPhase / 2) * 2; // settle on a standing pose
    }
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

  /**
   * Record an attack direction (held for a quarter of a second). A standing hero turns to it; a moving hero keeps
   * its body facing (movement decides), while weapon swings and projectile origins may use `attackFacing`.
   */
  aim(dir: 1 | -1): void {
    this.aimFacing = dir;
    this.aimT = 0.25;
    if (!this.moving) this.facing = dir;
  }

  /** Facing for a weapon swing sprite: the attack direction while it is fresh, else the body facing. */
  get attackFacing(): 1 | -1 {
    return this.aimT > 0 ? this.aimFacing : this.facing;
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
