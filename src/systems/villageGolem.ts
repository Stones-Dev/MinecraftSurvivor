/**
 * The village Iron Golem (v1.4). A standalone defender, not an ally: no slot, no HP bar, never hurt. It
 * patrols a few tiles around the village plaza, never attacks the hero, and charges any enemy that comes
 * within 80 px of it (and within its leash of the village): 40 damage and a hard knockback on contact,
 * then it backs off for a moment. It exists only while the hero is near its village (spawned and removed
 * by `updateVillageGolem`, hooked from systems/npcs.ts `updateNpcs`).
 *
 * `stepGolem` is pure (tests): it moves a `GolemState` and reports which enemy it hit.
 */
import { damageEnemy } from './combat';
import type { RunState } from '../game';
import { structuresInRect, type PlacedStructure } from '../world/structures';
import type { Npc } from './npcs';
import { TILE_PX } from '../world/terrain';

export const GOLEM_DAMAGE = 40;
export const GOLEM_KNOCK = 240;
/** An enemy this close to the golem is charged. */
export const GOLEM_SIGHT = 80;
/** The golem never strays further than this from its post. */
export const GOLEM_LEASH = 200;
const PATROL_SPEED = 28;
const CHARGE_SPEED = 120;
const HIT_REACH = 15;
const RECOVER_S = 0.7;
const COOLDOWN_S = 1.2;
const WANDER_R = 36;

export interface GolemState {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  /** Last move direction and whether it moved this step (sprite). */
  dx: number;
  dy: number;
  moving: boolean;
  mode: 'patrol' | 'charge' | 'recover';
  /** Seconds in the current mode / until the next hit is allowed. */
  t: number;
  cd: number;
  /** Current patrol destination and the pause before choosing the next. */
  goalX: number;
  goalY: number;
  pause: number;
  target: number | null;
}

export function newGolem(homeX: number, homeY: number): GolemState {
  return {
    x: homeX,
    y: homeY,
    homeX,
    homeY,
    dx: 0,
    dy: 1,
    moving: false,
    mode: 'patrol',
    t: 0,
    cd: 0,
    goalX: homeX,
    goalY: homeY,
    pause: 1,
    target: null,
  };
}

export interface GolemFoe {
  id: number;
  x: number;
  y: number;
}

function walk(g: GolemState, tx: number, ty: number, speed: number, dt: number): number {
  const dx = tx - g.x;
  const dy = ty - g.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) {
    g.moving = false;
    return d;
  }
  const step = Math.min(d, speed * dt);
  g.x += (dx / d) * step;
  g.y += (dy / d) * step;
  g.dx = dx / d;
  g.dy = dy / d;
  g.moving = true;
  return d;
}

/**
 * Advance the golem. `foes` are the living enemies (any order); `rand` a [0, 1) stream for patrol goals.
 * Returns the id of the enemy hit this step, or null. The hero is not an input: the golem cannot hurt him.
 */
export function stepGolem(
  g: GolemState,
  dt: number,
  foes: readonly GolemFoe[],
  rand: () => number,
): number | null {
  g.t += dt;
  g.cd = Math.max(0, g.cd - dt);
  g.moving = false;
  if (g.mode === 'recover') {
    // Back toward the post while the swing settles.
    walk(g, g.homeX, g.homeY, PATROL_SPEED * 1.5, dt);
    if (g.t >= RECOVER_S) {
      g.mode = 'patrol';
      g.t = 0;
    }
    return null;
  }
  // Pick the nearest enemy inside the sight radius that is also inside the leash.
  let best: GolemFoe | null = null;
  let bestD = GOLEM_SIGHT;
  for (const f of foes) {
    const d = Math.hypot(f.x - g.x, f.y - g.y);
    if (d >= bestD) continue;
    if (Math.hypot(f.x - g.homeX, f.y - g.homeY) > GOLEM_LEASH) continue;
    best = f;
    bestD = d;
  }
  if (best && g.cd <= 0) {
    g.mode = 'charge';
    g.target = best.id;
    const d = walk(g, best.x, best.y, CHARGE_SPEED, dt);
    if (d <= HIT_REACH) {
      g.cd = COOLDOWN_S;
      g.mode = 'recover';
      g.t = 0;
      g.target = null;
      return best.id;
    }
    return null;
  }
  g.mode = 'patrol';
  g.target = null;
  g.pause -= dt;
  if (Math.hypot(g.goalX - g.x, g.goalY - g.y) < 2) {
    g.moving = false;
    if (g.pause <= 0) {
      const a = rand() * Math.PI * 2;
      const r = rand() * WANDER_R;
      g.goalX = g.homeX + Math.cos(a) * r;
      g.goalY = g.homeY + Math.sin(a) * r;
      g.pause = 1.5 + rand() * 2.5;
    }
  } else {
    walk(g, g.goalX, g.goalY, PATROL_SPEED, dt);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Run glue

/** Village golems that exist in a run: village key -> npc id and state. */
const GOLEMS = new WeakMap<RunState, Map<string, { npcId: number; g: GolemState }>>();
/** Spawn when the hero is this close to the village, remove when he is further than the second value. */
const SPAWN_PX = 560;
const DESPAWN_PX = 800;
let scanT = 0;

function stateMap(run: RunState): Map<string, { npcId: number; g: GolemState }> {
  let m = GOLEMS.get(run);
  if (!m) {
    m = new Map();
    GOLEMS.set(run, m);
  }
  return m;
}

/** Village golems of a run (tests, debug). */
export function villageGolems(run: RunState): { npcId: number; g: GolemState }[] {
  return [...stateMap(run).values()];
}

function golemHome(v: PlacedStructure): { x: number; y: number } {
  const a = v.blueprint.actors.find((s) => s.role === 'golem');
  return a
    ? { x: (v.tx + a.tx + 0.5) * TILE_PX, y: (v.ty + a.ty + 0.5) * TILE_PX }
    : { x: v.cx, y: v.cy };
}

/** Spawn / remove village golems around the hero and move them. Called once per step. */
export function updateVillageGolem(run: RunState, dt: number): void {
  const p = run.player;
  const golems = stateMap(run);
  scanT -= dt;
  if (scanT <= 0) {
    scanT = 0.5;
    for (const v of structuresInRect(
      run.world,
      p.x - SPAWN_PX,
      p.y - SPAWN_PX,
      p.x + SPAWN_PX,
      p.y + SPAWN_PX,
    )) {
      if (v.def.id !== 'village' || golems.has(v.key)) continue;
      if (Math.hypot(v.cx - p.x, v.cy - p.y) > SPAWN_PX) continue;
      const home = golemHome(v);
      const g = newGolem(home.x, home.y);
      const npc: Npc = {
        id: run.nextNpcId++,
        kind: 'golem',
        x: g.x,
        y: g.y,
        dx: 0,
        dy: 1,
        moving: false,
        state: 'idle',
        t: 0,
        sprite: 'ally.iron_golem',
        leader: 0,
      };
      run.npcs.push(npc);
      golems.set(v.key, { npcId: npc.id, g });
    }
  }
  const foes: GolemFoe[] = [];
  for (const [key, entry] of golems) {
    const npc = run.npcs.find((n) => n.id === entry.npcId);
    if (!npc || Math.hypot(entry.g.homeX - p.x, entry.g.homeY - p.y) > DESPAWN_PX) {
      if (npc) run.npcs.splice(run.npcs.indexOf(npc), 1);
      golems.delete(key);
      continue;
    }
    foes.length = 0;
    for (const e of run.enemies) {
      if (!e.dying && Math.hypot(e.x - entry.g.x, e.y - entry.g.y) < GOLEM_SIGHT + 40)
        foes.push({ id: e.id, x: e.x, y: e.y });
    }
    const hitId = stepGolem(entry.g, dt, foes, () => run.rng.events.float());
    // Walls: the golem walks around the village like everyone else.
    const r = run.world.collide(entry.g.x, entry.g.y, 8);
    entry.g.x = r.x;
    entry.g.y = r.y;
    npc.x = entry.g.x;
    npc.y = entry.g.y;
    npc.dx = entry.g.dx;
    npc.dy = entry.g.dy;
    npc.moving = entry.g.moving;
    if (hitId !== null) {
      const e = run.enemies.find((en) => en.id === hitId);
      if (e) {
        damageEnemy(run, e, GOLEM_DAMAGE, entry.g.x, entry.g.y, GOLEM_KNOCK);
        run.emit('hit');
        run.shake = Math.max(run.shake, 2);
      }
    }
  }
}

/** Debug/tests: forget the golems of a run (the npc list is the caller's business). */
export function resetVillageGolems(run: RunState): void {
  GOLEMS.delete(run);
}
