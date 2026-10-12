/** Run state and the fixed-step simulation (everything gameplay; rendering lives in ui/ and world/renderer). */
import type { SfxName } from './core/audio';
import type { InputSource } from './core/input';
import { Rng } from './core/rng';
import { SpatialHash } from './core/spatialhash';
import { baseMods, PASSIVES, type Mods, type PassiveId } from './data/upgrades';
import type { ItemId } from './data/items';
import { ARMOR_TIERS, SWORD_TIERS } from './data/tiers';
import type { Enemy } from './entities/enemy';
import type { Fx } from './entities/fx';
import { Player } from './entities/player';
import type { Pickup } from './entities/pickup';
import type { Projectile } from './entities/projectile';
import { applyStatus } from './systems/status';
import { updateMines, updateOrbiters, updateProjectiles, updateZones } from './systems/combat';
import { updateEnemies } from './systems/enemyAI';
import { updateInteract, type PropState } from './systems/interact';
import { updateItems } from './systems/items';
import { xpToNext } from './systems/economy';
import { gainXp, type Card } from './systems/levelup';
import { Pathing } from './systems/pathing';
import { SpawnerState, updateSpawner } from './systems/spawner';
import { updateWeapons } from './systems/weapons';
import { newWeapon } from './weapons';
import type { WeaponId, WeaponState } from './weapons/types';
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

/** A damage pool on the ground (lingering potions, lava trail, poison clouds, frost). */
export interface Zone {
  x: number;
  y: number;
  r: number;
  t: number;
  dur: number;
  /** Damage per second to everything inside. */
  dps: number;
  tick: number;
  kind: 'burn' | 'poison' | 'wither' | 'frost' | 'harm';
  /** Movement factor applied to enemies inside (1 = none). */
  slowF: number;
  friendly: boolean;
}

/** A rod or blade circling the hero. */
export interface Orbiter {
  owner: WeaponId;
  angle: number;
  radius: number;
  speed: number;
  dmg: number;
  size: number;
  knock: number;
  /** Seconds before the same enemy can be hit again. */
  rehit: number;
  burn: boolean;
  style: 'rod' | 'blade';
  x: number;
  y: number;
  hitAt: Map<number, number>;
}

export interface ShieldState {
  has: boolean;
  ready: boolean;
  timer: number;
  cd: number;
  thorns: number;
  reflect: boolean;
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
  nextEnemyId = 1;
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  fx: Fx[] = [];
  mines: Mine[] = [];
  telegraphs: Telegraph[] = [];
  zones: Zone[] = [];
  orbiters: Orbiter[] = [];
  /** Sound events produced this frame; the screen plays and clears them. */
  events: SfxName[] = [];
  /** Deferred callbacks (beams, fangs, lightning): [seconds left, fn]. */
  scheduled: { t: number; fn: () => void }[] = [];
  weapons: WeaponState[] = [newWeapon('sword')];
  passives = new Map<PassiveId, number>();
  shield: ShieldState = { has: false, ready: false, timer: 0, cd: 8, thorns: 0, reflect: false };

  /** Spawn Eggs and Rare Spawn Eggs found this run (gacha tickets). */
  spawnEggs = 0;
  rareSpawnEggs = 0;
  /** Positions [x0, y0, x1, y1, ...] where damage landed this step; breakable props react to them. */
  hitPoints: number[] = [];
  propState = new Map<string, PropState>();
  /** Free enchantment choices waiting (enchanting tables) and which kind the open offer is. */
  bonusOffers = 0;
  offerKind: 'level' | 'enchant' = 'level';
  lavaT = 0;
  /** Timed buffs (beacons, ores): game time at which each ends. */
  buffs = { strength: 0, speed: 0, magnet: 0, haste: 0, lapis: 0, redstone: 0 };
  private buffTick = 0;
  private hadBuff = false;
  /** Equipped item (one per run), its cooldown, a queued swap choice and temporary buffs. */
  item: ItemId | null = null;
  itemCd = 0;
  pendingItem: ItemId | null = null;
  absorb = 0;
  resistUntil = 0;
  dash: { dx: number; dy: number; t: number } | null = null;
  /** Cursor position in world coordinates (set by the screen each frame). */
  targetX = 0;
  targetY = 0;

  /** Armor tier 0..7 and sword tier 0..6 (indices into ARMOR_TIERS / SWORD_TIERS). */
  armorTier = 0;
  swordTier = 0;

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

  mods: Mods = baseMods();
  /** Sword weapon multipliers from the sword tier. */
  swordDmg = 1;
  swordCd = 1;
  swordArea = 0;
  spawnMult = 1;
  /** Extra chance for spawns to be Charged (thunderstorms). */
  chargedBonus = 0;
  private dotAcc = 0;
  /** Base max HP before bonuses (Steve: 100 + 10%). */
  private readonly baseMaxHp = 110;

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
    this.recomputeStats();
    this.player.hp = this.player.maxHp;
  }

  xpNeeded(): number {
    return xpToNext(this.level);
  }

  addBuff(kind: keyof RunState['buffs'], seconds: number): void {
    this.buffs[kind] = this.time + seconds;
    this.recomputeStats();
  }

  get magnetRadius(): number {
    return 28 * this.mods.magnet;
  }

  /** Run `fn` after `delay` seconds of game time. */
  later(delay: number, fn: () => void): void {
    this.scheduled.push({ t: delay, fn });
  }

  emit(name: SfxName): void {
    if (this.events.length < 24) this.events.push(name);
  }

  biome(): BiomeId {
    return biomeState(this.time).current;
  }

  /** Hook for systems that react to kills (events, bosses...). */
  onKill(_e: Enemy): void {
    void _e;
  }

  /** Hook for systems that react to the hero being hurt. */
  onPlayerHurt(): void {}

  /** Rebuild every modifier from passives, tiers and items. */
  recomputeStats(): void {
    const m = baseMods();
    for (const [id, level] of this.passives) PASSIVES[id].apply(level, m);
    const armor = ARMOR_TIERS[this.armorTier];
    const sword = SWORD_TIERS[this.swordTier];
    if (armor) {
      m.armor += armor.armor;
      m.maxHpBonus += armor.hp;
      m.luck += armor.luck;
      m.regen += armor.regen;
    }
    if (this.item === 'rabbit_foot') m.luck += 0.15;
    const t = this.time;
    if (t < this.buffs.strength) m.dmg *= 2;
    if (t < this.buffs.speed) m.speed *= 1.45;
    if (t < this.buffs.magnet) m.magnet *= 4;
    if (t < this.buffs.haste) m.cd *= 0.6;
    if (t < this.buffs.redstone) m.cd *= 0.8;
    if (t < this.buffs.lapis) m.luck += 0.3;
    if (this.time < this.resistUntil) m.dmgTaken *= 0.5;
    if (sword) {
      m.burnChance += sword.burn;
      this.swordDmg = sword.dmg;
      this.swordCd = sword.cd;
      this.swordArea = sword.area;
    }
    m.cd = Math.max(0.35, m.cd);
    m.dmgTaken = Math.max(0.2, m.dmgTaken);
    this.mods = m;
    const p = this.player;
    const maxHp = this.baseMaxHp + m.maxHpBonus;
    if (maxHp !== p.maxHp) {
      const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
      p.maxHp = maxHp;
      p.hp = Math.min(maxHp, Math.max(1, ratio * maxHp));
    }
    p.armor = m.armor;
    p.speedMult = m.speed;
    p.regen = m.regen;
  }

  passiveLevel(id: PassiveId): number {
    return this.passives.get(id) ?? 0;
  }

  /** One fixed simulation step. Frozen while a level-up offer is open (the screen stops calling it). */
  update(dt: number, input: InputSource): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - 14 * dt);
    const p = this.player;
    updateItems(this, dt);
    p.update(dt, input, this.world, this.biome(), this.mods.waterImmune);
    if (p.dead) {
      if (this.status !== 'dead') this.emit('death');
      this.status = 'dead';
      this.deadT += dt;
    }
    this.pathing.update(dt, p.x, p.y, this.world, this.biome());
    if (!p.dead) updateSpawner(this, dt);

    this.hash.clear();
    for (const e of this.enemies) if (!e.dying) this.hash.insert(e);

    this.frostAura();
    updateEnemies(this, dt);
    updateWeapons(this, dt);
    updateProjectiles(this, dt);
    updateMines(this, dt);
    updateZones(this, dt);
    updateOrbiters(this, dt);
    updateInteract(this, dt);
    this.buffTick -= dt;
    if (this.buffTick <= 0) {
      this.buffTick = 0.5;
      const live = Object.values(this.buffs).some((b) => b > this.time);
      if (live || this.hadBuff) this.recomputeStats();
      this.hadBuff = live;
    }
    this.updatePickups(dt);
    this.updateFx(dt);
    this.updateDot(dt);
    for (const s of this.scheduled) s.t -= dt;
    const due = this.scheduled.filter((s) => s.t <= 0);
    if (due.length > 0) {
      this.scheduled = this.scheduled.filter((s) => s.t > 0);
      for (const s of due) s.fn();
    }
  }

  /** Poison and wither ticks on the hero (every 0.5 s). */
  private updateDot(dt: number): void {
    const p = this.player;
    if (p.dotT <= 0 || p.dead) return;
    p.dotT -= dt;
    this.dotAcc += dt;
    while (this.dotAcc >= 0.5) {
      this.dotAcc -= 0.5;
      const dmg = p.dotDps * 0.5;
      p.hp -= dmg;
      if (p.dotKind === 'poison') p.hp = Math.max(1, p.hp);
      else if (p.hp <= 0) {
        p.hp = 0;
        p.dead = true;
      }
    }
    if (p.dotT <= 0) p.dotDps = 0;
  }

  /** Frost Walker: enemies close to the hero are slowed. */
  private frostAura(): void {
    const r = this.mods.frost;
    if (r <= 0 || this.player.dead) return;
    const near: Enemy[] = [];
    this.hash.query(this.player.x, this.player.y, r, near);
    for (const e of near) if (!e.dying) applyStatus(e, 'slow', 0.4, 0.6);
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
