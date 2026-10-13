/**
 * Locomotion of the layered heroes (Steve, Alex, Rana): pure rules, no canvas.
 *
 * - RUN plays the sheets' own 4-direction walk cycle (`hero.<name>.<armor>.none.walk_<dir>`, 4 frames each:
 *   stand, step, stand, step), IDLE is the sword-guard pose and SWING is the sword swing, which always wins.
 * - The walk frames are unarmed, so the sword of the current tier (`hero.<name>.none.sword_<tier>.held`, cut out of
 *   the sword idle frame at build time and anchored at the fist) is drawn over the hand at a fixed offset.
 */

export type WalkDir = 'down' | 'left' | 'right' | 'up';
export const WALK_DIRS: readonly WalkDir[] = ['down', 'left', 'right', 'up'];
export const WALK_FRAMES = 4;

/** The other axis must beat the current one by this factor before the facing row switches (diagonal hysteresis). */
export const DIR_HYSTERESIS = 1.6;

/**
 * Facing row for a movement direction. The previous row sticks while the movement is diagonal: switching between
 * the side and the front/back rows needs the other axis to be clearly (`DIR_HYSTERESIS`) stronger, so a hero
 * walking diagonally does not flicker between them. A zero vector keeps the previous row.
 */
export function pickWalkDir(prev: WalkDir, dx: number, dy: number): WalkDir {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 1e-6 && ay < 1e-6) return prev;
  const wasHorizontal = prev === 'left' || prev === 'right';
  const horizontal = wasHorizontal ? ay <= ax * DIR_HYSTERESIS : ax > ay * DIR_HYSTERESIS;
  if (horizontal) return dx < 0 ? 'left' : dx > 0 ? 'right' : prev;
  return dy < 0 ? 'up' : dy > 0 ? 'down' : prev;
}

export type Locomotion = 'swing' | 'run' | 'idle';

/** Swing beats run beats idle; a dead hero only shows the idle pose (faded by the caller). */
export function locomotionState(swinging: boolean, moving: boolean, dead: boolean): Locomotion {
  if (dead) return 'idle';
  if (swinging) return 'swing';
  return moving ? 'run' : 'idle';
}

/** Walk frame (0 stand, 1 step, 2 stand, 3 step) for the player's distance-driven half-stride counter. */
export function walkFrameIndex(walkPhase: number): number {
  return Math.floor(walkPhase) & (WALK_FRAMES - 1);
}

export function walkAnimId(hero: string, armor: string, dir: WalkDir): string {
  return `hero.${hero}.${armor}.none.walk_${dir}`;
}

export function heldAnimId(hero: string, sword: string): string {
  return `hero.${hero}.none.sword_${sword}.held`;
}

/**
 * Armour tier whose walk frames match the idle and swing frames that are drawn: the sword idle / swing sheets of
 * Rana only exist without armour, and a walk in armour between two unarmoured poses would pop.
 */
export function walkArmorFor(hasIdle: boolean, armor: string): string {
  return hasIdle ? armor : 'none';
}

export interface HandPlace {
  /** Grip position relative to the body centre (art px; +x right, +y up from the feet). */
  x: number;
  y: number;
  /** Mirror the sword (blade leans left). */
  flip: boolean;
  /** Draw it under the body (back view: the blade only peeks out beside the hero). */
  behind: boolean;
}

const BIG: Record<WalkDir, HandPlace> = {
  down: { x: -5, y: 10, flip: true, behind: false },
  left: { x: 0, y: 9, flip: true, behind: false },
  right: { x: 0, y: 9, flip: false, behind: false },
  up: { x: 5, y: 11, flip: false, behind: true },
};
const SMALL: Record<WalkDir, HandPlace> = {
  down: { x: -4, y: 8, flip: true, behind: false },
  left: { x: 0, y: 8, flip: true, behind: false },
  right: { x: 0, y: 8, flip: false, behind: false },
  up: { x: 4, y: 9, flip: false, behind: true },
};

/** Where the walking hero holds the sword (Rana is a head shorter than Steve and Alex). */
export function handPlace(hero: string, dir: WalkDir): HandPlace {
  return (hero === 'rana' ? SMALL : BIG)[dir];
}
