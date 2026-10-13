/** Every structure the world can place, in registration order (placement priority is `StructureDef.priority`). */
import { DESERT_TEMPLE } from './desertTemple';
import type { StructureDef, StructureId } from './stamp';
import { VILLAGE } from './village';

export const STRUCTURE_DEFS: readonly StructureDef[] = [DESERT_TEMPLE, VILLAGE];

export const STRUCTURE_BY_ID: Readonly<Record<StructureId, StructureDef>> = {
  village: VILLAGE,
  desert_temple: DESERT_TEMPLE,
};

export function isStructureId(v: string | null | undefined): v is StructureId {
  return v !== null && v !== undefined && v in STRUCTURE_BY_ID;
}
