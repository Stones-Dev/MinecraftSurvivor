/**
 * The End (optional endgame, after the Warden at 15:00): a permanent End portal opens where the Warden falls;
 * entering swaps the run into a floating end-stone island (a `World` with arena kind 'end') exactly like the
 * Nether rift does (stash the overworld, restore it on leave), and the fight is against the Ender Dragon.
 *
 * Rules here: the void ring around the island kills instantly (a Totem of Undying is the only exception and
 * brings the hero back to the middle with a tenth of their health), six obsidian pillars carry End Crystals
 * that heal the dragon (two are caged), the dragon's death rains XP, lays the Dragon Egg and opens the exit
 * portal, which ends the run with the final victory. The dragon's moves live in systems/dragonAI.ts.
 */
import { hpScale, dmgScale } from '../data/enemies';
import {
  CAGED_PILLARS,
  CAGE_HP,
  CRYSTAL_BASE_HP,
  CRYSTAL_BLAST_DMG,
  CRYSTAL_BLAST_RADIUS,
  CRYSTAL_DEF,
  CRYSTAL_STUN,
  DRAGON_BASE_DMG,
  DRAGON_BASE_HP,
  DRAGON_HP_MULT,
  DRAGON_DEF,
  DragonBrain,
  cageFactor,
  crystalHealRate,
  dragonScale,
  dragonFactor,
  inFront,
  isMeleeOrigin,
  orbitPoint,
  phaseFor,
  type DragonPhase,
} from '../entities/bossDragon';
import { Enemy } from '../entities/enemy';
import { makeFx } from '../entities/fx';
import { Pickup } from '../entities/pickup';
import type { RunState } from '../game';
import {
  END_ISLAND_TILES,
  END_PILLAR_COUNT,
  TILE,
  TILE_PX,
  endPillarCentre,
} from '../world/terrain';
import { World } from '../world/world';
import { gatherCompanions } from './allies';
import { explode, hurtPlayer, killEnemy } from './combat';
import { xpToNext } from './economy';

/** Radius (px) of the island: tiles at or beyond it are void. */
export const END_ISLAND_PX = END_ISLAND_TILES * TILE_PX;
/** Arena radius in tiles of the End world (bounds flying things; the island is smaller). */
export const END_ARENA_TILES = 44;
/** The hero enters a portal when closer than this. */
export const PORTAL_ENTER_R = 16;
/** Seconds the hero must stand in the portal before it takes him: the End is a one-way trip. */
export const PORTAL_DWELL_S = 0.8;

/** Next dwell time of the End portal: grows while the hero stands in it, resets the moment he leaves. */
export function stepPortalDwell(dwell: number, dt: number, inside: boolean): number {
  return inside ? dwell + dt : 0;
}
/** How far above its pillar's foot a crystal floats, and the pillar's collision radius. */
export const PILLAR_LIFT = 52;
export const PILLAR_RADIUS = 12;
/** Where the exit portal and the egg appear, and where the dragon perches. */
export const EXIT_PORTAL = { x: 0, y: 100 } as const;
export const EGG_SPOT = { x: 0, y: -2 } as const;
export const PERCH_SPOT = { x: 0, y: -8 } as const;
/** Where the hero starts, and where a totem or a respawning companion puts them. */
export const END_START = { x: 0, y: 70 } as const;
/** Seconds the dragon's death animation lasts before the egg and the exit portal appear. */
export const DEATH_ANIM = 4.5;
/** Emeralds for the Dragon Egg (the Baby Dragon pet would need atlas art: see docs/DECISIONS.md) and the victory. */
export const EGG_EMERALDS = 1000;
export const VICTORY_EMERALDS = 1500;
/** XP orbs of the death shower and the ceiling of the shower's total. */
const XP_ORBS = 36;
export const XP_SHOWER_CAP = 5000;
export const XP_SHOWER_LEVELS = 3;
/** Fraction of max HP (one heart of twenty is a tenth) the totem leaves the hero with. */
export const TOTEM_HP_FRACTION = 0.1;
const KNOCK_TIME = 0.28;

interface Stash {
  enemies: Enemy[];
  projectiles: RunState['projectiles'];
  pickups: RunState['pickups'];
  zones: RunState['zones'];
  mines: RunState['mines'];
  telegraphs: RunState['telegraphs'];
  orbiters: RunState['orbiters'];
  npcs: RunState['npcs'];
  scheduled: RunState['scheduled'];
  decoys: RunState['decoys'];
  x: number;
  y: number;
  world: World;
}

export interface EndCrystal {
  e: Enemy;
  pillar: number;
  /** Iron bars around it: they soak hits (x0.25, full from blasts and heavy hits) until `cageHp` is gone. */
  caged: boolean;
  cageHp: number;
  /** The destruction has been processed. */
  done: boolean;
  /** Damage of the blast when it bursts, to a hero standing next to it (the crystal itself never touches anyone). */
  blast: number;
}

export interface EndPillar {
  x: number;
  y: number;
  r: number;
}

export class EndState {
  /** The permanent portal in the overworld (set when the Warden dies). */
  portal: {
    x: number;
    y: number;
    armed: boolean;
    t: number;
    /** Seconds the hero has stood inside the portal (0 once he steps out): entering needs PORTAL_DWELL_S. */
    dwell: number;
    /** Cooldown of the floating 'Hold to enter' hint. */
    hint: number;
  } | null = null;
  active = false;
  stash: Stash | null = null;
  crystals: EndCrystal[] = [];
  pillars: EndPillar[] = [];
  dragon: Enemy | null = null;
  readonly brain = new DragonBrain();
  /** Seconds since the dragon fell (-1 while it lives); the death animation and the XP shower run on it. */
  deathT = -1;
  deathX = 0;
  deathY = 0;
  orbsLeft = 0;
  orbValue = 0;
  egg: { x: number; y: number; taken: boolean } | null = null;
  exit: { x: number; y: number } | null = null;
  /** The exit portal was taken: the final victory overlay is due. */
  victory = false;
  victoryShown = false;
  time = 0;
  voidFalls = 0;
  totemSaves = 0;
  /** Hero knockback in progress (dive hits). */
  kb = { ux: 0, uy: 0, left: 0, v0: 0 };
  /** Seconds before another "Caged!" text. */
  cageMsgT = 0;
  /**
   * The dragon or crystal whose last hit the gate turned to 0 (out of reach, caged, dying). Hit side effects
   * that follow `damageEnemy` (burn/poison from `onHitMods`, projectile statuses) must not apply to it.
   */
  blocked: Enemy | null = null;

  /** Number of crystals still standing. */
  crystalsAlive(): number {
    let n = 0;
    for (const c of this.crystals) if (!c.done && !c.e.dying && c.e.hp > 0) n++;
    return n;
  }

  /**
   * Damage gate for the dragon and the crystals (called by `damageEnemy` for them): returns the damage that
   * lands. Flying dragons are out of reach of melee, perched ones deflect ranged hits (head hits crit), caged
   * crystals soak damage into their bars. See entities/bossDragon.ts for the rules.
   */
  gate(
    run: RunState,
    e: Enemy,
    dmg: number,
    fromX: number,
    fromY: number,
    knock: number,
    quiet: boolean,
    heavy: boolean,
  ): number {
    if (e.def.id === 'end_crystal') {
      const c = this.crystals.find((x) => x.e === e);
      if (!c || !c.caged) return dmg;
      c.cageHp -= dmg * cageFactor(knock, heavy);
      if (c.cageHp <= 0) {
        c.caged = false;
        run.announce('A cage is broken!', '#c9c9d4', 2.5);
        run.emit('explode');
        run.fx.push(makeFx('ring', e.x, e.y, 0.4, { r: 22, color: '#c9c9d4' }));
      } else if (this.cageMsgT <= 0 && !quiet) {
        this.cageMsgT = 0.8;
        run.fx.push(
          makeFx('text', e.x, e.y - 20, 0.8, { text: 'Caged!', vy: -14, color: '#c9c9d4' }),
        );
      }
      return 0;
    }
    const b = this.brain;
    if (b.bypass) return dmg;
    // Damage-over-time and zone ticks are ranged damage: the perch deflects them like arrows, and nothing lands
    // while the dragon dies. Melee-applied burn/poison never starts while it is out of reach (onHitMods).
    if (quiet) return dmg * dragonFactor(b.mode, false);
    const p = run.player;
    const melee = isMeleeOrigin(fromX, fromY, p.x, p.y, run.allies);
    const f = dragonFactor(b.mode, melee);
    if (f <= 0) {
      if (b.gateMsgT <= 0) {
        b.gateMsgT = 1.2;
        run.fx.push(
          makeFx('text', e.x, e.y - 52, 0.9, { text: 'Out of reach!', vy: -14, color: '#c9a0ff' }),
        );
      }
      return 0;
    }
    let out = dmg * f;
    if (f < 1 && b.gateMsgT <= 0) {
      b.gateMsgT = 1.2;
      run.fx.push(
        makeFx('text', e.x, e.y - 52, 0.9, { text: 'Deflected!', vy: -14, color: '#c9a0ff' }),
      );
    }
    if (melee && b.mode === 'perch' && inFront(b.face, p.x - e.x, p.y - e.y)) {
      out *= 2;
      run.fx.push(makeFx('text', e.x, e.y - 52, 0.9, { text: 'HEAD!', vy: -18, color: '#ffd84a' }));
    }
    return out;
  }
}

// ---------------------------------------------------------------------------------------------------
// The overworld portal

/** A walkable spot near (x, y): the point itself when it is dry ground, else the nearest one on a spiral. */
function groundNear(run: RunState, x: number, y: number): { x: number; y: number } {
  const ok = (px: number, py: number): boolean =>
    run.world.surface(px, py) === 'ground' && !run.world.overlapsSolid(px, py, 14);
  if (ok(x, y)) return { x, y };
  for (let r = 16; r <= 160; r += 16) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (ok(px, py)) return { x: px, y: py };
    }
  }
  return { x, y };
}

/** Open the End portal (once per run) where the Warden fell. */
export function spawnEndPortal(run: RunState, x: number, y: number): void {
  const end = run.end;
  if (end.portal || end.active || end.deathT >= 0) return;
  const at = groundNear(run, x, y);
  end.portal = { x: at.x, y: at.y, armed: false, t: 0, dwell: 0, hint: 0 };
  run.announce('An End portal has opened!', '#df7cff', 5);
  run.emit('portal');
}

// ---------------------------------------------------------------------------------------------------
// Entering and leaving

function newCrystal(run: RunState, pillar: number): EndCrystal {
  const c = endPillarCentre(pillar);
  const e = new Enemy(CRYSTAL_DEF, run.nextEnemyId++);
  e.x = c.x;
  e.y = c.y - PILLAR_LIFT;
  e.maxHp = CRYSTAL_BASE_HP * hpScale(run.time / 60);
  e.hp = e.maxHp;
  e.dmg = 0;
  e.cd = 999;
  run.enemies.push(e);
  const caged = CAGED_PILLARS.includes(pillar);
  const blast = CRYSTAL_DEF.dmg * dmgScale(run.time / 60);
  return { e, pillar, caged, cageHp: caged ? CAGE_HP : 0, done: false, blast };
}

/** Make the dragon (HP and damage follow the Warden's difficulty curve) and put it on its orbit. */
export function makeDragon(run: RunState): Enemy {
  const minute = run.time / 60;
  const e = new Enemy(DRAGON_DEF, run.nextEnemyId++);
  e.maxHp = DRAGON_BASE_HP * hpScale(minute) * DRAGON_HP_MULT;
  e.hp = e.maxHp;
  e.dmg = DRAGON_BASE_DMG * dmgScale(minute);
  e.boss = 'boss';
  e.cd = 2;
  const p = orbitPoint(run.end.brain.theta);
  e.x = p.x;
  e.y = p.y;
  e.prevX = Number.NaN;
  run.enemies.push(e);
  return e;
}

/** Swap the run into the End: the island, six pillars with crystals, the dragon. */
export function enterEnd(run: RunState, dragonPct = 100): void {
  const end = run.end;
  const p = run.player;
  if (end.active) return;
  end.stash = {
    enemies: run.enemies,
    projectiles: run.projectiles,
    pickups: run.pickups,
    zones: run.zones,
    mines: run.mines,
    telegraphs: run.telegraphs,
    orbiters: run.orbiters,
    npcs: run.npcs,
    scheduled: run.scheduled,
    decoys: run.decoys,
    x: p.x,
    y: p.y,
    world: run.world,
  };
  run.enemies = [];
  run.projectiles = [];
  run.pickups = [];
  run.zones = [];
  run.mines = [];
  run.telegraphs = [];
  run.orbiters = [];
  run.npcs = [];
  run.scheduled = [];
  run.decoys = [];
  run.hazardT = 0;
  run.storm = false;
  run.chargedBonus = 0;
  run.darkness = 0;
  run.rescue = null;
  const w = run.endWorld;
  end.pillars = Array.from({ length: END_PILLAR_COUNT }, (_, i) => {
    const c = endPillarCentre(i);
    return { x: c.x, y: c.y, r: PILLAR_RADIUS };
  });
  w.solids = end.pillars.map((q) => ({ x: q.x, y: q.y, r: q.r }));
  run.world = w;
  end.active = true;
  end.time = 0;
  end.deathT = -1;
  end.egg = null;
  end.exit = null;
  end.kb.left = 0;
  p.x = END_START.x;
  p.y = END_START.y;
  p.snap();
  p.vx = p.vy = 0;
  p.iframes = 3;
  gatherCompanions(run);
  end.crystals = Array.from({ length: END_PILLAR_COUNT }, (_, i) => newCrystal(run, i));
  end.dragon = makeDragon(run);
  const pct = Math.max(1, Math.min(100, dragonPct)) / 100;
  end.dragon.hp = end.dragon.maxHp * pct;
  const b = end.brain;
  b.phase = phaseFor(pct, end.crystalsAlive());
  b.mode = 'orbit';
  b.spitT = 3;
  b.diveCd = 6;
  b.halfT = 0;
  if (b.phase === 3) {
    b.mode = 'perch';
    b.halfT = 10;
    end.dragon.x = PERCH_SPOT.x;
    end.dragon.y = PERCH_SPOT.y;
  }
  run.announce('The End: mind the void, break the crystals', '#df7cff', 5);
  run.emit('portal');
  run.fx.push(makeFx('ring', p.x, p.y, 0.7, { r: 44, color: '#df7cff' }));
}

/**
 * Restore the overworld run state (hero position, enemies, pickups, zones, companions) and leave the End.
 * Used by the exit portal (the final victory follows) and by tests. `keepLoot` brings the End's pickups along.
 */
export function leaveEnd(run: RunState, keepLoot = true): void {
  const end = run.end;
  const s = end.stash;
  const p = run.player;
  if (!s || !end.active) return;
  // Callbacks queued in the End are bound to its positions: flush them while the End is still the world.
  const pending = run.scheduled;
  run.scheduled = [];
  for (const q of pending) q.fn();
  const loot = run.pickups;
  run.enemies = s.enemies;
  run.projectiles = s.projectiles;
  run.pickups = s.pickups;
  run.zones = s.zones;
  run.mines = s.mines;
  run.telegraphs = s.telegraphs;
  run.orbiters = s.orbiters;
  run.npcs = s.npcs;
  run.scheduled = s.scheduled;
  run.decoys = s.decoys;
  run.hazardT = 0;
  run.world = s.world;
  run.endWorld.solids = [];
  p.x = s.x;
  p.y = s.y;
  p.snap();
  p.vx = p.vy = 0;
  p.iframes = 2;
  p.dotT = 0;
  p.dotDps = 0;
  gatherCompanions(run);
  if (keepLoot) {
    for (const pk of loot) {
      pk.x = p.x;
      pk.y = p.y;
      pk.prevX = Number.NaN;
      pk.magnet = true;
      run.pickups.push(pk);
    }
  }
  end.stash = null;
  end.active = false;
  end.crystals = [];
  end.dragon = null;
  end.kb.left = 0;
}

// ---------------------------------------------------------------------------------------------------
// The void

/** Is a point of the End on the void (beyond the island's edge)? */
export function isVoid(world: World, x: number, y: number): boolean {
  return world.tileAtPx(x, y) === TILE.VOID;
}

/**
 * Shorten an automatic move (dash, lunge, Phase Step) so that, in the End, it never ends over the void: walks
 * the segment in steps of at most 4 px and stops at the last position whose point (and a few px ahead of it)
 * is still island. Outside the End the target is returned unchanged. Deliberate dashes are stopped at the
 * rim too, never dropped into the void.
 */
export function keepOnIsland(
  run: RunState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { x: number; y: number } {
  if (!run.end.active) return { x: x1, y: y1 };
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: x1, y: y1 };
  const ux = dx / len;
  const uy = dy / len;
  const n = Math.max(1, Math.ceil(len / 4));
  let lx = x0;
  let ly = y0;
  for (let i = 1; i <= n; i++) {
    const px = x0 + (dx * i) / n;
    const py = y0 + (dy * i) / n;
    if (
      isVoid(run.world, px, py) ||
      isVoid(run.world, px + ux * VOID_MARGIN_PX, py + uy * VOID_MARGIN_PX)
    )
      break;
    lx = px;
    ly = py;
  }
  return { x: lx, y: ly };
}

/** Look-ahead of `keepOnIsland`: a lunge stops this far before the rim. */
const VOID_MARGIN_PX = 3;

/** The hero has fallen off the island: a Totem of Undying saves them once, anything else is instant death. */
function voidFall(run: RunState): void {
  const p = run.player;
  const end = run.end;
  end.voidFalls++;
  if (run.item === 'totem') {
    run.item = null;
    end.totemSaves++;
    p.x = END_START.x;
    p.y = END_START.y;
    p.snap();
    p.vx = p.vy = 0;
    p.hp = Math.max(1, Math.round(p.maxHp * TOTEM_HP_FRACTION));
    p.iframes = 3;
    p.dotT = 0;
    p.dotDps = 0;
    end.kb.left = 0;
    gatherCompanions(run);
    run.announce('Totem of Undying!', '#ffe27a', 3);
    run.fx.push(makeFx('ring', p.x, p.y - 8, 0.7, { r: 46, color: '#ffe27a' }));
    run.emit('levelup');
    return;
  }
  // Armour does not help: the hero is simply gone.
  p.hp = 0;
  p.dead = true;
  run.status = 'dead';
  run.emit('death');
  run.announce('Fell into the void!', '#ff6b6b', 4);
}

/** Companions that end up over the void (a knocked-about ally, a pet chasing the hero) respawn at the middle. */
function guardCompanions(run: RunState): void {
  const limit = END_ISLAND_PX - 14;
  for (const a of run.allies) {
    if (Math.hypot(a.x, a.y) > limit) {
      a.x = (a.slot === 0 ? 1 : -1) * 28;
      a.y = 54;
      a.prevX = Number.NaN;
    }
  }
  const pet = run.pet;
  if (pet && Math.hypot(pet.x, pet.y) > limit) {
    pet.x = -22;
    pet.y = 58;
    pet.prevX = Number.NaN;
  }
}

// ---------------------------------------------------------------------------------------------------
// Crystals

/** The dragon is healing and a crystal that feeds it just broke: it overloads. */
function crystalOverload(run: RunState, dragon: Enemy): void {
  const b = run.end.brain;
  const dmg = CRYSTAL_BLAST_DMG * dragonScale(dragon.maxHp);
  run.fx.push(
    makeFx('ring', dragon.x, dragon.y - 20, 0.5, { r: CRYSTAL_BLAST_RADIUS, color: '#ff9af0' }),
  );
  run.fx.push(
    makeFx('ring', dragon.x, dragon.y - 20, 0.8, {
      r: CRYSTAL_BLAST_RADIUS * 0.6,
      color: '#ffffff',
    }),
  );
  run.shake = Math.max(run.shake, 6);
  run.emit('explode');
  b.bypass = true;
  // A direct hit: it lands whatever the dragon's mode, and the blast is not a melee hit.
  dragon.hp -= dmg;
  run.stats.damageDealt += dmg;
  run.fx.push(
    makeFx('text', dragon.x, dragon.y - 56, 1.2, {
      text: `${Math.round(dmg)}!`,
      vy: -22,
      color: '#ffd84a',
    }),
  );
  b.bypass = false;
  const p = run.player;
  if (!p.dead && Math.hypot(p.x - dragon.x, p.y - dragon.y) < CRYSTAL_BLAST_RADIUS + p.radius) {
    hurtPlayer(run, dragon.dmg * 0.5, dragon);
  }
  if (dragon.hp <= 0) {
    dragon.hp = 1;
    killEnemy(run, dragon, true);
    return;
  }
  b.mode = 'stunned';
  b.t = CRYSTAL_STUN;
  b.stunnedBy = 'crystal';
  run.announce('Crystal overload! The dragon is grounded!', '#ff9af0', 3);
}

function updateCrystals(run: RunState, dt: number): void {
  const end = run.end;
  const dragon = end.dragon;
  end.cageMsgT = Math.max(0, end.cageMsgT - dt);
  const dragonLive = dragon !== null && !dragon.dying && dragon.hp > 0;
  const healing = dragonLive && dragon.hp < dragon.maxHp;
  for (const c of end.crystals) {
    if (c.done) continue;
    if (c.e.dying || c.e.hp <= 0) {
      c.done = true;
      // The crystal bursts: a small blast that hurts a hero standing next to it.
      explode(run, c.e.x, c.e.y, 34, 0, c.blast * 0.8, null);
      if (end.crystalsAlive() === 0 && dragonLive) {
        run.announce('The last crystal is gone!', '#ff9af0', 4);
      }
      if (healing && dragon) crystalOverload(run, dragon);
      continue;
    }
    if (healing && dragon) {
      dragon.hp = Math.min(dragon.maxHp, dragon.hp + crystalHealRate(dragon.maxHp) * dt);
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// The dragon's death, the egg and the exit

/** XP the death shower is worth: about three levels of the hero's current level curve, capped at 5000. */
export function xpShowerTotal(run: Pick<RunState, 'level' | 'xp'>): number {
  let need = -run.xp;
  for (let i = 0; i < XP_SHOWER_LEVELS; i++) need += xpToNext(run.level + i);
  return Math.max(XP_ORBS, Math.min(XP_SHOWER_CAP, Math.ceil(need)));
}

/** Called by the director when the dragon dies (before its corpse is dropped). */
export function onDragonKilled(run: RunState, e: Enemy): void {
  const end = run.end;
  if (end.deathT >= 0) return;
  end.deathT = 0;
  end.deathX = e.x;
  end.deathY = e.y;
  end.brain.mode = 'dying';
  run.endDragonKilled = true;
  run.endKilledAt = run.time;
  end.orbsLeft = XP_ORBS;
  end.orbValue = xpShowerTotal(run) / XP_ORBS;
  // Whatever crystals still stand die with their master (no blast, no reward).
  for (const c of end.crystals) {
    if (!c.done && !c.e.dying) {
      c.done = true;
      killEnemy(run, c.e, false);
    }
  }
  run.announce('THE ENDER DRAGON IS DEAD!', '#df7cff', 6);
  run.emit('boss');
  run.flash = Math.max(run.flash, 0.25);
}

function updateDeath(run: RunState, dt: number): void {
  const end = run.end;
  if (end.deathT < 0) return;
  const before = end.deathT;
  end.deathT += dt;
  // Everything the dragon dropped (its own XP, emeralds) and the shower home in on the hero.
  for (const pk of run.pickups) pk.magnet = true;
  // The shower: orbs fly out of the rising dragon between 0.8 s and 3.4 s and home in on the hero.
  if (end.orbsLeft > 0 && end.deathT >= 0.8) {
    const due = Math.min(
      end.orbsLeft,
      Math.max(1, Math.ceil(((end.deathT - 0.8) / 2.6) * XP_ORBS) - (XP_ORBS - end.orbsLeft)),
    );
    for (let i = 0; i < due; i++) {
      const a = run.rng.fx.range(0, Math.PI * 2);
      const r = run.rng.fx.range(0, 26);
      const pk = new Pickup(
        'xp',
        end.deathX + Math.cos(a) * r,
        end.deathY - 30 - (end.deathT - 0.8) * 10 + Math.sin(a) * r * 0.6,
        end.orbValue,
      );
      pk.magnet = true;
      run.pickups.push(pk);
      end.orbsLeft--;
    }
  }
  if (before < DEATH_ANIM && end.deathT >= DEATH_ANIM) {
    end.egg = { x: EGG_SPOT.x, y: EGG_SPOT.y, taken: false };
    end.exit = { x: EXIT_PORTAL.x, y: EXIT_PORTAL.y };
    run.announce('The exit portal opens.', '#df7cff', 5);
    run.emit('portal');
  }
}

function updateEggAndExit(run: RunState): void {
  const end = run.end;
  const p = run.player;
  if (p.dead) return;
  const egg = end.egg;
  if (egg && !egg.taken && Math.hypot(p.x - egg.x, p.y - egg.y) < 14) {
    egg.taken = true;
    run.dragonEgg = true;
    run.emeraldsPicked += EGG_EMERALDS;
    run.announce('The Dragon Egg! The End?', '#df7cff', 5);
    run.fx.push(makeFx('ring', egg.x, egg.y, 0.8, { r: 36, color: '#df7cff' }));
    run.emit('legendary');
  }
  const ex = end.exit;
  if (ex && Math.hypot(p.x - ex.x, p.y - ex.y) < PORTAL_ENTER_R) finishEnd(run);
}

/** The exit portal was taken: back to the overworld state, then the final victory (the run ends there). */
export function finishEnd(run: RunState): void {
  const end = run.end;
  if (!end.active || end.victory) return;
  end.victory = true;
  run.victoryShown = true;
  run.won = true;
  run.endDragonKilled = true;
  run.emeraldsPicked += VICTORY_EMERALDS;
  run.rareSpawnEggs += 2;
  leaveEnd(run, true);
  run.emit('victory');
}

// ---------------------------------------------------------------------------------------------------
// Per-step update

function updateKnockback(run: RunState, dt: number): void {
  const kb = run.end.kb;
  if (kb.left <= 0) return;
  const p = run.player;
  const k = kb.left / KNOCK_TIME;
  const d = kb.v0 * k * dt;
  kb.left = Math.max(0, kb.left - dt);
  const r = run.world.collide(p.x + kb.ux * d, p.y + kb.uy * d, p.radius);
  p.x = r.x;
  p.y = r.y;
}

/** Shove the hero `dist` px along a unit direction over a quarter of a second (after a dive hit). */
export function knockHero(run: RunState, ux: number, uy: number, dist: number): void {
  const kb = run.end.kb;
  kb.ux = ux;
  kb.uy = uy;
  kb.left = KNOCK_TIME;
  kb.v0 = (2 * dist) / KNOCK_TIME;
}

export function updateEnd(run: RunState, dt: number): void {
  const end = run.end;
  const p = run.player;
  if (!end.active) {
    const portal = end.portal;
    if (!portal || p.dead || run.rift.active) return;
    portal.t += dt;
    const d = Math.hypot(p.x - portal.x, p.y - portal.y);
    // Armed once the hero has stepped away from where the Warden fell: never an accidental entry.
    if (d > 30) portal.armed = true;
    const inside = portal.armed && d < PORTAL_ENTER_R;
    portal.dwell = stepPortalDwell(portal.dwell, dt, inside);
    portal.hint = Math.max(0, portal.hint - dt);
    if (inside && portal.hint <= 0) {
      portal.hint = 1.4;
      run.fx.push(
        makeFx('text', portal.x, portal.y - 34, 1.5, {
          text: 'Hold to enter the End',
          vy: -6,
          color: '#df7cff',
        }),
      );
    }
    if (portal.dwell >= PORTAL_DWELL_S) enterEnd(run);
    return;
  }
  end.time += dt;
  if (p.dead) return;
  updateKnockback(run, dt);
  if (isVoid(run.world, p.x, p.y)) voidFall(run);
  if (p.dead) return;
  guardCompanions(run);
  updateCrystals(run, dt);
  updateDeath(run, dt);
  updateEggAndExit(run);
}

/** Debug (`?end`): jump straight into the End with the dragon at `pct` percent of its HP. */
export function debugEnterEnd(run: RunState, pct = 100): void {
  enterEnd(run, Math.max(1, pct));
  const p = run.player;
  p.iframes = 1;
  // `dragon=0`: the dragon is already dying (death animation, XP shower, egg and exit portal).
  if (pct <= 0 && run.end.dragon) {
    // A hero with a sky-high level, so that the XP shower (capped at 5000 XP) opens no level-up screen
    // in a visual check or a screenshot.
    run.level = Math.max(run.level, 5000);
    // It dies over the hero, so the rising and the beams are in view.
    run.end.dragon.x = run.player.x;
    run.end.dragon.y = run.player.y - 20;
    killEnemy(run, run.end.dragon, true);
  }
}

export type { DragonPhase };

/** The boss bar's second line: crystals left, and what can hurt the dragon right now. */
export function dragonStatus(end: EndState): { text: string; color: string } {
  const n = end.crystalsAlive();
  const mode = end.brain.mode;
  const crystals = n > 0 ? `Crystals ${n}/${END_PILLAR_COUNT}` : 'No crystals';
  if (mode === 'perch')
    return { text: `${crystals} - perched: melee, arrows bounce`, color: '#ffd84a' };
  if (mode === 'stunned' || mode === 'landing')
    return { text: `${crystals} - grounded: hit it!`, color: '#7dff9a' };
  if (mode === 'dying') return { text: 'Defeated', color: '#df7cff' };
  return { text: `${crystals} - flying: ranged only`, color: '#c9a0ff' };
}
