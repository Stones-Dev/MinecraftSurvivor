/**
 * Pillager Outpost, Bad Omen, village raids and Hero of the Village (v1.4 part 2).
 *
 * The outpost: when the hero comes within `GUARD_SPAWN_PX`, its guards appear at their posts (structure enemies,
 * systems/structureEnemies.ts): four to six Pillagers and the Raid Captain in the tower, who carries the
 * ominous banner (`Enemy.banner`: the usual banner chest on death). Guards stand still until the hero is near or
 * they are hurt. Kills are remembered, so a hero who walks away and comes back finds only the survivors.
 *
 * The cage: stand next to it for 1 s to open it. The captive Toucan or Bat joins the run (run-only: the run's
 * own loadout copy gets the pet, so its effect and sprite work; nothing is written to the collection) if the
 * hero has no pet; with a pet already, the freed bird hands over a Spawn Egg instead (there is no second pet slot).
 *
 * Bad Omen: killing the Captain gives 180 s of it (HUD tag). Entering a village with Bad Omen starts a raid
 * (pure state machine `stepRaid`): three waves of Pillagers and Vindicators, the last with a Ravager (a Hoglin
 * here: the strongest heavy melee mob that exists), 16 enemies alive at most. Repelling all three gives Hero of
 * the Village for 180 s: half-price village services and the legendary chest in the plaza. Abandoning the
 * village (700 px away) ends the raid and the Bad Omen is lost either way.
 */
import { ENEMIES, type EnemyDef } from '../data/enemies';
import { petById } from '../data/companions';
import { PetState } from '../entities/ally';
import { makeFx } from '../entities/fx';
import type { RunState } from '../game';
import type { Prop } from '../world/props';
import type { PlacedStructure } from '../world/structures';
import { TILE_PX } from '../world/terrain';
import { enemiesOf, removeOwned, spawnStructureEnemy, type StructureFoe } from './structureEnemies';
import type { Enemy } from '../entities/enemy';
import { say } from './structureLoot';
import {
  heroDistance,
  insideFootprint,
  propsOfKind,
  structuresAround,
  structuresNear,
} from './structureScan';

// ---------------------------------------------------------------------------------------------------
// Tunables

export const BAD_OMEN_S = 180;
export const HERO_S = 180;
/** Village services cost this fraction while Hero of the Village lasts. */
export const HERO_PRICE = 0.5;
export const GUARD_SPAWN_PX = 420;
export const GUARD_DESPAWN_PX = 1000;
export const GUARD_AGGRO_PX = 170;
export const CAGE_REACH_PX = 22;
export const CAGE_DWELL_S = 1.0;
/** The raid ends when the hero is this far from the village. */
export const RAID_LEASH_PX = 700;
/** An idle raid of a village farther away than this is dropped from the bookkeeping. */
export const RAID_FORGET_PX = 1500;
export const RAID_INTRO_S = 3;
export const RAID_BETWEEN_S = 4;
/** Raiders appear on this ring around the village middle. */
const RAID_RING_PX = 170;

export interface RaidWave {
  pillager: number;
  vindicator: number;
  /** The heavy: a Hoglin (the Ravager role). */
  ravager: number;
}

export const RAID_WAVES: readonly RaidWave[] = [
  { pillager: 3, vindicator: 2, ravager: 0 },
  { pillager: 3, vindicator: 3, ravager: 0 },
  { pillager: 2, vindicator: 2, ravager: 1 },
];

/** The Raid Captain of an outpost: a bigger Pillager with the Captain's sprite. Not registered in ENEMIES. */
export const OUTPOST_CAPTAIN: EnemyDef = (() => {
  const base = ENEMIES['pillager'];
  if (!base) throw new Error('pillager def missing');
  return {
    ...base,
    id: 'outpost_captain',
    sprite: 'mob.pillager_captain',
    name: 'Raid Captain',
    hp: 110,
    dmg: 10,
    speed: 30,
    radius: 8,
    xp: 30,
    scale: 1.45,
    height: 30,
    faceLeft: ENEMIES['raid_captain']?.faceLeft ?? true,
  };
})();

// ---------------------------------------------------------------------------------------------------
// Raid state machine (pure)

export type RaidPhase = 'idle' | 'intro' | 'wave' | 'between' | 'won' | 'failed';

export interface RaidState {
  phase: RaidPhase;
  /** Index of the current wave. */
  wave: number;
  t: number;
}

export type RaidEvent =
  { type: 'start' } | { type: 'wave'; wave: number } | { type: 'won' } | { type: 'failed' };

export function newRaid(): RaidState {
  return { phase: 'idle', wave: 0, t: 0 };
}

export function stepRaid(
  s: RaidState,
  dt: number,
  input: { omen: boolean; inVillage: boolean; far: boolean; alive: number },
): RaidEvent[] {
  const ev: RaidEvent[] = [];
  if (s.phase === 'won' || s.phase === 'failed') return ev;
  s.t += dt;
  if (s.phase === 'idle') {
    if (input.omen && input.inVillage) {
      s.phase = 'intro';
      s.t = 0;
      ev.push({ type: 'start' });
    }
    return ev;
  }
  if (input.far) {
    s.phase = 'failed';
    ev.push({ type: 'failed' });
    return ev;
  }
  if (s.phase === 'intro') {
    if (s.t >= RAID_INTRO_S) {
      s.phase = 'wave';
      s.wave = 0;
      s.t = 0;
      ev.push({ type: 'wave', wave: 0 });
    }
  } else if (s.phase === 'wave') {
    if (input.alive === 0 && s.t > 1) {
      if (s.wave + 1 < RAID_WAVES.length) {
        s.phase = 'between';
        s.t = 0;
      } else {
        s.phase = 'won';
        ev.push({ type: 'won' });
      }
    }
  } else if (s.t >= RAID_BETWEEN_S) {
    s.wave++;
    s.phase = 'wave';
    s.t = 0;
    ev.push({ type: 'wave', wave: s.wave });
  }
  return ev;
}

/** Number of raiders in a wave. */
export function waveSize(w: RaidWave): number {
  return w.pillager + w.vindicator + w.ravager;
}

// ---------------------------------------------------------------------------------------------------
// Per-run state

interface Member {
  idx: number;
  role: string;
  enemy: Enemy;
}

interface OutpostRun {
  s: PlacedStructure;
  spawned: boolean;
  dead: Set<number>;
  members: Member[];
  cage: Prop | null;
  cageOpen: Prop | null;
  dwell: number;
  freed: boolean;
}

interface RaidRun {
  s: PlacedStructure;
  state: RaidState;
  chest: Prop | null;
}

interface Meta {
  omenUntil: number;
  heroUntil: number;
  outposts: Map<string, OutpostRun>;
  raids: Map<string, RaidRun>;
}

const METAS = new WeakMap<RunState, Meta>();

function meta(run: RunState): Meta {
  let m = METAS.get(run);
  if (!m) {
    m = { omenUntil: -1, heroUntil: -1, outposts: new Map(), raids: new Map() };
    METAS.set(run, m);
  }
  return m;
}

/** Seconds of Bad Omen left (0 when none). */
export function badOmenLeft(run: RunState): number {
  return Math.max(0, (METAS.get(run)?.omenUntil ?? -1) - run.time);
}

/** Seconds of Hero of the Village left (0 when none). */
export function heroLeft(run: RunState): number {
  return Math.max(0, (METAS.get(run)?.heroUntil ?? -1) - run.time);
}

/** Price factor of village services: 0.5 under Hero of the Village, else 1. */
export function servicePriceFactor(run: RunState): number {
  return heroLeft(run) > 0 ? HERO_PRICE : 1;
}

export interface StatusTag {
  text: string;
  color: string;
  /** Seconds left, for a countdown next to the label. */
  left: number;
}

/** HUD tags of the structure effects owned here (Bad Omen, Hero of the Village). */
export function outpostStatusTags(run: RunState): StatusTag[] {
  const out: StatusTag[] = [];
  const omen = badOmenLeft(run);
  if (omen > 0) out.push({ text: 'Bad Omen', color: '#7ad0d8', left: omen });
  const hero = heroLeft(run);
  if (hero > 0) out.push({ text: 'Hero', color: '#7dff9a', left: hero });
  return out;
}

/** Grant Bad Omen (killing an outpost Captain; tests and debug use it too). */
export function grantBadOmen(run: RunState): void {
  meta(run).omenUntil = run.time + BAD_OMEN_S;
  run.announce('Bad Omen! Villages will call for a raid', '#7ad0d8', 4);
  run.emit('boss');
}

// ---------------------------------------------------------------------------------------------------
// Outpost

function setupOutpost(run: RunState, s: PlacedStructure): OutpostRun {
  const cageOpen = propsOfKind(s, 'cage_open')[0] ?? null;
  if (cageOpen) run.world.removeProp(cageOpen); // the open cage appears when the door is opened
  return {
    s,
    spawned: false,
    dead: new Set(),
    members: [],
    cage: propsOfKind(s, 'cage')[0] ?? null,
    cageOpen,
    dwell: 0,
    freed: false,
  };
}

function spawnGuards(run: RunState, o: OutpostRun): void {
  const s = o.s;
  s.blueprint.actors.forEach((a, idx) => {
    if (o.dead.has(idx)) return;
    if (a.role !== 'pillager' && a.role !== 'captain') return;
    const x = (s.tx + a.tx + 0.5) * TILE_PX;
    const y = (s.ty + a.ty + 0.5) * TILE_PX;
    const captain = a.role === 'captain';
    const e = spawnStructureEnemy(
      run,
      captain ? OUTPOST_CAPTAIN : 'pillager',
      x,
      y,
      s.key,
      a.role,
      {
        guard: true,
        aggroPx: captain ? 130 : GUARD_AGGRO_PX,
        banner: captain,
      },
    );
    if (e) o.members.push({ idx, role: a.role, enemy: e });
  });
  o.spawned = true;
}

function stepOutpost(run: RunState, o: OutpostRun, dt: number): void {
  const p = run.player;
  const d = heroDistance(run, o.s);
  if (!o.spawned && d < GUARD_SPAWN_PX) spawnGuards(run, o);
  if (o.spawned && d > GUARD_DESPAWN_PX) {
    removeOwned(run, o.s.key);
    o.members = [];
    o.spawned = false;
  }
  // Who has fallen? The Captain leaves Bad Omen behind.
  for (let i = o.members.length - 1; i >= 0; i--) {
    const m = o.members[i];
    if (!m || !m.enemy.dying) continue;
    o.dead.add(m.idx);
    o.members.splice(i, 1);
    if (m.role === 'captain') grantBadOmen(run);
  }
  // The cage.
  const cage = o.cage;
  if (cage && !o.freed) {
    if (!p.dead && Math.hypot(cage.x - p.x, cage.y - p.y) < CAGE_REACH_PX) {
      const before = o.dwell;
      o.dwell += dt;
      if (before < CAGE_DWELL_S / 2 && o.dwell >= CAGE_DWELL_S / 2)
        run.fx.push(makeFx('ring', cage.x, cage.y - 8, 0.3, { r: 10, color: '#ffe27a' }));
      if (o.dwell >= CAGE_DWELL_S) freeCaptive(run, o, cage);
    } else o.dwell = Math.max(0, o.dwell - dt * 2);
  }
}

/** What opening the cage gives: the captive joins as a run-only pet, or hands over an egg. */
export function captiveReward(hasPet: boolean): 'pet' | 'egg' {
  return hasPet ? 'egg' : 'pet';
}

function freeCaptive(run: RunState, o: OutpostRun, cage: Prop): void {
  o.freed = true;
  run.world.removeProp(cage);
  if (o.cageOpen) run.world.restoreProp(o.cageOpen);
  const id = cage.variant % 8 === 1 ? 'bat' : 'toucan';
  const def = petById(id);
  run.emit('levelup');
  run.fx.push(makeFx('ring', cage.x, cage.y - 8, 0.45, { r: 18, color: '#ffe27a' }));
  if (def && captiveReward(run.loadout.pet !== null) === 'pet') {
    run.loadout.pet = { id, level: 1 };
    run.pet = new PetState(def, 1, cage.x, cage.y - 6);
    run.recomputeStats();
    say(run, cage.x, cage.y, `${def.name} joins you!`, '#7dff9a', 2.2);
    run.announce(`${def.name} freed: it follows you for this run`, '#7dff9a', 3.5);
  } else {
    run.spawnEggs += 1;
    run.emit('egg');
    say(run, cage.x, cage.y, 'Spawn Egg! (pet slot taken)', '#ff9ad0', 2.2);
    run.announce(
      `${def?.name ?? 'The captive'} is free and leaves you a Spawn Egg`,
      '#ff9ad0',
      3.5,
    );
  }
}

// ---------------------------------------------------------------------------------------------------
// Raid

function setupRaid(run: RunState, s: PlacedStructure): RaidRun {
  const chest = propsOfKind(s, 'chest_legendary')[0] ?? null;
  if (chest) run.world.removeProp(chest); // appears when the raid is repelled
  return { s, state: newRaid(), chest };
}

function raiderPoints(run: RunState, s: PlacedStructure, n: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const base = run.rng.spawn.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 8; k++) {
      const a = base + (i / n) * Math.PI * 2 + k * 0.37;
      const x = s.cx + Math.cos(a) * RAID_RING_PX;
      const y = s.cy + Math.sin(a) * RAID_RING_PX;
      const r = run.world.collide(x, y, 6);
      if (Math.abs(r.x - x) < 3 && Math.abs(r.y - y) < 3 && run.world.surface(x, y) === 'ground') {
        out.push({ x, y });
        break;
      }
    }
  }
  return out;
}

function spawnWaveAt(run: RunState, s: PlacedStructure, wave: number): void {
  const w = RAID_WAVES[wave];
  if (!w) return;
  const ids: string[] = [
    ...Array<string>(w.pillager).fill('pillager'),
    ...Array<string>(w.vindicator).fill('vindicator'),
    ...Array<string>(w.ravager).fill('hoglin'),
  ];
  const pts = raiderPoints(run, s, ids.length);
  ids.forEach((id, i) => {
    const pt = pts[i] ?? pts[0];
    if (!pt) return;
    const e = spawnStructureEnemy(run, id, pt.x, pt.y, s.key, 'raider', { hp: 0.9, dmg: 0.9 });
    if (e) run.fx.push(makeFx('ring', pt.x, pt.y - 6, 0.5, { r: 14, color: '#d05a5a' }));
  });
  run.announce(`Raid: wave ${wave + 1} of ${RAID_WAVES.length}`, '#ff8a6a', 3);
  run.emit('boss');
}

function stepRaidRun(run: RunState, r: RaidRun, dt: number): void {
  // A repelled or abandoned raid is over for the run: nothing to scan or step.
  if (r.state.phase === 'won' || r.state.phase === 'failed') return;
  const m = meta(run);
  const p = run.player;
  // Only a running wave looks at the raiders (a scan of every enemy); idle/intro/between do not need it.
  const alive = r.state.phase === 'wave' ? enemiesOf(run, r.s.key, 'raider').length : 0;
  const events = stepRaid(r.state, dt, {
    omen: m.omenUntil > run.time,
    inVillage: !p.dead && insideFootprint(r.s, p.x, p.y, 0),
    far: heroDistance(run, r.s) > RAID_LEASH_PX,
    alive,
  });
  for (const ev of events) {
    switch (ev.type) {
      case 'start':
        m.omenUntil = -1; // the omen is spent: it called this raid
        run.announce('RAID! The village is under attack', '#ff6b6b', 4);
        run.emit('hiss');
        break;
      case 'wave':
        spawnWaveAt(run, r.s, ev.wave);
        break;
      case 'failed':
        removeOwned(run, r.s.key);
        run.announce('The raid moves on...', '#c0c0c0', 3);
        break;
      case 'won':
        m.heroUntil = run.time + HERO_S;
        if (r.chest) run.world.restoreProp(r.chest);
        run.stats.structure('hero');
        run.announce('HERO OF THE VILLAGE! Half-price services', '#7dff9a', 5);
        run.emit('legendary');
        if (r.chest)
          for (let i = 0; i < 10; i++)
            run.fx.push(
              makeFx('spark', r.chest.x + run.rng.fx.range(-6, 6), r.chest.y - 8, 0.9, {
                vx: run.rng.fx.range(-20, 20),
                vy: run.rng.fx.range(-44, -18),
                color: '#ffd84a',
              }),
            );
        break;
    }
  }
}

/** The raid of a village in a run (tests, debug). */
export function raidState(run: RunState, villageKey: string): RaidState | undefined {
  return METAS.get(run)?.raids.get(villageKey)?.state;
}

/** The outpost bookkeeping of a run (tests, debug). */
export function outpostRun(run: RunState, key: string): OutpostRun | undefined {
  return METAS.get(run)?.outposts.get(key);
}

/** Per-step hook (updateStructureInteract). */
export function updatePillagerOutpost(run: RunState, dt: number): void {
  const m = meta(run);
  for (const s of structuresNear(run, 'pillager_outpost')) {
    if (!m.outposts.has(s.key)) m.outposts.set(s.key, setupOutpost(run, s));
  }
  for (const o of m.outposts.values()) stepOutpost(run, o, dt);
  for (const s of structuresAround(run)) {
    if (s.def.id === 'village' && !m.raids.has(s.key)) m.raids.set(s.key, setupRaid(run, s));
  }
  for (const [key, r] of m.raids) {
    stepRaidRun(run, r, dt);
    // A village the hero left far behind forgets its (still idle) raid; it is rebuilt when seen again. Won and
    // failed raids stay: they hold the result (no second raid, the chest is not hidden again).
    if (r.state.phase === 'idle' && heroDistance(run, r.s) > RAID_FORGET_PX) m.raids.delete(key);
  }
}

export type { OutpostRun, RaidRun, StructureFoe };
