/** Every structure the world can place, in registration order (placement priority is `StructureDef.priority`). */
import { DESERT_TEMPLE } from './desertTemple';
import { JUNGLE_TEMPLE } from './jungleTemple';
import { PILLAGER_OUTPOST } from './pillagerOutpost';
import type { StructureDef, StructureId } from './stamp';
import { TRIAL_CHAMBER } from './trialChamber';
import { VILLAGE } from './village';
import { WITCH_HUT } from './witchHut';

export const STRUCTURE_DEFS: readonly StructureDef[] = [
  DESERT_TEMPLE,
  VILLAGE,
  JUNGLE_TEMPLE,
  TRIAL_CHAMBER,
  PILLAGER_OUTPOST,
  WITCH_HUT,
];

export const STRUCTURE_BY_ID: Readonly<Record<StructureId, StructureDef>> = {
  village: VILLAGE,
  desert_temple: DESERT_TEMPLE,
  jungle_temple: JUNGLE_TEMPLE,
  trial_chamber: TRIAL_CHAMBER,
  pillager_outpost: PILLAGER_OUTPOST,
  witch_hut: WITCH_HUT,
};

export function isStructureId(v: string | null | undefined): v is StructureId {
  return v !== null && v !== undefined && Object.hasOwn(STRUCTURE_BY_ID, v);
}
