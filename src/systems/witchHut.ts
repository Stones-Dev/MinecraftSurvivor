/**
 * Witch Hut mechanics (v1.4 part 2): the cauldron, the Black Cat and the Witch.
 *
 * - The Witch (the Swamp Witch mob) guards the hut as a structure enemy: she stays at her post until the hero
 *   comes within 200 px or she is hurt. A dead witch stays dead for the run.
 * - The cauldron bubbles (green sparks) until the hero stands next to it for half a second: it costs nothing and
 *   brews a random potion, once per hut per run. Seven in ten are good (Regeneration, Speed, Strength), three in
 *   ten are bad but short (Slowness 6 s, Poison 5 s: poison never kills). The result goes through the existing
 *   buff system (`run.addBuff`) or the hero's own slow / poison status.
 * - The Black Cat sits in the hut. While the hero is within 150 px of it, creepers (charged ones too) keep their
 *   distance and never light a fuse (`calmCreepers` in systems/structureEnemies.ts).
 */
import { makeFx } from '../entities/fx';
import type { Enemy } from '../entities/enemy';
import type { RunState } from '../game';
import type { Prop } from '../world/props';
import type { PlacedStructure } from '../world/structures';
import { TILE_PX } from '../world/terrain';
import { calmCreepers, removeOwned, spawnStructureEnemy } from './structureEnemies';
import { say } from './structureLoot';
import { heroDistance, propsOfKind, structuresNear } from './structureScan';
import type { StatusTag } from './pillagerOutpost';

// ---------------------------------------------------------------------------------------------------
// Potions (pure)

export type Potion = 'regen' | 'speed' | 'strength' | 'slow' | 'poison';

export const POTIONS: readonly { id: Potion; weight: number; good: boolean; name: string }[] = [
  { id: 'regen', weight: 30, good: true, name: 'Regeneration' },
  { id: 'speed', weight: 20, good: true, name: 'Swiftness' },
  { id: 'strength', weight: 20, good: true, name: 'Strength' },
  { id: 'slow', weight: 15, good: false, name: 'Slowness' },
  { id: 'poison', weight: 15, good: false, name: 'Poison' },
];

/** Share of the table that is good (0.7). */
export const GOOD_SHARE =
  POTIONS.filter((p) => p.good).reduce((a, p) => a + p.weight, 0) /
  POTIONS.reduce((a, p) => a + p.weight, 0);

/** Pick a potion for `u` in [0, 1). */
export function rollPotion(u: number): (typeof POTIONS)[number] {
  const total = POTIONS.reduce((a, p) => a + p.weight, 0);
  let acc = 0;
  for (const p of POTIONS) {
    acc += p.weight / total;
    if (u < acc) return p;
  }
  return (
    POTIONS[POTIONS.length - 1] ?? POTIONS[0] ?? { id: 'regen', weight: 1, good: true, name: '' }
  );
}

/** Durations (seconds) and strengths. */
export const REGEN_S = 8;
export const REGEN_HP_PER_S = 5;
export const SPEED_S = 20;
export const STRENGTH_S = 15;
export const SLOW_S = 6;
export const POISON_S = 5;
export const POISON_DPS = 3;

export const CAULDRON_REACH_PX = 15;
export const CAULDRON_DWELL_S = 0.5;
export const WITCH_SPAWN_PX = 420;
export const WITCH_DESPAWN_PX = 1000;
export const WITCH_AGGRO_PX = 200;

// ---------------------------------------------------------------------------------------------------
// Run state

interface HutRun {
  s: PlacedStructure;
  cauldron: Prop | null;
  empty: Prop | null;
  used: boolean;
  dwell: number;
  bubble: number;
  witch: Enemy | null;
  witchDead: boolean;
}

interface Meta {
  huts: Map<string, HutRun>;
  regenUntil: number;
}

const METAS = new WeakMap<RunState, Meta>();

function meta(run: RunState): Meta {
  let m = METAS.get(run);
  if (!m) {
    m = { huts: new Map(), regenUntil: -1 };
    METAS.set(run, m);
  }
  return m;
}

/** Seconds of Regeneration left from a cauldron (0 when none). */
export function regenLeft(run: RunState): number {
  return Math.max(0, (METAS.get(run)?.regenUntil ?? -1) - run.time);
}

export function witchStatusTags(run: RunState): StatusTag[] {
  const left = regenLeft(run);
  return left > 0 ? [{ text: 'Regen', color: '#ff8aa0', left }] : [];
}

function setupHut(run: RunState, s: PlacedStructure): HutRun {
  const empty = propsOfKind(s, 'cauldron_empty')[0] ?? null;
  if (empty) run.world.removeProp(empty); // the empty cauldron appears once it is used
  return {
    s,
    cauldron: propsOfKind(s, 'cauldron')[0] ?? null,
    empty,
    used: false,
    dwell: 0,
    bubble: 0,
    witch: null,
    witchDead: false,
  };
}

/** Apply a potion to the run. Returns the label shown to the player. */
export function applyPotion(run: RunState, id: Potion): string {
  const p = run.player;
  switch (id) {
    case 'regen':
      meta(run).regenUntil = run.time + REGEN_S;
      return 'Regeneration';
    case 'speed':
      run.addBuff('speed', SPEED_S);
      return 'Swiftness';
    case 'strength':
      run.addBuff('strength', STRENGTH_S);
      return 'Strength';
    case 'slow':
      p.slowT = Math.max(p.slowT, SLOW_S);
      return 'Slowness';
    default:
      p.dotKind = 'poison';
      p.dotT = Math.max(p.dotT, POISON_S);
      p.dotDps = Math.max(p.dotDps, POISON_DPS);
      return 'Poison';
  }
}

function useCauldron(run: RunState, h: HutRun, c: Prop): void {
  h.used = true;
  const potion = rollPotion(run.rng.drops.float());
  const label = applyPotion(run, potion.id);
  run.world.removeProp(c);
  if (h.empty) run.world.restoreProp(h.empty);
  run.stats.structure('brew');
  run.emit(potion.good ? 'levelup' : 'hiss');
  say(run, c.x, c.y, label, potion.good ? '#7dff9a' : '#ff8a8a', 2);
  run.announce(
    potion.good ? `The cauldron brews ${label}!` : `A foul brew: ${label}`,
    potion.good ? '#7dff9a' : '#ff9a9a',
    2.5,
  );
  for (let i = 0; i < 8; i++)
    run.fx.push(
      makeFx('spark', c.x + run.rng.fx.range(-5, 5), c.y - 10, 0.8, {
        vx: run.rng.fx.range(-18, 18),
        vy: run.rng.fx.range(-44, -20),
        color: potion.good ? '#8cff6a' : '#c06aff',
      }),
    );
}

function stepHut(run: RunState, h: HutRun, dt: number): void {
  const p = run.player;
  const d = heroDistance(run, h.s);
  // The witch.
  if (!h.witch && !h.witchDead && d < WITCH_SPAWN_PX) {
    const a = h.s.blueprint.actors.find((x) => x.role === 'witch');
    if (a) {
      h.witch = spawnStructureEnemy(
        run,
        'swamp_witch',
        (h.s.tx + a.tx + 0.5) * TILE_PX,
        (h.s.ty + a.ty + 0.5) * TILE_PX,
        h.s.key,
        'witch',
        { guard: true, aggroPx: WITCH_AGGRO_PX },
      );
    }
  }
  if (h.witch?.dying) {
    h.witch = null;
    h.witchDead = true;
  } else if (h.witch && d > WITCH_DESPAWN_PX) {
    removeOwned(run, h.s.key);
    h.witch = null;
  }
  // The cauldron.
  const c = h.cauldron;
  if (c && !h.used) {
    if (!p.dead && Math.hypot(c.x - p.x, c.y - p.y) < CAULDRON_REACH_PX) {
      h.dwell += dt;
      if (h.dwell >= CAULDRON_DWELL_S) useCauldron(run, h, c);
    } else h.dwell = Math.max(0, h.dwell - dt * 2);
    h.bubble -= dt;
    if (h.bubble <= 0 && d < 380) {
      h.bubble = 0.32;
      run.fx.push(
        makeFx('spark', c.x + run.rng.fx.range(-4, 4), c.y - 12, 0.7, {
          vx: run.rng.fx.range(-6, 6),
          vy: run.rng.fx.range(-30, -16),
          color: run.rng.fx.chance(0.5) ? '#8cff6a' : '#d8ffb8',
        }),
      );
    }
  }
}

/** Per-step hook (updateStructureInteract). */
export function updateWitchHut(run: RunState, dt: number): void {
  const m = meta(run);
  const p = run.player;
  for (const s of structuresNear(run, 'witch_hut')) {
    if (!m.huts.has(s.key)) m.huts.set(s.key, setupHut(run, s));
  }
  for (const h of m.huts.values()) {
    stepHut(run, h, dt);
    for (const cat of propsOfKind(h.s, 'black_cat')) calmCreepers(run, cat.x, cat.y, dt);
  }
  if (m.regenUntil > run.time && !p.dead) p.heal(REGEN_HP_PER_S * dt);
}

/** The hut bookkeeping of a run (tests, debug). */
export function hutRun(run: RunState, key: string): HutRun | undefined {
  return METAS.get(run)?.huts.get(key);
}

export type { HutRun };
