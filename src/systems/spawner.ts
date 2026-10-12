/** Enemy spawning: trickle + tides on a ring outside the view, soft cap with elites (BRIEF section 7). */
import { dmgScale, ENEMIES, hpScale } from '../data/enemies';
import { biomeDensity, biomeHpMult, pickEnemyId } from '../data/rosters';
import { Enemy } from '../entities/enemy';
import type { RunState } from '../game';
import { TILE } from '../world/terrain';
import { nightFactor } from './daynight';

export const ENEMY_CAP = 64;
const ELITE_FROM = 0.85;
const OVERFLOW = 10;
/** Any enemy has a 1 in 1000 chance to spawn Charged (BRIEF section 7). */
const CHARGED_CHANCE = 0.001;
/** Distance from the player where enemies appear (just outside the visible area). */
export const SPAWN_RING = 270;

/** Enemies per second from the continuous trickle at time t (seconds). */
export function trickleRate(t: number): number {
  return (1.6 + 0.028 * t + 0.5 * Math.pow(t / 60, 1.6)) * 0.24;
}

/** Enemies in one tide at time t. */
export function tideCount(t: number): number {
  return Math.max(3, Math.round((14 + Math.floor(t / 22)) * 0.4));
}

export class SpawnerState {
  acc = 0;
  tideT = 32;
  waterNear = false;
  waterCheckAt = -9;
}

export function makeEnemy(
  run: RunState,
  defId: string,
  x: number,
  y: number,
  elite: boolean,
): Enemy | null {
  const def = ENEMIES[defId];
  if (!def) return null;
  const minute = run.time / 60;
  const e = new Enemy(def, run.nextEnemyId++);
  e.x = x;
  e.y = y;
  e.elite = elite;
  e.maxHp = def.hp * hpScale(minute) * (elite ? 1.6 : 1);
  e.hp = e.maxHp;
  e.dmg = def.dmg * dmgScale(minute) * (elite ? 1.25 : 1);
  e.cd = run.rng.spawn.range(0.5, 2);
  e.cd2 = run.rng.spawn.range(1, 4);
  if (def.shieldPct) e.shield = def.shieldPct * e.maxHp;
  if (def.boss) e.boss = 'boss';
  else if (def.mini) e.boss = 'mini';
  return e;
}

/** Is there water within ~120 px of the hero? (drowned, guardians) Cached for a second. */
function waterNear(run: RunState): boolean {
  const s = run.spawner;
  if (run.time - s.waterCheckAt < 1) return s.waterNear;
  s.waterCheckAt = run.time;
  const p = run.player;
  s.waterNear = false;
  for (const r of [60, 120]) {
    for (let i = 0; i < 12 && !s.waterNear; i++) {
      const a = (i / 12) * Math.PI * 2;
      if (run.world.tileAtPx(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r) === TILE.WATER)
        s.waterNear = true;
    }
  }
  return s.waterNear;
}

function pickType(run: RunState): string {
  return pickEnemyId(
    run.biome(),
    run.time / 60,
    nightFactor(run.time) > 0.6,
    waterNear(run),
    run.rng.spawn.float(),
  );
}

/** A free point on the spawn ring at `angle`, or null if every attempt is blocked. */
export function ringPoint(
  run: RunState,
  angle: number,
  radius: number,
): { x: number; y: number } | null {
  const p = run.player;
  for (let i = 0; i < 6; i++) {
    const a = angle + i * 0.35 * (i % 2 === 0 ? 1 : -1);
    const x = p.x + Math.cos(a) * SPAWN_RING;
    const y = p.y + Math.sin(a) * SPAN_Y * SPAWN_RING;
    const r = run.world.collide(x, y, radius);
    if (Math.abs(r.x - x) < 3 && Math.abs(r.y - y) < 3) return { x, y };
  }
  return null;
}

const SPAN_Y = 0.9;

function spawnOne(run: RunState, angle: number, limit: number): boolean {
  if (run.enemies.length >= limit) return false;
  const id = pickType(run);
  const def = ENEMIES[id];
  if (!def) return false;
  const pt = ringPoint(run, angle, def.radius);
  if (!pt) return false;
  const elite = run.enemies.length >= ENEMY_CAP * ELITE_FROM;
  const n = def.pack ?? 1;
  const hpMult = biomeHpMult(run.biome());
  for (let i = 0; i < n; i++) {
    const e = makeEnemy(
      run,
      id,
      pt.x + (i > 0 ? run.rng.spawn.range(-14, 14) : 0),
      pt.y + (i > 0 ? run.rng.spawn.range(-10, 10) : 0),
      elite,
    );
    if (!e) continue;
    // The biome's danger: tougher mobs in the dark forest and badlands, softer ones in the mushroom fields.
    if (hpMult !== 1) {
      e.maxHp *= hpMult;
      e.hp = e.maxHp;
    }
    if (run.rng.spawn.chance(CHARGED_CHANCE + run.chargedBonus)) {
      e.charged = true;
      e.maxHp *= 2;
      e.hp = e.maxHp;
    }
    run.enemies.push(e);
  }
  return true;
}

export function updateSpawner(run: RunState, dt: number): void {
  if (run.rift.active) return;
  const s = run.spawner;
  const t = run.time;
  const density = biomeDensity(run.biome());
  const rate = trickleRate(t) * (1 + 0.4 * nightFactor(t)) * run.spawnMult * density;
  s.acc += rate * dt;
  while (s.acc >= 1) {
    s.acc -= 1;
    if (run.enemies.length < ENEMY_CAP)
      spawnOne(run, run.rng.spawn.range(0, Math.PI * 2), ENEMY_CAP);
  }
  s.tideT -= dt * run.spawnMult;
  if (s.tideT <= 0) {
    s.tideT = run.rng.spawn.range(38, 56);
    const anchor = run.rng.spawn.range(0, Math.PI * 2);
    const n = Math.max(2, Math.round(tideCount(t) * density));
    for (let i = 0; i < n; i++)
      spawnOne(run, anchor + run.rng.spawn.range(-0.55, 0.55), ENEMY_CAP + OVERFLOW);
  }
  // Enemies left far behind are moved back onto the ring so the player never faces an empty field.
  const p = run.player;
  for (const e of run.enemies) {
    if (e.dying || e.boss) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    e.farT = d > SPAWN_RING * 1.6 ? e.farT + dt : 0;
    if (e.farT > 2.5 || d > SPAWN_RING * 2.6) {
      const pt = ringPoint(run, run.rng.spawn.range(0, Math.PI * 2), e.radius);
      if (pt) {
        e.x = pt.x;
        e.y = pt.y;
        e.prevX = Number.NaN;
        e.farT = 0;
      }
    }
  }
}
