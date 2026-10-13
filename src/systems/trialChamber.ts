/**
 * Trial Chamber mechanics (v1.4 part 2).
 *
 * The flow (pure state machine `stepTrial`): idle -> fight -> key -> done.
 *   - idle: the Trial Spawner burns blue in the middle of the hall. The hero walking into the hall (at least
 *     two tiles from either door) starts the trial.
 *   - fight: both doors close (copper bars come back) and a closed wave appears around the arena: six "bogged"
 *     (mossy skeletons, strays, a skeleton: the poison-archer role; no Bogged art exists) and two "breezes" (fast
 *     hoppers: spiders here; no Breeze art exists) that also throw a telegraphed wind burst that shoves the hero.
 *     They are structure enemies (systems/structureEnemies.ts): they do not count against the spawn cap, but
 *     they count for kills and missions.
 *   - key: when the last one falls the spawner ejects a Trial Key and the bars vanish. The key opens the Vault in
 *     the corner (touch it with the key): big loot incl. an XP burst worth a level (data/lootTables.ts).
 *
 * The wave is softened (`WAVE_HP`, `WAVE_DMG`) so it is beatable at level 1-3 with the starter sword: see the
 * scripted fight in tests/structures2.test.ts and docs/DECISIONS.md for the numbers.
 */
import { makeFx } from '../entities/fx';
import type { Enemy } from '../entities/enemy';
import type { RunState, Telegraph } from '../game';
import type { Prop } from '../world/props';
import type { PlacedStructure } from '../world/structures';
import { TILE_PX } from '../world/terrain';
import { hurtPlayer } from './combat';
import { enemiesOf, structureFoe, spawnStructureEnemy } from './structureEnemies';
import { openChest, say } from './structureLoot';
import { heroDistance, propsOfKind, structuresNear } from './structureScan';

// ---------------------------------------------------------------------------------------------------
// Tunables

/** Defs of the six "bogged" (in marker order) and of the "breezes". */
export const BOGGED_DEFS = [
  'mossy_skeleton',
  'mossy_skeleton',
  'stray',
  'skeleton',
  'mossy_skeleton',
  'stray',
] as const;
export const BREEZE_DEF = 'spider';
/** The wave is a little softer than the same mobs in the open: HP and damage multipliers. */
export const WAVE_HP = 1;
export const WAVE_DMG = 1;
/** Seconds the spawned mobs are dazed (they appear with a ring, then wake). */
export const SPAWN_STUN_S = 1.0;
/** The breeze's wind burst: seconds between bursts, telegraph time, radius, damage factor and shove. */
export const WIND_CD_S = [4.5, 6.5] as const;
export const WIND_TELE_S = 0.9;
export const WIND_R = 26;
export const WIND_DMG = 0.9;
export const WIND_SHOVE_PX = 34;
/** The hall: the trial starts when the hero is inside the rectangle shrunk by this many tiles. */
const HALL_MARGIN_TILES = 1;
/** Mechanics run while the hero is within this distance. */
const ACTIVE_PX = 700;
const KEY_PICKUP_PX = 11;

// ---------------------------------------------------------------------------------------------------
// State machine (pure)

export type TrialPhase = 'idle' | 'fight' | 'key' | 'done';

export interface TrialState {
  phase: TrialPhase;
  /** Seconds in the current phase. */
  t: number;
}

export type TrialEvent =
  | { type: 'start' }
  | { type: 'cleared' }
  | { type: 'vault' }
  | { type: 'locked'; why: 'key' | 'trial' };

export function newTrial(): TrialState {
  return { phase: 'idle', t: 0 };
}

/**
 * Advance the trial. `inside`: the hero is in the hall; `alive`: wave members still standing; `haveKey`: he
 * holds the key; `atVault`: he touches the vault. The fight can only end after the wave had a moment to stand.
 */
export function stepTrial(
  s: TrialState,
  dt: number,
  input: { inside: boolean; alive: number; haveKey: boolean; atVault: boolean },
): TrialEvent[] {
  const ev: TrialEvent[] = [];
  s.t += dt;
  switch (s.phase) {
    case 'idle':
      if (input.inside) {
        s.phase = 'fight';
        s.t = 0;
        ev.push({ type: 'start' });
      } else if (input.atVault) ev.push({ type: 'locked', why: 'trial' });
      break;
    case 'fight':
      if (s.t > 0.3 && input.alive === 0) {
        s.phase = 'key';
        s.t = 0;
        ev.push({ type: 'cleared' });
      } else if (input.atVault) ev.push({ type: 'locked', why: 'trial' });
      break;
    case 'key':
      if (input.atVault) {
        if (input.haveKey) {
          s.phase = 'done';
          s.t = 0;
          ev.push({ type: 'vault' });
        } else ev.push({ type: 'locked', why: 'key' });
      }
      break;
    default:
      break;
  }
  return ev;
}

// ---------------------------------------------------------------------------------------------------
// Run glue

interface Wind {
  /** Seconds until the next burst; while a burst is telegraphed, the seconds until it lands. */
  cd: number;
  tele: Telegraph | null;
  x: number;
  y: number;
}

interface TrialRun {
  state: TrialState;
  bars: Prop[];
  key: Prop | null;
  vault: Prop | null;
  spawner: Prop | null;
  haveKey: boolean;
  wind: Map<number, Wind>;
  /** Cooldown of the "locked" hint, and of the ambient flame sparks. */
  hint: number;
  spark: number;
}

const RUNS = new WeakMap<RunState, Map<string, TrialRun>>();

function trialRuns(run: RunState): Map<string, TrialRun> {
  let m = RUNS.get(run);
  if (!m) {
    m = new Map();
    RUNS.set(run, m);
  }
  return m;
}

function setup(run: RunState, s: PlacedStructure): TrialRun {
  const bars = propsOfKind(s, 'copper_bars');
  const key = propsOfKind(s, 'trial_key')[0] ?? null;
  for (const b of bars) run.world.removeProp(b); // the doors are open until the trial starts
  if (key) run.world.removeProp(key); // the key does not exist until the spawner ejects it
  return {
    state: newTrial(),
    bars,
    key,
    vault: propsOfKind(s, 'vault')[0] ?? null,
    spawner: propsOfKind(s, 'trial_spawner')[0] ?? null,
    haveKey: false,
    wind: new Map(),
    hint: 0,
    spark: 0,
  };
}

function heroInside(run: RunState, s: PlacedStructure): boolean {
  const p = run.player;
  const m = HALL_MARGIN_TILES;
  return (
    !p.dead &&
    p.x >= (s.tx + 2 + m) * TILE_PX &&
    p.x < (s.tx + 16 - m) * TILE_PX &&
    p.y >= (s.ty + 2 + m) * TILE_PX &&
    p.y < (s.ty + 16 - m) * TILE_PX
  );
}

function spawnWave(run: RunState, s: PlacedStructure): void {
  let bogged = 0;
  for (const a of s.blueprint.actors) {
    const x = (s.tx + a.tx + 0.5) * TILE_PX;
    const y = (s.ty + a.ty + 0.5) * TILE_PX;
    let e: Enemy | null = null;
    if (a.role === 'trial_bogged') {
      const id = BOGGED_DEFS[bogged % BOGGED_DEFS.length] ?? 'skeleton';
      bogged++;
      e = spawnStructureEnemy(run, id, x, y, s.key, 'bogged', { hp: WAVE_HP, dmg: WAVE_DMG });
    } else if (a.role === 'trial_breeze') {
      e = spawnStructureEnemy(run, BREEZE_DEF, x, y, s.key, 'breeze', {
        hp: WAVE_HP * 1.6,
        dmg: WAVE_DMG,
      });
    }
    if (!e) continue;
    e.stunT = SPAWN_STUN_S;
    run.fx.push(makeFx('ring', x, y - 6, 0.5, { r: 14, color: '#7ad8ff' }));
  }
}

function burst(run: RunState, tr: TrialRun, s: PlacedStructure, dt: number): void {
  const p = run.player;
  const alive = new Set<number>();
  for (const e of enemiesOf(run, s.key, 'breeze')) {
    alive.add(e.id);
    let w = tr.wind.get(e.id);
    if (!w) {
      w = { cd: run.rng.ai.range(2, 3.5), tele: null, x: 0, y: 0 };
      tr.wind.set(e.id, w);
    }
    if (e.stunT > 0 || p.dead || !structureFoe(e)?.aggro) continue;
    w.cd -= dt;
    if (w.tele === null) {
      if (w.cd <= 0 && Math.hypot(p.x - e.x, p.y - e.y) < 190) {
        w.x = p.x;
        w.y = p.y;
        w.cd = WIND_TELE_S;
        w.tele = {
          kind: 'circle',
          x: w.x,
          y: w.y,
          x2: 0,
          y2: 0,
          r: WIND_R,
          t: 0,
          dur: WIND_TELE_S,
        };
        run.telegraphs.push(w.tele);
        run.emit('hiss');
      }
    } else if (w.cd <= 0) {
      const i = run.telegraphs.indexOf(w.tele);
      if (i >= 0) run.telegraphs.splice(i, 1);
      w.tele = null;
      w.cd = run.rng.ai.range(WIND_CD_S[0], WIND_CD_S[1]);
      run.fx.push(makeFx('ring', w.x, w.y - 4, 0.4, { r: WIND_R, color: '#d8f4ff' }));
      run.emit('explode');
      const dx = p.x - w.x;
      const dy = p.y - w.y;
      const d = Math.hypot(dx, dy);
      if (d < WIND_R + p.radius) {
        hurtPlayer(run, e.dmg * WIND_DMG, e);
        // Shove the hero away from the middle of the burst (away from the breeze if he stands on it).
        const ux = d > 1 ? dx / d : (p.x - e.x) / (Math.hypot(p.x - e.x, p.y - e.y) || 1);
        const uy = d > 1 ? dy / d : (p.y - e.y) / (Math.hypot(p.x - e.x, p.y - e.y) || 1);
        const r = run.world.collide(p.x + ux * WIND_SHOVE_PX, p.y + uy * WIND_SHOVE_PX, p.radius);
        p.x = r.x;
        p.y = r.y;
      }
    }
  }
  for (const id of tr.wind.keys()) if (!alive.has(id)) tr.wind.delete(id);
}

function eject(run: RunState, tr: TrialRun): void {
  for (const b of tr.bars) run.world.removeProp(b);
  const sp = tr.spawner;
  if (tr.key) {
    run.world.restoreProp(tr.key);
    if (sp)
      for (let i = 0; i < 8; i++)
        run.fx.push(
          makeFx('spark', tr.key.x + run.rng.fx.range(-4, 4), tr.key.y - 6, 0.8, {
            vx: run.rng.fx.range(-24, 24),
            vy: run.rng.fx.range(-40, -16),
            color: '#8af6e0',
          }),
        );
  }
}

/** Per-step hook (updateStructureInteract). */
export function updateTrialChamber(run: RunState, dt: number): void {
  const runs = trialRuns(run);
  const p = run.player;
  for (const s of structuresNear(run, 'trial_chamber')) {
    if (heroDistance(run, s) > ACTIVE_PX) continue;
    let tr = runs.get(s.key);
    if (!tr) {
      tr = setup(run, s);
      runs.set(s.key, tr);
    }
    const v = tr.vault;
    const vaultGone = v ? run.world.isRemoved(v) : true;
    const atVault =
      !p.dead && !!v && !vaultGone && Math.hypot(v.x - p.x, v.y - p.y) < v.radius + p.radius + 6;
    tr.hint = Math.max(0, tr.hint - dt);
    // Pick the key up.
    if (tr.key && !tr.haveKey && tr.state.phase === 'key' && !run.world.isRemoved(tr.key)) {
      if (!p.dead && Math.hypot(tr.key.x - p.x, tr.key.y - p.y) < KEY_PICKUP_PX) {
        run.world.removeProp(tr.key);
        tr.haveKey = true;
        say(run, tr.key.x, tr.key.y, 'Trial Key', '#8af6e0', 1.8);
        run.emit('emerald');
        run.fx.push(makeFx('ring', tr.key.x, tr.key.y - 6, 0.4, { r: 14, color: '#8af6e0' }));
      }
    }
    const alive = enemiesOf(run, s.key).length;
    for (const ev of stepTrial(tr.state, dt, {
      inside: heroInside(run, s),
      alive,
      haveKey: tr.haveKey,
      atVault,
    })) {
      switch (ev.type) {
        case 'start':
          for (const b of tr.bars) run.world.restoreProp(b);
          spawnWave(run, s);
          run.announce('TRIAL! The doors are sealed', '#7ad8ff', 3);
          run.emit('boss');
          run.shake = Math.max(run.shake, 4);
          break;
        case 'cleared':
          eject(run, tr);
          run.announce('Trial cleared! Take the Trial Key', '#8af6e0', 3.5);
          run.emit('levelup');
          break;
        case 'locked':
          if (tr.hint <= 0 && v) {
            tr.hint = 2.2;
            say(
              run,
              v.x,
              v.y,
              ev.why === 'key' ? 'Needs the Trial Key' : 'Win the trial first',
              '#ff9a9a',
              1.5,
            );
          }
          break;
        case 'vault':
          if (v) openChest(run, v);
          tr.haveKey = false;
          run.announce('Trial passed!', '#8af6e0', 3);
          break;
      }
    }
    if (tr.state.phase === 'fight') burst(run, tr, s, dt);
    // The spawner's blue flame: sparks while it waits or fights.
    tr.spark -= dt;
    const sp = tr.spawner;
    if (sp && tr.spark <= 0 && tr.state.phase !== 'done' && heroDistance(run, s) < 400) {
      tr.spark = tr.state.phase === 'fight' ? 0.12 : 0.3;
      run.fx.push(
        makeFx('spark', sp.x + run.rng.fx.range(-5, 5), sp.y - 20, 0.7, {
          vx: run.rng.fx.range(-8, 8),
          vy: run.rng.fx.range(-34, -18),
          color: run.rng.fx.chance(0.5) ? '#7ad8ff' : '#e8fbff',
        }),
      );
    }
  }
}

/** The trial of a structure in a run (tests, debug). */
export function trialState(run: RunState, key: string): TrialRun | undefined {
  return RUNS.get(run)?.get(key);
}

export type { TrialRun };
