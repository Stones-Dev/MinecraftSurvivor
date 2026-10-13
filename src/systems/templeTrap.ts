/**
 * Desert Temple trap (v1.4). The stone pressure plate in the middle of the chamber is armed. Stepping on it
 * lights a 1.2 s fuse (a telegraphed 90 px circle and a fuse blip every 0.3 s); then nine hidden TNT blocks
 * (the plate's position and a ring of eight around it) go off 0.07 s apart. The hero takes 150 damage once,
 * at the first blast, if he is still inside the circle: the fuse is long enough to run out of it. Hitting
 * the plate (any friendly projectile, a melee swing next to it, an explosion on it) breaks it: the trap is
 * disarmed, also while the fuse is burning.
 *
 * This file is the pure state machine (tested without a RunState) plus the geometry. The run glue
 * (telegraph, explode, damage, removing the prop) is `updateTemple` in structureInteract.ts.
 */

/** Seconds from stepping on the plate to the first blast. */
export const FUSE_S = 1.2;
/** Seconds between two fuse blips (the loud tick of the 'tnt' sound). */
export const BLIP_S = 0.3;
/** Seconds between two of the nine blasts. */
export const BLAST_STAGGER_S = 0.07;
export const TNT_COUNT = 9;
/** Radius of the ring of outer TNT blocks and of one blast (their union is `TRAP_RADIUS`). */
export const TNT_RING_PX = 44;
export const TNT_BLAST_PX = 38;
/** Radius of the whole trap: the telegraph circle and the lethal zone. */
export const TRAP_RADIUS = TNT_RING_PX + TNT_BLAST_PX;
/** Damage to the hero when the blasts catch him (before armor). */
export const TRAP_DAMAGE = 150;
/** Damage of one blast to enemies. */
export const TRAP_ENEMY_DAMAGE = 60;
/** The hero triggers the plate within this distance of its centre. */
export const PLATE_TRIGGER_PX = 12;
/** A projectile this close to the plate breaks it. */
export const PLATE_HIT_PX = 10;
/** A melee swing this close to the plate (hero to plate) breaks it. */
export const PLATE_SWING_PX = 30;

export type TrapPhase = 'armed' | 'fuse' | 'blasting' | 'done' | 'disarmed';

export interface TrapState {
  phase: TrapPhase;
  /** Seconds since the current phase began. */
  t: number;
  /** Blasts already fired. */
  fired: number;
  /** Seconds until the next fuse blip. */
  blip: number;
}

export type TrapEvent =
  | { type: 'lit' }
  | { type: 'blip' }
  | { type: 'boom'; index: number }
  | { type: 'disarmed' }
  | { type: 'done' };

export function newTrap(): TrapState {
  return { phase: 'armed', t: 0, fired: 0, blip: 0 };
}

export interface TrapInput {
  /** The hero stands on the plate. */
  onPlate: boolean;
  /** Something hit the plate this step. */
  hit: boolean;
}

/** Advance the trap by `dt`; returns the events of this step in order. */
export function stepTrap(s: TrapState, dt: number, input: TrapInput): TrapEvent[] {
  const ev: TrapEvent[] = [];
  if (s.phase === 'done' || s.phase === 'disarmed') return ev;
  if (input.hit && (s.phase === 'armed' || s.phase === 'fuse')) {
    s.phase = 'disarmed';
    ev.push({ type: 'disarmed' });
    return ev;
  }
  if (s.phase === 'armed') {
    if (!input.onPlate) return ev;
    s.phase = 'fuse';
    s.t = 0;
    s.blip = BLIP_S;
    ev.push({ type: 'lit' });
    return ev;
  }
  s.t += dt;
  if (s.phase === 'fuse') {
    s.blip -= dt;
    if (s.blip <= 0) {
      s.blip += BLIP_S;
      ev.push({ type: 'blip' });
    }
    if (s.t >= FUSE_S) {
      s.phase = 'blasting';
      s.t = 0;
    } else return ev;
  }
  // Blasting: blast i goes off at i * BLAST_STAGGER_S.
  while (s.fired < TNT_COUNT && s.t >= s.fired * BLAST_STAGGER_S) {
    ev.push({ type: 'boom', index: s.fired });
    s.fired++;
  }
  if (s.fired >= TNT_COUNT) {
    s.phase = 'done';
    ev.push({ type: 'done' });
  }
  return ev;
}

/** The nine TNT positions: index 0 under the plate, 1-8 on the ring. */
export function tntPoints(x: number, y: number): { x: number; y: number }[] {
  const out = [{ x, y }];
  for (let i = 0; i < TNT_COUNT - 1; i++) {
    const a = (i / (TNT_COUNT - 1)) * Math.PI * 2;
    out.push({ x: x + Math.cos(a) * TNT_RING_PX, y: y + Math.sin(a) * TNT_RING_PX });
  }
  return out;
}

/**
 * Is a circle (the hero) caught by the blasts? The union of the nine blasts (about the telegraph circle):
 * a hero who stood on the plate's edge when the fuse was lit needs to cover ~75 px in `FUSE_S` seconds to
 * be out of it, which base speed (72 px/s) just manages.
 */
export function inTrapZone(
  hx: number,
  hy: number,
  heroRadius: number,
  x: number,
  y: number,
): boolean {
  return tntPoints(x, y).some((t) => Math.hypot(hx - t.x, hy - t.y) < TNT_BLAST_PX + heroRadius);
}
