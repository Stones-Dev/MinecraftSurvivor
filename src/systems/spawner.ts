/** Enemy spawning: trickle + tides on a ring outside the view, soft cap with elites (BRIEF section 7). */
import { dmgScale, ENEMIES, hpScale } from '../data/enemies';
import { biomeDensity, biomeHpMult, pickEnemyId } from '../data/rosters';
import { Enemy } from '../entities/enemy';
import type { RunState } from '../game';
import { TILE } from '../world/terrain';
import { nightFactor } from './daynight';
import { isStructureEnemy, spawnCount } from './structureEnemies';

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

/** The lesser Warden (rare late elite): first possible minute, roll spacing, cooldown and per-roll chances. */
export const WARDEN_ID = 'warden_lesser';
export const WARDEN_FROM = 9 * 60;
const WARDEN_ROLL = 20;
const WARDEN_COOLDOWN = 150;
const WARDEN_CHANCE = 0.08;
const WARDEN_CHANCE_DARK_FOREST = 0.3;

export class SpawnerState {
  acc = 0;
  /** Next time the lesser Warden may roll, and when the last one appeared. */
  wardenRollAt = WARDEN_FROM;
  wardenLastAt = -1e9;
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
  // `mini` wins over `boss`: the lesser Warden uses the Warden's pattern but is not the final boss.
  if (def.mini) e.boss = 'mini';
  else if (def.boss) e.boss = 'boss';
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

/**
 * A free point on the spawn ring at `angle`, or null if every attempt is blocked. Points on lava are never
 * offered, and neither are points in water unless `aquatic` (drowned, guardians). The attempts are a fixed
 * fan of angles and no RNG is drawn, so the result is deterministic and the search always terminates.
 */
export function ringPoint(
  run: RunState,
  angle: number,
  radius: number,
  aquatic = false,
): { x: number; y: number } | null {
  const p = run.player;
  for (let i = 0; i < 6; i++) {
    const a = angle + i * 0.35 * (i % 2 === 0 ? 1 : -1);
    const x = p.x + Math.cos(a) * SPAWN_RING;
    const y = p.y + Math.sin(a) * SPAN_Y * SPAWN_RING;
    const surface = run.world.surface(x, y);
    if (surface === 'lava' || (surface === 'water' && !aquatic)) continue;
    const r = run.world.collide(x, y, radius);
    if (Math.abs(r.x - x) < 3 && Math.abs(r.y - y) < 3) return { x, y };
  }
  return null;
}

const SPAN_Y = 0.9;

/** Apply the biome's danger to a freshly made enemy: tougher in the dark forest and badlands, softer in the mushroom fields. */
function applyBiomeHp(e: Enemy, hpMult: number): void {
  if (hpMult === 1) return;
  e.maxHp *= hpMult;
  e.hp = e.maxHp;
}

function spawnOne(run: RunState, angle: number, limit: number): boolean {
  if (spawnCount(run) >= limit) return false;
  const id = pickType(run);
  const def = ENEMIES[id];
  if (!def) return false;
  const pt = ringPoint(run, angle, def.radius, def.nearWater);
  if (!pt) return false;
  const elite = spawnCount(run) >= ENEMY_CAP * ELITE_FROM;
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
    applyBiomeHp(e, hpMult);
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
    if (spawnCount(run) < ENEMY_CAP) spawnOne(run, run.rng.spawn.range(0, Math.PI * 2), ENEMY_CAP);
  }
  s.tideT -= dt * run.spawnMult;
  if (s.tideT <= 0) {
    s.tideT = run.rng.spawn.range(38, 56);
    const anchor = run.rng.spawn.range(0, Math.PI * 2);
    const n = Math.max(2, Math.round(tideCount(t) * density));
    for (let i = 0; i < n; i++)
      spawnOne(run, anchor + run.rng.spawn.range(-0.55, 0.55), ENEMY_CAP + OVERFLOW);
  }
  updateWarden(run);
  // Enemies left far behind are moved back onto the ring so the player never faces an empty field.
  const p = run.player;
  const list = run.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || e.dying || e.boss || isStructureEnemy(e)) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    e.farT = d > SPAWN_RING * 1.6 ? e.farT + dt : 0;
    if (e.farT > 2.5 || d > SPAWN_RING * 2.6) {
      const fresh = recycleType(run, e);
      const def = fresh ?? e.def;
      const pt = ringPoint(run, run.rng.spawn.range(0, Math.PI * 2), def.radius, def.nearWater);
      if (!pt) continue;
      if (fresh) {
        // Same slot, same count: the straggler is replaced by a newly rolled mob from the current roster.
        const n = makeEnemy(run, fresh.id, pt.x, pt.y, false);
        if (n) {
          applyBiomeHp(n, biomeHpMult(run.biome()));
          list[i] = n;
          continue;
        }
      }
      e.x = pt.x;
      e.y = pt.y;
      e.prevX = Number.NaN;
      e.farT = 0;
    }
  }
}

/**
 * A straggler at full health can be swapped for a freshly rolled mob so that the variety on screen refreshes
 * instead of the same instances following the hero forever. Only plain, untouched spawns qualify (not elites,
 * Charged, summons, slime children, banner carriers, packs or rift foes) and only into a single-body type.
 */
function recycleType(run: RunState, e: Enemy): (typeof ENEMIES)[string] | null {
  if (e.hp < e.maxHp || e.shield > 0) return null;
  if (e.elite || e.charged || e.banner || e.riftFoe || e.summonerId !== 0 || e.splitDepth > 0)
    return null;
  if (e.def.pack || e.def.weight <= 0) return null;
  const def = ENEMIES[pickType(run)];
  if (!def || def.pack || def.weight <= 0 || def.id === e.def.id) return null;
  return def;
}

/** Rare late elite: after minute 9, one lesser Warden at a time (cap 1), far likelier in the Dark Forest. */
function updateWarden(run: RunState): void {
  const s = run.spawner;
  const t = run.time;
  if (t < s.wardenRollAt) return;
  s.wardenRollAt = t + WARDEN_ROLL;
  if (t - s.wardenLastAt < WARDEN_COOLDOWN) return;
  if (run.enemies.some((e) => !e.dying && (e.def.id === WARDEN_ID || e.boss === 'boss'))) return;
  const chance = run.biome() === 'dark_forest' ? WARDEN_CHANCE_DARK_FOREST : WARDEN_CHANCE;
  if (!run.rng.spawn.chance(chance)) return;
  const e = makeEnemy(run, WARDEN_ID, 0, 0, false);
  if (!e) return;
  const pt = ringPoint(run, run.rng.spawn.range(0, Math.PI * 2), e.radius);
  if (!pt) return;
  e.x = pt.x;
  e.y = pt.y;
  e.cd = 2;
  applyBiomeHp(e, biomeHpMult(run.biome()));
  run.enemies.push(e);
  s.wardenLastAt = t;
  run.announce(`${e.def.name} emerges!`, '#6fe0ff', 3);
}
