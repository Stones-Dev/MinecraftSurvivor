/** Debug start next to a structure (`?struct=<id>[&structAt=door|in|mid]`, only with `&debug`). */
import type { RunState } from '../game';
import { isStructureId } from '../world/structures/registry';
import type { StructureId } from '../world/structures';
import { findNearestStructure } from '../world/structures';
import { TILE_PX } from '../world/terrain';

export { isStructureId };

/** `?struct=` value to a structure id; unknown values are ignored. */
export function structParam(v: string | null): StructureId | undefined {
  return isStructureId(v) ? v : undefined;
}

/** Where `?struct=` puts the hero: 'door' in front of the entrance, 'in' just inside, 'mid' at the middle. */
export type StructAt = 'door' | 'in' | 'mid';

export function structAtParam(v: string | null): StructAt {
  return v === 'in' || v === 'mid' ? v : 'door';
}

/**
 * Move the hero (and companions) to the nearest instance of a structure (see `StructAt`). Returns false
 * when none is in range.
 */
export function startAtStructure(run: RunState, id: StructureId, at: StructAt = 'door'): boolean {
  const p = run.player;
  const s = findNearestStructure(run.overworld, id, p.x, p.y);
  if (!s) return false;
  const bp = s.blueprint;
  const spot =
    at === 'mid'
      ? { x: s.cx, y: s.cy }
      : at === 'in'
        ? {
            x: (s.tx + (bp.inside?.tx ?? bp.entry.tx) + 0.5) * TILE_PX,
            y: (s.ty + (bp.inside?.ty ?? bp.entry.ty) + 0.5) * TILE_PX,
          }
        : { x: s.entryX, y: s.entryY };
  const dx = spot.x - p.x;
  const dy = spot.y - p.y;
  p.x = spot.x;
  p.y = spot.y;
  p.snap();
  for (const a of run.allies) {
    a.x += dx;
    a.y += dy;
    a.prevX = a.prevY = Number.NaN;
  }
  if (run.pet) {
    run.pet.x += dx;
    run.pet.y += dy;
    run.pet.prevX = run.pet.prevY = Number.NaN;
  }
  return true;
}
