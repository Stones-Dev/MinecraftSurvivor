import type { InputSource } from '../core/input';
import type { BiomeId } from '../world/biomes';
import type { World } from '../world/world';

export class Player {
  x = 0;
  y = 0;
  /** Sprites face right by default; -1 mirrors them. */
  facing: 1 | -1 = 1;
  moving = false;
  readonly radius = 5;
  speed = 72; // art px per second (4.5 tiles/s)
  speedMult = 1;

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
  /** Slowed by enemy attacks (seconds left; movement x0.6). */
  slowT = 0;
  /** Damage over time on the hero: poison (cannot kill) or wither (can). */
  dotT = 0;
  dotDps = 0;
  dotKind: 'poison' | 'wither' = 'poison';
  /** Regeneration disabled while > 0 (husk hunger). */
  hungerT = 0;
  dead = false;

  update(dt: number, input: InputSource, world: World, biome: BiomeId, waterImmune = false): void {
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.swingT = Math.max(0, this.swingT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.hungerT = Math.max(0, this.hungerT - dt);
    if (this.dead) return;
    if (this.regen > 0 && this.hungerT <= 0) this.heal(this.regen * dt);
    const v = input.moveVector();
    this.moving = v.x !== 0 || v.y !== 0;
    if (v.x !== 0) this.facing = v.x > 0 ? 1 : -1;
    if (!this.moving) return;
    const water = waterImmune ? 1 : world.speedFactor(this.x, this.y);
    const step = this.speed * this.speedMult * water * (this.slowT > 0 ? 0.6 : 1) * dt;
    const next = world.collide(this.x + v.x * step, this.y + v.y * step, this.radius, biome);
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

  heal(amount: number): void {
    if (!this.dead) this.hp = Math.min(this.maxHp, this.hp + amount);
  }
}
