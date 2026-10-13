/**
 * The Ender Dragon and the End Crystals: definitions, the dragon's brain (plain data the AI in
 * systems/dragonAI.ts steps) and the pure rules around them (phases, flight path, damage gate, healing).
 * Nothing here touches the DOM or draws: the art is procedural, see render/endSprites.ts.
 */
import type { EnemyDef } from '../data/enemies';
import type { Enemy } from './enemy';

/** Base hit points of the dragon; the run scales them with `hpScale` like the Warden's (see makeDragon). */
export const DRAGON_BASE_HP = 2500;
/** Base contact/attack damage (the Warden's is 40); every dragon attack is a multiple of the scaled value. */
export const DRAGON_BASE_DMG = 36;
export const CRYSTAL_BASE_HP = 60;

const base = { fromMinute: 0, weight: 0, walkAnim: false } as const;

/** The dragon: a flying `boss: 'boss'` enemy whose sprite is drawn by code (`proc.` prefix, no atlas entry). */
export const DRAGON_DEF: EnemyDef = {
  ...base,
  id: 'ender_dragon',
  sprite: 'proc.ender_dragon',
  name: 'Ender Dragon',
  hp: DRAGON_BASE_HP,
  dmg: DRAGON_BASE_DMG,
  speed: 160,
  radius: 22,
  xp: 400,
  archetype: 'boss',
  boss: 'dragon',
  flying: true,
  scale: 1,
  height: 60,
};

/** An End Crystal: a stationary enemy on top of a pillar (so every auto-aiming weapon targets it). */
export const CRYSTAL_DEF: EnemyDef = {
  ...base,
  id: 'end_crystal',
  sprite: 'proc.end_crystal',
  name: 'End Crystal',
  hp: CRYSTAL_BASE_HP,
  dmg: 20,
  speed: 0,
  radius: 7,
  xp: 6,
  archetype: 'turret',
  flying: true,
  scale: 1,
  height: 18,
};

export type DragonPhase = 1 | 2 | 3;
/** HP fractions at which phases 2 and 3 begin (all crystals gone also begins phase 3). */
export const PHASE2_AT = 0.8;
export const PHASE3_AT = 0.4;

/**
 * The phase for an HP fraction and the number of crystals still standing. Phases never go back: `prev` is the
 * highest phase reached so far (crystal healing can lift the HP back above a threshold).
 */
export function phaseFor(hpFrac: number, crystalsAlive: number, prev: DragonPhase = 1): DragonPhase {
  let p: DragonPhase = 1;
  if (hpFrac <= PHASE2_AT) p = 2;
  if (hpFrac <= PHASE3_AT || crystalsAlive <= 0) p = 3;
  return p > prev ? p : prev;
}

/** HP per second each standing crystal gives the dragon (while it is below full HP), scaled with its HP. */
export const CRYSTAL_HEAL_PER_SEC = 15;
export function crystalHealRate(maxHp: number): number {
  return CRYSTAL_HEAL_PER_SEC * (maxHp / DRAGON_BASE_HP);
}

/** Damage to the dragon when a crystal that is healing it is destroyed (scaled like the dragon's HP). */
export const CRYSTAL_BLAST_DMG = 150;
export const CRYSTAL_BLAST_RADIUS = 60;
export const CRYSTAL_STUN = 3;

export type DragonMode =
  | 'orbit'
  | 'roar'
  | 'telegraph'
  | 'dive'
  | 'stunned'
  | 'landing'
  | 'perch'
  | 'takeoff'
  | 'dying';

/** Modes in which the dragon is low enough for melee to reach it. */
export function isGrounded(mode: DragonMode): boolean {
  return mode === 'stunned' || mode === 'landing' || mode === 'perch' || mode === 'takeoff';
}

/** Flight ellipse (semi-axes in px) around the island centre, and the cruise speed. */
export const ORBIT_A = 300;
export const ORBIT_B = 200;
export const CRUISE_SPEED = 160;
export const DIVE_SPEED = 280;
export const DIVE_WIDTH = 60;
export const DIVE_LENGTH = 640;
export const DIVE_KNOCK = 120;
/** Seconds of the dive telegraph and of the perched / flying halves of phase 3. */
export const DIVE_TELEGRAPH = 1.8;
export const PERCH_TIME = 10;
export const FLY_TIME = 8;

/** Position on the flight ellipse at parameter `theta`. */
export function orbitPoint(theta: number): { x: number; y: number } {
  return { x: Math.cos(theta) * ORBIT_A, y: Math.sin(theta) * ORBIT_B };
}

/** Angular speed (rad/s) that makes the dragon move at `speed` px/s along the ellipse at `theta`. */
export function orbitOmega(theta: number, speed = CRUISE_SPEED): number {
  const sx = -Math.sin(theta) * ORBIT_A;
  const sy = Math.cos(theta) * ORBIT_B;
  return speed / Math.max(1, Math.hypot(sx, sy));
}

/** Ellipse parameter closest (in angle) to a point, used to rejoin the orbit after a dive or a stun. */
export function orbitTheta(x: number, y: number): number {
  return Math.atan2(y / ORBIT_B, x / ORBIT_A);
}

/**
 * The dive line through the hero: start point, unit direction and end point of a `DIVE_LENGTH` run along angle
 * `a`. When the hero stands within `edge` px of the island rim in the direction the dragon will push (along the
 * dive), the direction is flipped so the knockback carries the hero inward (fairness: a dive never pushes a hero
 * who could not have stepped aside into the void on its own).
 */
export function diveLine(
  hx: number,
  hy: number,
  a: number,
  islandR: number,
  edge = 170,
): { sx: number; sy: number; ux: number; uy: number; ex: number; ey: number } {
  let ux = Math.cos(a);
  let uy = Math.sin(a);
  // Distance from the hero to the rim along +dir: solve |h + t u| = R.
  const b = hx * ux + hy * uy;
  const c = hx * hx + hy * hy - islandR * islandR;
  const t = -b + Math.sqrt(Math.max(0, b * b - c));
  if (t < edge) {
    ux = -ux;
    uy = -uy;
  }
  const half = DIVE_LENGTH / 2;
  return {
    sx: hx - ux * half,
    sy: hy - uy * half,
    ux,
    uy,
    ex: hx + ux * half,
    ey: hy + uy * half,
  };
}

/** What the dragon's brain remembers between steps (owned by `run.end`). */
export class DragonBrain {
  phase: DragonPhase = 1;
  mode: DragonMode = 'orbit';
  /** Seconds left in the current mode (or counting up for open-ended ones). */
  t = 0;
  theta = -Math.PI / 2;
  spitT = 3;
  diveCd = 5;
  sweepT = 3;
  /** Perch / flight half of phase 3: seconds left in the current half. */
  halfT = 0;
  /** Facing of the perched dragon (radians; the head points that way, the tail sweep goes behind). */
  face = 0;
  /** Dive line being flown. */
  dive = { sx: 0, sy: 0, ux: 1, uy: 0, ex: 0, ey: 0, hit: false };
  /** Frames the renderer reads. */
  mouthT = 0;
  /** Set while an internal blast hits the dragon so the damage gate lets it through. */
  bypass = false;
  /** Seconds before the gate may print "Out of reach!" again. */
  gateMsgT = 0;
  /** A spit or a sweep queued for the end of the current mode. */
  tailT = 0;
  /** Seconds of dive i-frames after a knockback. */
  stunnedBy: 'crystal' | 'shield' | 'landing' | null = null;
  wingT = 0;
}

/**
 * Fraction of an incoming hit the dragon takes. `melee` is a hit that starts at the hero (or an ally): swords,
 * axes, ally bites. Flying: melee cannot reach (0), everything else lands. Perched: the armour sparks off ranged
 * hits (x0.15), melee lands. Stunned or landing on the ground: everything lands.
 */
export function dragonFactor(mode: DragonMode, melee: boolean): number {
  if (mode === 'dying') return 0;
  if (isGrounded(mode)) {
    if (mode === 'perch' && !melee) return 0.15;
    return 1;
  }
  return melee ? 0 : 1;
}

/** Hits that start within this many px of the hero or an ally count as melee. */
export const MELEE_ORIGIN = 3;

export function isMeleeOrigin(
  fromX: number,
  fromY: number,
  heroX: number,
  heroY: number,
  allies: readonly { x: number; y: number }[],
): boolean {
  if (Math.hypot(fromX - heroX, fromY - heroY) < MELEE_ORIGIN) return true;
  for (const a of allies) if (Math.hypot(fromX - a.x, fromY - a.y) < MELEE_ORIGIN) return true;
  return false;
}

/** Is a melee hero in front of a perched dragon (the half-plane its head points to)? Head hits crit. */
export function inFront(face: number, dx: number, dy: number): boolean {
  return Math.cos(face) * dx + Math.sin(face) * dy > 0;
}

/** Damage factor of a cage on a crystal: only a blast or a heavy hit gets through the bars at full strength. */
export function cageFactor(knock: number, heavy: boolean): number {
  return heavy || knock >= 120 ? 1 : 0.25;
}

/** The two crystals (of six) that are caged. */
export const CAGED_PILLARS: readonly number[] = [1, 4];
export const CAGE_HP = 90;

export function isDragon(e: Enemy): boolean {
  return e.def.boss === 'dragon';
}
export function isCrystal(e: Enemy): boolean {
  return e.def.id === 'end_crystal';
}
