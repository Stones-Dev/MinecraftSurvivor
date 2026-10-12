/** Run state and the fixed-step simulation (everything gameplay; rendering lives in ui/ and world/renderer). */
import type { SfxName } from './core/audio';
import type { InputSource } from './core/input';
import { Rng } from './core/rng';
import { SpatialHash } from './core/spatialhash';
import { baseMods, PASSIVES, type Mods, type PassiveId } from './data/upgrades';
import type { ItemId } from './data/items';
import { ARMOR_TIERS, SWORD_TIERS } from './data/tiers';
import type { Enemy } from './entities/enemy';
import { makeFx, type Fx } from './entities/fx';
import { Player } from './entities/player';
import type { Pickup } from './entities/pickup';
import type { Projectile } from './entities/projectile';
import { applyStatus } from './systems/status';
import { updateMines, updateOrbiters, updateProjectiles, updateZones } from './systems/combat';
import { updateEnemies } from './systems/enemyAI';
import { DirectorState, initDirector, onEnemyKilled, updateDirector } from './systems/director';
import { type Npc, type RescueMarker, updateNpcs } from './systems/npcs';
import { Ally, PetState } from './entities/ally';
import { defaultLoadout, applyLoadoutMods, heroBaseHp, type RunLoadout } from './systems/meta';
import { spawnCompanions, updateAllies, updatePet } from './systems/allies';
import { allyById, heroById } from './data/companions';
import { RiftState, updateRift } from './systems/rift';
import { updateInteract, type PropState } from './systems/interact';
import { updateItems } from './systems/items';
import { xpToNext } from './systems/economy';
import { gainXp, type Card } from './systems/levelup';
import { Pathing } from './systems/pathing';
import { SpawnerState, updateSpawner } from './systems/spawner';
import { updateWeapons } from './systems/weapons';
import { MAX_WEAPON_LEVEL, newWeapon } from './weapons';
import type { WeaponId, WeaponState } from './weapons/types';
import { BIOMES, type BiomeId, type BiomeState } from './world/biomes';
import type { Prop } from './world/props';
import { findBiomeGround, World } from './world/world';

/** Seconds the hero must stay in a new biome before it counts (border hysteresis). */
const BIOME_SETTLE = 1;
/** Minimum seconds between two "Entering <biome>" banners. */
const BIOME_BANNER_GAP = 8;

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

const MAX_PICKUPS = 300;

function lerpPos(prev: number, cur: number, a: number): number {
  return prev !== prev ? cur : prev + (cur - prev) * a;
}

export class RunState {
  readonly rng: { spawn: Rng; drops: Rng; levelup: Rng; ai: Rng; fx: Rng; events: Rng };
  /** The world being played: the overworld, or the arena while a rift is active. */
  world: World;
  readonly overworld: World;
  readonly arenaWorld: World;
  readonly rift = new RiftState();
  npcs: Npc[] = [];
  rescue: RescueMarker | null = null;
  readonly player = new Player();
  readonly pathing = new Pathing();
  readonly hash = new SpatialHash<Enemy>(32);
  readonly spawner = new SpawnerState();
  readonly director = new DirectorState();
  /** Short announcements shown under the timer. */
  banners: { text: string; color: string; t: number; dur: number }[] = [];
  bossKills = 0;
  miniKills = 0;
  /** True once the Warden has fallen (Endless continues afterwards). */
  won = false;
  victoryShown = false;
  storm = false;
  /** White lightning flash alpha (decays). */
  flash = 0;

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
  /** Seconds of Warden darkness left (the view shrinks). */
  darkness = 0;
  /** Timed buffs (beacons, ores): game time at which each ends. */
  buffs = { strength: 0, speed: 0, magnet: 0, haste: 0, lapis: 0, redstone: 0 };
  private buffTick = 0;
  private hadBuff = false;
  /** Equipped item (one per run), its cooldown, a queued swap choice and temporary buffs. */
  item: ItemId | null = null;
  itemCd = 0;
  pendingItem: ItemId | null = null;
  /** Item offers that arrived while another choice was open. */
  pendingQueue: ItemId[] = [];
  nextNpcId = 1;
  /** Visual quality tier 0 (low) .. 2 (high); set by the screen, read by particle and text spawners. */
  quality: 0 | 1 | 2 = 2;
  /** Traps and ground hazards near the hero, refreshed a few times per second. */
  hazards: Prop[] = [];
  hazardT = 0;
  absorb = 0;
  resistUntil = 0;
  dash: { dx: number; dy: number; t: number } | null = null;
  /** Cursor position in world coordinates (set by the screen each frame). */
  targetX = 0;
  targetY = 0;

  /** Armor tier 0..7 and sword tier 0..6 (indices into ARMOR_TIERS / SWORD_TIERS). */
  armorTier = 0;
  /** Cards already spent on the next armor tier (tiers cost 2 cards, Steve's Builder's Grit makes it 1). */
  armorProgress = 0;
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
  baseMaxHp = 110;
  /** The hero's active ability (Q) and its cooldown / usage state. */
  readonly abilityId: string | null;
  ability = { cd: 0, castCount: 0 };

  /** Cards one armor tier costs: 2 for everyone, 1 for Steve (Builder's Grit). */
  armorCardCost(): number {
    return this.loadout.hero === 'steve' ? 1 : 2;
  }

  /** Seconds the hero has stood still (Turtle shield). */
  stillT = 0;
  /** Hostile-free companions: allies (fight, can be downed) and the pet. */
  allies: Ally[] = [];
  pet: PetState | null = null;
  /** Whether Steve's free Leather tier at minute 1 has been handed out. */
  private freeLeather = false;
  /** Biome banner state: the biome last announced (or started in), a candidate and its dwell time. */
  private shownBiome: BiomeId = 'plains';
  private biomeCand: BiomeId = 'plains';
  private biomeCandT = 0;
  private biomeBannerT = -Infinity;

  constructor(
    readonly seed: number,
    startTime = 0,
    readonly loadout: RunLoadout = defaultLoadout(),
  ) {
    const root = new Rng(seed);
    this.rng = {
      spawn: root.fork('spawn'),
      drops: root.fork('drops'),
      levelup: root.fork('levelup'),
      ai: root.fork('ai'),
      fx: root.fork('fx'),
      events: root.fork('events'),
    };
    this.overworld = new World(seed);
    this.arenaWorld = new World(seed ^ 0x51ed27, { r: 22 });
    this.world = this.overworld;
    this.time = startTime;
    this.baseMaxHp = heroBaseHp(loadout.hero);
    this.abilityId = heroById(loadout.hero).ability;
    initDirector(this);
    this.applyLoadoutStart();
    this.recomputeStats();
    this.player.hp = this.player.maxHp;
    this.absorb = this.mods.turtleShield;
    spawnCompanions(this, loadout);
  }

  /** One-time run-start effects of the hero, allies and permanent upgrades. */
  private applyLoadoutStart(): void {
    const l = this.loadout;
    this.rerolls = 1 + (l.upgrades['reroll'] ?? 0);
    if (l.hero === 'alex') {
      const bow = newWeapon('bow');
      bow.level = 2;
      this.weapons.push(bow);
    }
    if ((l.upgrades['repertoire'] ?? 0) > 0) {
      const pool = ['tnt', 'crossbow', 'snowball', 'trident', 'axe'] as const;
      const id = this.rng.drops.pick(pool);
      if (!this.weapons.some((w) => w.id === id)) this.weapons.push(newWeapon(id));
    }
    for (const a of l.allies) {
      const role = allyById(a.id)?.role;
      if (role === 'weaponsmith') this.swordTier = Math.max(this.swordTier, 2);
      else if (role === 'armorer' && this.armorTier < 2) this.armorTier = 2;
      else if (role === 'librarian') this.offerSize = 4;
      else if (role === 'fletcher') {
        const bow = this.weapons.find((w) => w.id === 'bow');
        if (bow) bow.level = Math.min(MAX_WEAPON_LEVEL, bow.level + 1);
        else this.weapons.push(newWeapon('bow'));
      }
    }
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

  /** The biome under the hero (spatial biome map; Nether while the rift is active). */
  biome(): BiomeId {
    return this.rift.active ? 'nether' : this.world.biomeAtPx(this.player.x, this.player.y);
  }

  /** The hero's biome as a render state (no crossfade any more: chunks bake their own biomes). */
  biomeState(): BiomeState {
    return { current: this.biome(), previous: null, fade: 1 };
  }

  /**
   * Debug start (`?biome=<id>`): move the hero (and companions) to the nearest dry ground inside that
   * biome, found by a deterministic spiral from the origin. Returns false when none is in range.
   */
  startInBiome(biome: BiomeId): boolean {
    if (biome === 'nether') return false;
    const spot = findBiomeGround(this.overworld, biome);
    if (!spot) return false;
    const p = this.player;
    const dx = spot.x - p.x;
    const dy = spot.y - p.y;
    p.x = spot.x;
    p.y = spot.y;
    p.snap();
    for (const a of this.allies) {
      a.x += dx;
      a.y += dy;
      a.prevX = a.prevY = Number.NaN;
    }
    if (this.pet) {
      this.pet.x += dx;
      this.pet.y += dy;
      this.pet.prevX = this.pet.prevY = Number.NaN;
    }
    this.shownBiome = this.biomeCand = biome;
    return true;
  }

  /** "Entering <biome>" banner, with hysteresis so walking along a border does not spam it. */
  private updateBiomeBanner(dt: number): void {
    if (this.rift.active) return;
    const b = this.biome();
    if (b === this.shownBiome) {
      this.biomeCandT = 0;
      return;
    }
    if (b !== this.biomeCand) {
      this.biomeCand = b;
      this.biomeCandT = 0;
    }
    this.biomeCandT += dt;
    if (this.biomeCandT < BIOME_SETTLE) return;
    this.shownBiome = b;
    if (this.time - this.biomeBannerT < BIOME_BANNER_GAP) return;
    this.biomeBannerT = this.time;
    const [r, g, bl] = BIOMES[b].grass[1];
    this.announce(`Entering ${BIOMES[b].name}`, `rgb(${r},${g},${bl})`, 2.5);
  }

  /** Called for every rewarded kill (bosses, mini-bosses, banner carriers). */
  onKill(e: Enemy): void {
    onEnemyKilled(this, e);
  }

  announce(text: string, color: string, seconds: number): void {
    this.banners.push({ text, color, t: 0, dur: seconds });
    if (this.banners.length > 3) this.banners.shift();
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
    if (this.director.goldenUntil > t) {
      m.xpMult += 1;
      m.lootMult *= 2;
    }
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
    applyLoadoutMods(this.loadout, m);
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
    this.snapshotPrev();
    this.time += dt;
    this.shake = Math.max(0, this.shake - 14 * dt);
    this.darkness = Math.max(0, this.darkness - dt);
    this.flash = Math.max(0, this.flash - dt * 1.5);
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter((b) => b.t < b.dur);
    const p = this.player;
    updateRift(this, dt);
    updateItems(this, dt);
    p.update(dt, input, this.world, this.biome(), this.mods.waterImmune);
    if (p.dead) {
      if (this.status !== 'dead') this.emit('death');
      this.status = 'dead';
      this.deadT += dt;
    }
    this.pathing.update(dt, p.x, p.y, this.world);
    this.updateBiomeBanner(dt);
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
    updateDirector(this, dt);
    updateNpcs(this, dt);
    updateAllies(this, dt);
    updatePet(this, dt);
    this.updateHeroPassives(dt);
    this.ability.cd = Math.max(0, this.ability.cd - dt);
    if (p.footfall && !p.dead) {
      this.emit('step');
      if (this.quality > 0 && this.world.surface(p.x, p.y, this.biome()) === 'ground') {
        const f = this.rng.fx;
        this.fx.push(
          makeFx('spark', p.x - p.facing * 3, p.y - 1, 0.28, {
            vx: -p.facing * 10 + f.range(-6, 6),
            vy: f.range(-20, -9),
            color: '#c9b98f',
          }),
        );
      }
    }
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

  /** Remember where everything was at the start of this step (the render blends previous and current). */
  private snapshotPrev(): void {
    const p = this.player;
    p.prevX = p.x;
    p.prevY = p.y;
    for (const e of this.enemies) {
      e.prevX = e.x;
      e.prevY = e.y;
    }
    for (const a of this.allies) {
      a.prevX = a.x;
      a.prevY = a.y;
    }
    const pet = this.pet;
    if (pet) {
      pet.prevX = pet.x;
      pet.prevY = pet.y;
    }
    for (const pk of this.pickups) {
      pk.prevX = pk.x;
      pk.prevY = pk.y;
    }
  }

  /**
   * Fill the render positions (`rx`, `ry`) by blending the previous and the current simulation step.
   * `alpha` is the fraction of the next step that has elapsed (0..1); NaN previous positions (just spawned
   * or teleported) render at the current position.
   */
  interpolate(alpha: number): void {
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    const p = this.player;
    p.rx = lerpPos(p.prevX, p.x, a);
    p.ry = lerpPos(p.prevY, p.y, a);
    for (const e of this.enemies) {
      e.rx = lerpPos(e.prevX, e.x, a);
      e.ry = lerpPos(e.prevY, e.y, a);
    }
    for (const al of this.allies) {
      al.rx = lerpPos(al.prevX, al.x, a);
      al.ry = lerpPos(al.prevY, al.y, a);
    }
    const pet = this.pet;
    if (pet) {
      pet.rx = lerpPos(pet.prevX, pet.x, a);
      pet.ry = lerpPos(pet.prevY, pet.y, a);
    }
    for (const pk of this.pickups) {
      pk.rx = lerpPos(pk.prevX, pk.x, a);
      pk.ry = lerpPos(pk.prevY, pk.y, a);
    }
    for (const pr of this.projectiles) {
      pr.rx = pr.px + (pr.x - pr.px) * a;
      pr.ry = pr.py + (pr.y - pr.py) * a;
    }
  }

  /** Steve's free Leather tier at minute 1 and the Turtle's shield that refills while standing still. */
  private updateHeroPassives(dt: number): void {
    const p = this.player;
    if (this.loadout.hero === 'steve' && !this.freeLeather && this.time >= 60) {
      this.freeLeather = true;
      if (this.armorTier === 0) {
        this.armorTier = 1;
        this.armorProgress = 0;
        this.recomputeStats();
        this.announce("Builder's Grit: free Leather armor", '#c8a06a', 3);
      }
    }
    if (this.mods.turtleShield > 0 && !p.dead) {
      this.stillT = p.moving ? 0 : this.stillT + dt;
      if (this.stillT >= 2 && this.absorb < this.mods.turtleShield) {
        this.absorb = Math.min(
          this.mods.turtleShield,
          this.absorb + this.mods.turtleShield * 0.5 * dt,
        );
      }
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
    // Uncollected orbs never despawn; past a cap the oldest are banked so thousands cannot pile up.
    if (this.pickups.length > MAX_PICKUPS) {
      let excess = this.pickups.length - MAX_PICKUPS;
      for (const pk of this.pickups) {
        if (excess <= 0) break;
        if (pk.kind === 'xp' && !p.dead) {
          gainXp(this, pk.value);
          pk.vx = pk.vy = Number.NaN;
          excess--;
        }
      }
      this.pickups = this.pickups.filter((pk) => !Number.isNaN(pk.vx));
    }
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
