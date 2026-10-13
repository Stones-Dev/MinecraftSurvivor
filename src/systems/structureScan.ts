/**
 * Which structures are around the hero (v1.4 part 2). The mechanics modules (jungle temple, trial chamber,
 * pillager outpost and village raid, witch hut) each ask for the instances of their own id; the lookup is one
 * `structuresInRect` call per run per quarter second, shared by all of them.
 */
import type { RunState } from '../game';
import { type PlacedStructure, structuresInRect } from '../world/structures';
import type { StructureId } from '../world/structures/stamp';
import type { Prop } from '../world/props';

/** Structures within this many pixels of the hero are "near" (a screen is 640 x 360 art pixels). */
export const NEAR_PX = 900;

interface Cache {
  t: number;
  x: number;
  y: number;
  world: unknown;
  list: PlacedStructure[];
}

const CACHES = new WeakMap<RunState, Cache>();

/** All structures around the hero (any id). Empty in worlds without structures (arena, End). */
export function structuresAround(run: RunState): readonly PlacedStructure[] {
  const p = run.player;
  let c = CACHES.get(run);
  if (
    !c ||
    c.world !== run.world ||
    Math.abs(run.time - c.t) >= 0.25 ||
    Math.hypot(p.x - c.x, p.y - c.y) > 60
  ) {
    c = {
      t: run.time,
      x: p.x,
      y: p.y,
      world: run.world,
      list: structuresInRect(run.world, p.x - NEAR_PX, p.y - NEAR_PX, p.x + NEAR_PX, p.y + NEAR_PX),
    };
    CACHES.set(run, c);
  }
  return c.list;
}

/** The structures of one id around the hero. */
export function structuresNear(run: RunState, id: StructureId): PlacedStructure[] {
  return structuresAround(run).filter((s) => s.def.id === id);
}

/** Props of a structure by kind (world coordinates, ids `s:<key>:<n>`). */
export function propsOfKind(s: PlacedStructure, kind: Prop['kind']): Prop[] {
  return s.props.filter((p) => p.kind === kind);
}

/** Distance in pixels from the hero to the middle of a structure. */
export function heroDistance(run: RunState, s: PlacedStructure): number {
  return Math.hypot(s.cx - run.player.x, s.cy - run.player.y);
}

/** Is a world pixel inside the structure's footprint (grown by `margin` tiles)? */
export function insideFootprint(s: PlacedStructure, x: number, y: number, margin = 0): boolean {
  const t = 16;
  return (
    x >= (s.tx - margin) * t &&
    x < (s.tx + s.width + margin) * t &&
    y >= (s.ty - margin) * t &&
    y < (s.ty + s.height + margin) * t
  );
}
