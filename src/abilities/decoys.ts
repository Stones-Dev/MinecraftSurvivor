/**
 * Friendly decoys (Illusioner): short-lived images of the hero that chasers walk to instead of the hero.
 * They are not Allies (no HP, no AI of their own); enemyAI's chaser case asks `lureTarget` for a bait.
 */
import type { Enemy } from '../entities/enemy';
import { makeFx } from '../entities/fx';
import type { RunState } from '../game';
import { damageEnemy } from '../systems/combat';
import { enemiesInCircle } from '../weapons/helpers';

export interface Decoy {
  x: number;
  y: number;
  /** Age and lifetime in seconds. */
  t: number;
  dur: number;
  /** Chasers within this many px go for the decoy. */
  lure: number;
  /** Damage dealt around the decoy when it vanishes (0 = none). */
  pop: number;
  /** Mirrors the sprite (decoys face the way the hero did when they appeared). */
  facing: 1 | -1;
}

/** Hard cap so a passive that spawns decoys on hits can never flood the AI. */
export const MAX_DECOYS = 6;
const POP_RADIUS = 34;
const hits: Enemy[] = [];
const wander = { x: 0, y: 0 };

export function spawnDecoy(
  run: RunState,
  x: number,
  y: number,
  dur: number,
  lure = 130,
  pop = 0,
): Decoy | null {
  if (run.decoys.length >= MAX_DECOYS) run.decoys.shift();
  const c = run.world.collide(x, y, 5, run.biome());
  const d: Decoy = { x: c.x, y: c.y, t: 0, dur, lure, pop, facing: run.player.facing };
  run.decoys.push(d);
  run.fx.push(makeFx('ring', d.x, d.y - 10, 0.3, { r: 12, color: '#9a7bff' }));
  return d;
}

/** Age decoys; expired ones vanish in a puff (and pop for damage if they carry any). */
export function updateDecoys(run: RunState, dt: number): void {
  if (run.decoys.length === 0) return;
  let w = 0;
  for (const d of run.decoys) {
    d.t += dt;
    if (d.t < d.dur) {
      run.decoys[w++] = d;
      continue;
    }
    run.fx.push(makeFx('ring', d.x, d.y - 10, 0.35, { r: POP_RADIUS, color: '#b9a4ff' }));
    if (d.pop > 0) {
      enemiesInCircle(run, d.x, d.y, POP_RADIUS * run.mods.area, hits);
      for (const e of hits) damageEnemy(run, e, d.pop, d.x, d.y, 90);
      run.emit('hit');
    }
  }
  run.decoys.length = w;
}

/** The nearest decoy within its lure radius of `e`, or null. */
export function decoyTarget(run: RunState, e: Enemy): Decoy | null {
  let best: Decoy | null = null;
  let bestD = Infinity;
  for (const d of run.decoys) {
    const dist = Math.hypot(d.x - e.x, d.y - e.y);
    if (dist < d.lure && dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}

/** True when the hero's kit makes `e` ignore him (no chasing, no contact damage). */
export function ignoresHero(run: RunState, e: Enemy): boolean {
  return run.kit.ignoredBy?.(run, e) ?? false;
}

/**
 * Where a chaser should walk instead of the hero: the nearest decoy, or a lazy wander point for enemies the
 * hero's kit makes neutral. Null means "chase the hero as usual". Returns a shared object.
 */
export function lureTarget(run: RunState, e: Enemy): { x: number; y: number } | null {
  if (run.decoys.length > 0) {
    const d = decoyTarget(run, e);
    if (d) return d;
  }
  if (ignoresHero(run, e)) {
    const a = e.id * 2.39 + run.time * 0.35;
    wander.x = e.x + Math.cos(a) * 30;
    wander.y = e.y + Math.sin(a * 1.3) * 30;
    return wander;
  }
  return null;
}
