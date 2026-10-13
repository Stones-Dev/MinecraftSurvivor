/** Shared building blocks for weapon modules. */
import type { Enemy } from '../entities/enemy';
import type { Orbiter, RunState } from '../game';
import { applyStatus } from '../systems/status';
import type { WeaponLevel, WeaponId } from './types';

const near: Enemy[] = [];

/** Nearest living enemy to the hero within `range`, or null. */
export function nearestEnemy(run: RunState, range: number): Enemy | null {
  const p = run.player;
  run.hash.query(p.x, p.y, range, near);
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of near) {
    if (e.dying) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Living enemies touching the circle (x, y, r), written into `out`. */
export function enemiesInCircle(
  run: RunState,
  x: number,
  y: number,
  r: number,
  out: Enemy[],
): Enemy[] {
  run.hash.query(x, y, r, out);
  let w = 0;
  for (const e of out) if (!e.dying) out[w++] = e;
  out.length = w;
  return out;
}

/** Damage of a level after every modifier. `projectile` adds the Power multiplier. */
export function damageOf(run: RunState, s: WeaponLevel, projectile = false): number {
  return s.dmg * run.mods.dmg * (projectile ? run.mods.projDmg : 1);
}

/** Cooldown of a level after Quick Charge, Haste and the sword tier. */
export function cooldownOf(run: RunState, s: WeaponLevel): number {
  return s.cd * run.mods.cd;
}

/** Projectiles or mines per use, including Multishot. */
export function countOf(run: RunState, s: WeaponLevel): number {
  return s.count + run.mods.projCount;
}

export function areaOf(run: RunState, s: WeaponLevel): number {
  return s.area * run.mods.area;
}

/** Fire Aspect on melee hits, Flame on projectile hits. */
export function onHitMods(
  run: RunState,
  e: Enemy,
  source: 'melee' | 'projectile',
  baseDmg: number,
): void {
  const chance = source === 'melee' ? run.mods.burnChance : run.mods.flame;
  if (chance > 0 && run.rng.ai.chance(chance))
    applyStatus(e, 'burn', 3 * run.mods.duration, Math.max(2, baseDmg * 0.3));
  if (run.mods.poisonChance > 0 && run.rng.ai.chance(run.mods.poisonChance))
    applyStatus(e, 'poison', 3 * run.mods.duration, Math.max(2, baseDmg * 0.25));
}

/** Make the hero face a world point (sprites only face left or right); in manual aim, the aimed side. */
export function faceToward(run: RunState, x: number): void {
  const m = run.player.manualAim;
  run.player.aim((m ? m.x >= 0 : x >= run.player.x) ? 1 : -1);
}

/** The direction of a shot or swing: the manual aim when the player aims by hand, else the auto-aim angle. */
export function aimedAngle(run: RunState, auto: number): number {
  const m = run.player.manualAim;
  return m ? Math.atan2(m.y, m.x) : auto;
}

/** How close (art px) an enemy must be to the aimed point for a manually aimed potion to land on it. */
const SNAP = 36;

/**
 * Manual aim only: where `count` lobbed potions land. The first goes to the mouse point (or, for a stick, 65% of
 * `range` out), snapped onto the nearest living enemy within SNAP of it; further potions take the next nearest
 * enemies to that point and, with none left, fan out sideways. Returns feet coordinates, like `Enemy.x/y`.
 */
export function aimedLandPoints(
  run: RunState,
  range: number,
  count: number,
): { x: number; y: number }[] {
  const p = run.player;
  const m = p.manualAim;
  if (!m) return [];
  const d = Math.min(range, m.dist > 0 ? m.dist : range * 0.65);
  const ax = p.x + m.x * d;
  const ay = p.y - 8 + m.y * d;
  run.hash.query(ax, ay, SNAP, near);
  const cands = near
    .filter((e) => !e.dying && Math.hypot(e.x - p.x, e.y - p.y) <= range)
    .map((e) => ({ e, d: Math.hypot(e.x - ax, e.y - 8 - ay) }))
    .filter((c) => c.d <= SNAP)
    .sort((a, b) => a.d - b.d);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const c = cands[i];
    if (c) out.push({ x: c.e.x, y: c.e.y });
    else {
      const k = i - cands.length;
      const side = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * 18;
      out.push({ x: ax - m.y * side, y: ay + 4 + m.x * side });
    }
  }
  return out;
}

/** Keep exactly `count` orbiters for `owner`, evenly spaced, with the given stats. */
export function syncOrbiters(
  run: RunState,
  owner: WeaponId,
  count: number,
  stats: Pick<Orbiter, 'radius' | 'speed' | 'dmg' | 'size' | 'knock' | 'rehit' | 'burn' | 'style'>,
): void {
  const mine = run.orbiters.filter((o) => o.owner === owner);
  if (mine.length !== count) {
    const base = mine[0]?.angle ?? 0;
    run.orbiters = run.orbiters.filter((o) => o.owner !== owner);
    for (let i = 0; i < count; i++) {
      run.orbiters.push({
        owner,
        angle: base + (i * Math.PI * 2) / count,
        x: run.player.x,
        y: run.player.y,
        hitAt: new Map(),
        ...stats,
      });
    }
    return;
  }
  for (const o of mine) Object.assign(o, stats);
}

export function removeOrbiters(run: RunState, owner: WeaponId): void {
  if (run.orbiters.some((o) => o.owner === owner))
    run.orbiters = run.orbiters.filter((o) => o.owner !== owner);
}
