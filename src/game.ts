/** Run state and the fixed-step simulation (everything gameplay; rendering lives in ui/ and world/renderer). */
import type { SfxName } from './core/audio';
import type { InputSource } from './core/input';
import { Rng } from './core/rng';
import { SpatialHash } from './core/spatialhash';
import { PASSIVES, type PassiveId } from './data/upgrades';
import type { Enemy } from './entities/enemy';
import type { Fx } from './entities/fx';
import { Player } from './entities/player';
import type { Pickup } from './entities/pickup';
import type { Projectile } from './entities/projectile';
import { updateMines, updateProjectiles } from './systems/combat';
import { updateEnemies } from './systems/enemyAI';
import { gainXp, type Card } from './systems/levelup';
import { Pathing } from './systems/pathing';
import { SpawnerState, updateSpawner } from './systems/spawner';
import { updateWeapons, type WeaponState } from './systems/weapons';
import { biomeState, type BiomeId } from './world/biomes';
import { World } from './world/world';

export interface Mine {
  x: number;
  y: number;
  fuse: number;
  area: number;
  dmg: number;
}

/** Ground warning drawn before a dangerous attack lands (>= 0.6 s, BRIEF section 9). */
export interface Telegraph {
  kind: 'line' | 'circle';
  x: number;
  y: number;
  x2: number;
  y2: number;
  r: number;
  t: number;
  dur: number;
}

export type RunStatus = 'playing' | 'dead';

const PICKUP_COLLECT = 8;

export class RunState {
  readonly rng: { spawn: Rng; drops: Rng; levelup: Rng; ai: Rng; fx: Rng };
  readonly world: World;
  readonly player = new Player();
  readonly pathing = new Pathing();
  readonly hash = new SpatialHash<Enemy>(32);
  readonly spawner = new SpawnerState();

  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  fx: Fx[] = [];
  mines: Mine[] = [];
  telegraphs: Telegraph[] = [];
  /** Sound events produced this frame; the screen plays and clears them. */
  events: SfxName[] = [];
  weapons: WeaponState[] = [{ id: 'sword', level: 1, cd: 0.3 }];
  passives = new Map<PassiveId, number>();

  time: number;
  kills = 0;
  emeraldsPicked = 0;
  level = 1;
  xp = 0;
  pendingLevelups = 0;
  offer: Card[] | null = null;
  rerolls = 1;
  offerSize = 3;
  status: RunStatus = 'playing';
  /** Screen-shake amplitude in px, decays on its own. */
  shake = 0;
  /** Seconds since death (the screen shows Results after a beat). */
  deadT = 0;

  dmgMult = 1;
  cdMult = 1;
  magnetRadius = 28;
  spawnMult = 1;

  constructor(
    readonly seed: number,
    startTime = 0,
  ) {
    const root = new Rng(seed);
    this.rng = {
      spawn: root.fork('spawn'),
      drops: root.fork('drops'),
      levelup: root.fork('levelup'),
      ai: root.fork('ai'),
      fx: root.fork('fx'),
    };
    this.world = new World(seed);
    this.time = startTime;
    // Steve's Builder's Grit: +10% max HP.
    this.player.maxHp = Math.round(this.player.maxHp * 1.1);
    this.player.hp = this.player.maxHp;
    this.recomputeStats();
  }

  emit(name: SfxName): void {
    if (this.events.length < 24) this.events.push(name);
  }

  biome(): BiomeId {
    return biomeState(this.time).current;
  }

  /** Derive multipliers from owned passives. */
  recomputeStats(): void {
    const lv = (id: PassiveId): number => this.passives.get(id) ?? 0;
    this.dmgMult = 1 + 0.1 * lv('sharpness');
    this.cdMult = Math.max(0.4, 1 - 0.08 * lv('quick_charge'));
    this.player.speedMult = 1 + 0.06 * lv('swiftness');
    this.player.armor = 3 * lv('protection');
    this.magnetRadius = 28 * (1 + 0.3 * lv('magnet'));
  }

  passiveLevel(id: PassiveId): number {
    return this.passives.get(id) ?? 0;
  }

  /** One fixed simulation step. Frozen while a level-up offer is open (the screen stops calling it). */
  update(dt: number, input: InputSource): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - 14 * dt);
    const p = this.player;
    p.update(dt, input, this.world, this.biome());
    if (p.dead) {
      if (this.status !== 'dead') this.emit('death');
      this.status = 'dead';
      this.deadT += dt;
    }
    this.pathing.update(dt, p.x, p.y, this.world, this.biome());
    if (!p.dead) updateSpawner(this, dt);

    this.hash.clear();
    for (const e of this.enemies) if (!e.dying) this.hash.insert(e);

    updateEnemies(this, dt);
    updateWeapons(this, dt);
    updateProjectiles(this, dt);
    updateMines(this, dt);
    this.updatePickups(dt);
    this.updateFx(dt);
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    for (const pk of this.pickups) {
      pk.age += dt;
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const d = Math.hypot(dx, dy) || 1;
      if (!pk.magnet && !p.dead && d < this.magnetRadius) pk.magnet = true;
      if (pk.magnet) {
        const accel = 520;
        pk.vx += (dx / d) * accel * dt;
        pk.vy += (dy / d) * accel * dt;
        const sp = Math.hypot(pk.vx, pk.vy);
        const max = 180;
        if (sp > max) {
          pk.vx = (pk.vx / sp) * max;
          pk.vy = (pk.vy / sp) * max;
        }
        pk.x += pk.vx * dt;
        pk.y += pk.vy * dt;
      }
      if (d < PICKUP_COLLECT && !p.dead) {
        if (pk.kind === 'xp') {
          const before = this.level;
          gainXp(this, pk.value);
          this.emit(this.level > before ? 'levelup' : 'xp');
        } else {
          this.emeraldsPicked += pk.value;
          this.emit('emerald');
        }
        pk.magnet = false;
        pk.vx = pk.vy = Number.NaN; // marks it as collected for the filter below
      }
    }
    this.pickups = this.pickups.filter((pk) => !Number.isNaN(pk.vx));
  }

  private updateFx(dt: number): void {
    for (const f of this.fx) {
      f.t += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.kind === 'spark') f.vy += 120 * dt;
    }
    this.fx = this.fx.filter((f) => f.t < f.life);
    for (const t of this.telegraphs) t.t += dt;
    this.telegraphs = this.telegraphs.filter((t) => t.t < t.dur);
  }

  /** Passive display helper for the HUD. */
  passiveList(): { id: PassiveId; level: number }[] {
    return [...this.passives.entries()].map(([id, level]) => ({ id, level }));
  }
}

export { PASSIVES };
