/**
 * Jungle Temple mechanics (v1.4 part 2): the two tripwires in the entrance corridor and the lever puzzle
 * behind the vines.
 *
 * Tripwires (pure state machine `stepWire`): an invisible line between the two dispensers of a niche pair. The
 * hero crossing it makes the dispensers click (0.5 s, sound and a ring on each), then they fire three poison
 * arrows 0.15 s apart, aimed at where the hero stands when each leaves. An arrow hurts (7) and poisons (3 per
 * second for 4 s; poison never kills). A friendly projectile through the line cuts it: the dispensers jam.
 * Each wire fires once.
 *
 * Levers (pure state machine `pullLever`): three stone levers with coloured knobs; a plaque on the wall shows
 * three dots in the order they must be pulled. A correct pull stays down; a wrong one resets all of them
 * ("Wrong order!", no damage); the right sequence slides the stone door open.
 *
 * The glue (`updateJungleTemple`, called from updateStructureInteract) works on the temple's props: the
 * pulled-lever twins (`lever_on`) start hidden and swap in, the door props are removed when it opens.
 */
import { HERO_BODY_LOW, HERO_BODY_TOP, sweepHitCapsule } from '../core/geom';
import { makeFx } from '../entities/fx';
import { Projectile } from '../entities/projectile';
import type { RunState } from '../game';
import type { Prop } from '../world/props';
import type { PlacedStructure } from '../world/structures';
import { MARK_ORDERS } from '../world/structureSprites';
import { hurtPlayer } from './combat';
import { heroDistance, propsOfKind, structuresNear } from './structureScan';
import { say } from './structureLoot';

// ---------------------------------------------------------------------------------------------------
// Tunables

/** Seconds between crossing the wire and the first arrow, and between two arrows. */
export const WIRE_CLICK_S = 0.5;
export const VOLLEY_GAP_S = 0.15;
export const VOLLEY_ARROWS = 3;
/** The hero crosses the wire when his feet are this close to the line. */
export const WIRE_HIT_PX = 4;
/** A friendly projectile this close to the line cuts it. */
export const WIRE_CUT_PX = 5;
export const ARROW_DMG = 7;
export const ARROW_SPEED = 140;
export const POISON_S = 4;
export const POISON_DPS = 3;
/** The hero pulls a lever after standing within this distance for `PULL_DWELL_S`. */
export const LEVER_REACH_PX = 15;
export const PULL_DWELL_S = 0.45;
/** Wires and levers only run while the hero is within this distance of the temple. */
const ACTIVE_PX = 420;

// ---------------------------------------------------------------------------------------------------
// Tripwire (pure)

export type WirePhase = 'armed' | 'click' | 'volley' | 'spent' | 'cut';

export interface WireState {
  phase: WirePhase;
  /** Seconds in the current phase. */
  t: number;
  fired: number;
}

export type WireEvent =
  { type: 'click' } | { type: 'fire'; index: number } | { type: 'spent' } | { type: 'cut' };

export function newWire(): WireState {
  return { phase: 'armed', t: 0, fired: 0 };
}

/** Advance a wire. `crossed`: the hero is on the line this step; `cut`: a friendly projectile is. */
export function stepWire(
  s: WireState,
  dt: number,
  input: { crossed: boolean; cut: boolean },
): WireEvent[] {
  const ev: WireEvent[] = [];
  if (s.phase === 'spent' || s.phase === 'cut') return ev;
  if (input.cut && (s.phase === 'armed' || s.phase === 'click')) {
    s.phase = 'cut';
    ev.push({ type: 'cut' });
    return ev;
  }
  if (s.phase === 'armed') {
    if (!input.crossed) return ev;
    s.phase = 'click';
    s.t = 0;
    ev.push({ type: 'click' });
    return ev;
  }
  s.t += dt;
  if (s.phase === 'click') {
    if (s.t < WIRE_CLICK_S) return ev;
    s.phase = 'volley';
    s.t = 0;
  }
  // Volley: arrow i leaves at i * VOLLEY_GAP_S.
  while (s.fired < VOLLEY_ARROWS && s.t >= s.fired * VOLLEY_GAP_S) {
    ev.push({ type: 'fire', index: s.fired });
    s.fired++;
  }
  if (s.fired >= VOLLEY_ARROWS) {
    s.phase = 'spent';
    ev.push({ type: 'spent' });
  }
  return ev;
}

// ---------------------------------------------------------------------------------------------------
// Lever puzzle (pure)

export interface PuzzleState {
  /** Lever colours in the order they must be pulled. */
  order: readonly number[];
  pulled: number[];
  solved: boolean;
}

export type PuzzleEvent =
  { type: 'pull'; colour: number; step: number } | { type: 'wrong' } | { type: 'solved' };

export function newPuzzle(order: readonly number[]): PuzzleState {
  return { order, pulled: [], solved: false };
}

/** Pull the lever of `colour`. Pulling a lever that is already down does nothing. */
export function pullLever(s: PuzzleState, colour: number): PuzzleEvent[] {
  if (s.solved || s.pulled.includes(colour)) return [];
  if (colour !== s.order[s.pulled.length]) {
    s.pulled = [];
    return [{ type: 'wrong' }];
  }
  s.pulled.push(colour);
  const ev: PuzzleEvent[] = [{ type: 'pull', colour, step: s.pulled.length }];
  if (s.pulled.length >= s.order.length) {
    s.solved = true;
    ev.push({ type: 'solved' });
  }
  return ev;
}

/** The pull order a colour-mark plaque of this variant shows. */
export function marksOrder(variant: number): readonly number[] {
  return MARK_ORDERS[((variant % 8) + 6) % 6] ?? MARK_ORDERS[0] ?? [0, 1, 2];
}

// ---------------------------------------------------------------------------------------------------
// Geometry

/** Distance from a point to the segment (ax, ay)-(bx, by). */
function pointSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Smallest distance between two segments, sampled along the first (the second is a wire: long and straight). */
export function segmentsDistance(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): number {
  let best = Infinity;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    best = Math.min(
      best,
      pointSeg(a[0] + (a[2] - a[0]) * t, a[1] + (a[3] - a[1]) * t, b[0], b[1], b[2], b[3]),
    );
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------
// Run glue

interface Wire {
  a: Prop;
  b: Prop;
  state: WireState;
}

interface Lever {
  colour: number;
  up: Prop;
  down: Prop;
  dwell: number;
}

interface TempleRun {
  wires: Wire[];
  levers: Lever[];
  puzzle: PuzzleState | null;
  door: Prop[];
  /** Hostile arrows in flight, checked for a hit (poison) once they are gone. */
  arrows: Projectile[];
  msg: number;
}

const RUNS = new WeakMap<RunState, Map<string, TempleRun>>();

function templeRuns(run: RunState): Map<string, TempleRun> {
  let m = RUNS.get(run);
  if (!m) {
    m = new Map();
    RUNS.set(run, m);
  }
  return m;
}

function setupTemple(run: RunState, s: PlacedStructure): TempleRun {
  const t: TempleRun = { wires: [], levers: [], puzzle: null, door: [], arrows: [], msg: 0 };
  // Dispensers pair up by row: the two with the same y make one wire.
  const byRow = new Map<number, Prop[]>();
  for (const d of propsOfKind(s, 'dispenser')) {
    const row = byRow.get(d.y) ?? [];
    row.push(d);
    byRow.set(d.y, row);
  }
  for (const row of byRow.values()) {
    if (row.length !== 2) continue;
    const [a, b] = row.sort((p, q) => p.x - q.x);
    if (a && b) t.wires.push({ a, b, state: newWire() });
  }
  const ups = propsOfKind(s, 'lever');
  const downs = propsOfKind(s, 'lever_on');
  for (const up of ups) {
    const down = downs.find((d) => d.x === up.x && d.y === up.y);
    if (!down) continue;
    run.world.removeProp(down); // pulled twins start hidden
    t.levers.push({ colour: up.variant % 8, up, down, dwell: 0 });
  }
  const marks = propsOfKind(s, 'color_marks')[0];
  if (marks && t.levers.length === 3) t.puzzle = newPuzzle(marksOrder(marks.variant));
  t.door = propsOfKind(s, 'stone_door');
  return t;
}

function resetLevers(run: RunState, t: TempleRun): void {
  for (const l of t.levers) {
    if (!run.world.isRemoved(l.down)) run.world.removeProp(l.down);
    if (run.world.isRemoved(l.up)) run.world.restoreProp(l.up);
    l.dwell = 0;
  }
}

function openDoor(run: RunState, t: TempleRun): void {
  for (const d of t.door) {
    run.world.removeProp(d);
    for (let i = 0; i < 5; i++) {
      run.fx.push(
        makeFx('spark', d.x + run.rng.fx.range(-8, 8), d.y + run.rng.fx.range(-6, 6), 0.7, {
          vx: run.rng.fx.range(-14, 14),
          vy: run.rng.fx.range(-26, -8),
          color: '#b6bba8',
        }),
      );
    }
  }
}

function fireArrow(run: RunState, t: TempleRun, from: Prop, index: number): void {
  const p = run.player;
  const ox = from.variant % 8 === 0 ? 8 : -8;
  const x = from.x + ox;
  const y = from.y - 6;
  const aim = Math.atan2(p.y - 8 - y, p.x - x);
  const pr = new Projectile(
    x,
    y,
    Math.cos(aim) * ARROW_SPEED,
    Math.sin(aim) * ARROW_SPEED,
    2,
    ARROW_DMG,
    0,
    false,
    1.3,
  );
  pr.style = 'arrow';
  run.projectiles.push(pr);
  t.arrows.push(pr);
  run.emit('bow');
  void index;
}

function stepWires(run: RunState, t: TempleRun, dt: number): void {
  const p = run.player;
  for (const w of t.wires) {
    if (w.state.phase === 'spent' || w.state.phase === 'cut') continue;
    const line = [w.a.x, w.a.y, w.b.x, w.b.y] as const;
    const crossed = !p.dead && pointSeg(p.x, p.y, ...line) < WIRE_HIT_PX;
    let cut = false;
    for (const pr of run.projectiles) {
      if (
        pr.friendly &&
        pr.alive &&
        segmentsDistance([pr.px, pr.py, pr.x, pr.y], line) < WIRE_CUT_PX
      )
        cut = true;
    }
    for (const ev of stepWire(w.state, dt, { crossed, cut })) {
      switch (ev.type) {
        case 'click':
          run.emit('click');
          for (const d of [w.a, w.b])
            run.fx.push(makeFx('ring', d.x, d.y - 6, 0.35, { r: 10, color: '#e8e0b0' }));
          say(run, (w.a.x + w.b.x) / 2, w.a.y, 'Click!', '#ffe27a', 0.9);
          break;
        case 'fire':
          fireArrow(run, t, ev.index % 2 === 0 ? w.a : w.b, ev.index);
          break;
        case 'cut':
          run.emit('hit');
          say(run, (w.a.x + w.b.x) / 2, w.a.y, 'Tripwire cut', '#7dff9a', 1.4);
          break;
        default:
          break;
      }
    }
  }
}

/** Arrows that ended on the hero poison him. */
function checkArrowHits(run: RunState, t: TempleRun): void {
  const p = run.player;
  for (let i = t.arrows.length - 1; i >= 0; i--) {
    const pr = t.arrows[i];
    if (!pr) continue;
    if (pr.alive && run.projectiles.includes(pr)) continue;
    t.arrows.splice(i, 1);
    if (p.dead) continue;
    if (
      sweepHitCapsule(
        pr.px,
        pr.py,
        pr.x,
        pr.y,
        pr.radius,
        p.x,
        p.y - HERO_BODY_LOW,
        p.y - HERO_BODY_TOP,
        p.radius,
      )
    ) {
      p.dotKind = 'poison';
      p.dotT = Math.max(p.dotT, POISON_S);
      p.dotDps = Math.max(p.dotDps, POISON_DPS);
    }
  }
}

function stepLevers(run: RunState, t: TempleRun, dt: number): void {
  const puzzle = t.puzzle;
  if (!puzzle || puzzle.solved) return;
  const p = run.player;
  // Only the nearest lever in reach counts.
  let best: Lever | null = null;
  let bestD = LEVER_REACH_PX;
  for (const l of t.levers) {
    if (puzzle.pulled.includes(l.colour)) continue;
    const d = Math.hypot(l.up.x - p.x, l.up.y - p.y);
    if (d < bestD) {
      best = l;
      bestD = d;
    }
  }
  for (const l of t.levers) l.dwell = l === best && !p.dead ? l.dwell + dt : 0;
  if (!best || best.dwell < PULL_DWELL_S) return;
  best.dwell = 0;
  for (const ev of pullLever(puzzle, best.colour)) {
    switch (ev.type) {
      case 'pull':
        run.world.removeProp(best.up);
        run.world.restoreProp(best.down);
        run.emit('click');
        say(run, best.up.x, best.up.y - 6, `${ev.step}/${puzzle.order.length}`, '#ffe27a', 1);
        break;
      case 'wrong':
        resetLevers(run, t);
        run.emit('hit');
        say(run, best.up.x, best.up.y - 6, 'Wrong order!', '#ff8a8a', 1.5);
        break;
      case 'solved':
        run.emit('levelup');
        run.shake = Math.max(run.shake, 3);
        openDoor(run, t);
        run.announce('The stone door slides open', '#9fd48a', 3);
        break;
    }
  }
}

/** Per-step hook (updateStructureInteract). */
export function updateJungleTemple(run: RunState, dt: number): void {
  const runs = templeRuns(run);
  for (const s of structuresNear(run, 'jungle_temple')) {
    if (heroDistance(run, s) > ACTIVE_PX) continue;
    let t = runs.get(s.key);
    if (!t) {
      t = setupTemple(run, s);
      runs.set(s.key, t);
    }
    stepWires(run, t, dt);
    checkArrowHits(run, t);
    stepLevers(run, t, dt);
  }
}

/** Temples of a run with their state (tests, debug). */
export function templeState(run: RunState, key: string): TempleRun | undefined {
  return RUNS.get(run)?.get(key);
}

export type { TempleRun };
void hurtPlayer;
