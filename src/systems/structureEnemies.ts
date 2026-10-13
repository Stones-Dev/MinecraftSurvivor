/**
 * Enemies that belong to a structure (v1.4 part 2): the Trial Chamber's wave, the Pillager Outpost's guards,
 * the village raiders and the Witch Hut's witch.
 *
 * They are ordinary `Enemy` objects in `run.enemies` (same AI, same kill rewards, they count for kills and
 * missions), tagged in a WeakMap so that:
 *   - they do not count against the spawner's soft cap (`spawnCount` in systems/spawner.ts) and are never
 *     recycled onto the spawn ring;
 *   - at most `MAX_STRUCTURE_ENEMIES` of them live at once (spawning refuses beyond that: bounded and
 *     deterministic);
 *   - guards stand at their posts until the hero comes close (`guard`), instead of walking after him from the
 *     moment they spawn;
 *   - an owner (a structure instance) can list or remove its own.
 *
 * It also holds the Black Cat's hook for creepers (`calmCreepers`): the one place that bends the creeper
 * behaviour, without touching enemyAI.ts.
 */
import { dmgScale, ENEMIES, type EnemyDef, hpScale } from '../data/enemies';
import { Enemy } from '../entities/enemy';
import { makeFx } from '../entities/fx';
import type { RunState } from '../game';

/** Most structure enemies alive at once in a run (a raid wave is the biggest user). */
export const MAX_STRUCTURE_ENEMIES = 16;

export interface StructureFoe {
  /** The structure instance key (`<id>@<tx>,<ty>`) this enemy belongs to. */
  owner: string;
  /** Free-form role within the owner ('pillager', 'captain', 'bogged', 'breeze', 'raider'...). */
  role: string;
  /** Guards stay at (homeX, homeY) until the hero is within `aggroPx`. */
  guard: boolean;
  aggro: boolean;
  aggroPx: number;
  homeX: number;
  homeY: number;
}

const FOES = new WeakMap<Enemy, StructureFoe>();

export function structureFoe(e: Enemy): StructureFoe | undefined {
  return FOES.get(e);
}

export function isStructureEnemy(e: Enemy): boolean {
  return FOES.has(e);
}

/** Structure enemies in the run (dying ones included unless `aliveOnly`). */
export function structureEnemyCount(run: RunState, aliveOnly = false): number {
  let n = 0;
  for (const e of run.enemies) if (FOES.has(e) && !(aliveOnly && e.dying)) n++;
  return n;
}

/** Enemies counted against the spawner's soft cap: everything except structure enemies. */
export function spawnCount(run: RunState): number {
  return run.enemies.length - structureEnemyCount(run);
}

export interface SpawnOpts {
  guard?: boolean;
  aggroPx?: number;
  /** Multipliers on top of the time scaling (trial mobs are softened, captains are tougher). */
  hp?: number;
  dmg?: number;
  banner?: boolean;
  elite?: boolean;
}

/**
 * Spawn an enemy for `owner`. `def` is an id from data/enemies.ts or a derived def (the Raid Captain). Returns
 * null when the cap is reached or the id is unknown. Scaling mirrors `makeEnemy`.
 */
export function spawnStructureEnemy(
  run: RunState,
  def: string | EnemyDef,
  x: number,
  y: number,
  owner: string,
  role: string,
  opts: SpawnOpts = {},
): Enemy | null {
  if (structureEnemyCount(run, true) >= MAX_STRUCTURE_ENEMIES) return null;
  const d = typeof def === 'string' ? ENEMIES[def] : def;
  if (!d) return null;
  const minute = run.time / 60;
  const e = new Enemy(d, run.nextEnemyId++);
  e.x = x;
  e.y = y;
  e.elite = opts.elite === true;
  e.maxHp = d.hp * hpScale(minute) * (e.elite ? 1.6 : 1) * (opts.hp ?? 1);
  e.hp = e.maxHp;
  e.dmg = d.dmg * dmgScale(minute) * (e.elite ? 1.25 : 1) * (opts.dmg ?? 1);
  e.cd = run.rng.spawn.range(0.8, 2);
  e.cd2 = run.rng.spawn.range(1, 4);
  if (d.shieldPct) e.shield = d.shieldPct * e.maxHp;
  e.banner = opts.banner === true;
  FOES.set(e, {
    owner,
    role,
    guard: opts.guard === true,
    aggro: opts.guard !== true,
    aggroPx: opts.aggroPx ?? 170,
    homeX: x,
    homeY: y,
  });
  run.enemies.push(e);
  return e;
}

/** Living (not dying) enemies of an owner, optionally of one role. */
export function enemiesOf(run: RunState, owner: string, role?: string): Enemy[] {
  const out: Enemy[] = [];
  for (const e of run.enemies) {
    const f = FOES.get(e);
    if (f && f.owner === owner && !e.dying && (role === undefined || f.role === role)) out.push(e);
  }
  return out;
}

/** Remove every enemy of an owner (the hero left, the raid failed...). Returns how many. */
export function removeOwned(run: RunState, owner: string): number {
  const before = run.enemies.length;
  run.enemies = run.enemies.filter((e) => FOES.get(e)?.owner !== owner);
  return before - run.enemies.length;
}

/**
 * Per-step upkeep, run after the enemies have moved: guards that are still unprovoked go back to their post
 * (so they never walk off) and wake when the hero is within their aggro distance or something hurt them.
 */
export function updateGuards(run: RunState): void {
  const p = run.player;
  for (const e of run.enemies) {
    const f = FOES.get(e);
    if (!f || !f.guard || f.aggro || e.dying) continue;
    if (e.hp < e.maxHp || Math.hypot(p.x - e.x, p.y - e.y) < f.aggroPx) {
      f.aggro = true;
      continue;
    }
    e.x = f.homeX;
    e.y = f.homeY;
    e.kx = e.ky = 0;
    e.cd = Math.max(e.cd, 1);
    e.state = 'move';
  }
}

// ---------------------------------------------------------------------------------------------------
// The Black Cat: creepers keep away from a hero who is near it

/** Hero within this many pixels of a black cat: creepers will not come near or explode. */
export const CAT_AURA_PX = 150;
/** Creepers inside this distance of the hero are pushed back out. */
export const CAT_KEEP_PX = 80;

const scaredAt = new WeakMap<Enemy, number>();

/** Creepers, charged and icy ones included: the kamikaze archetype. */
export function isCreeper(e: Enemy): boolean {
  return e.def.archetype === 'kamikaze';
}

/**
 * Keep creepers off a hero who is within `CAT_AURA_PX` of a black cat at (catX, catY): a fuse that was lit is
 * put out, and a creeper closer than `CAT_KEEP_PX` is walked back out faster than it advances. Returns how many
 * creepers were handled. Call once per step after the enemies moved.
 */
export function calmCreepers(run: RunState, catX: number, catY: number, dt: number): number {
  const p = run.player;
  if (p.dead || Math.hypot(p.x - catX, p.y - catY) > CAT_AURA_PX) return 0;
  let n = 0;
  for (const e of run.enemies) {
    if (e.dying || !isCreeper(e)) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > CAT_KEEP_PX * 3) continue;
    n++;
    if (e.state === 'fuse') {
      e.state = 'move';
      e.stateT = 0;
    }
    if (d < CAT_KEEP_PX) {
      // Net retreat of 30 px/s on top of the creeper's own advance.
      const v = e.speed + 30;
      const r = run.world.collide(e.x + (dx / d) * v * dt, e.y + (dy / d) * v * dt, e.radius);
      e.x = r.x;
      e.y = r.y;
      if (run.time - (scaredAt.get(e) ?? -9) > 3) {
        scaredAt.set(e, run.time);
        run.fx.push(makeFx('text', e.x, e.y - 20, 0.9, { text: '...', vy: -10, color: '#c9a0ff' }));
      }
    }
  }
  return n;
}
