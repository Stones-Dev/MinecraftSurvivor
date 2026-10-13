/**
 * Village (v1.4): a 14x14 stamp with three open-topped houses (roof band along the back wall, a 2-tile door
 * in the front wall), a plaza with a well, dirt or cobble roads, a crop plot, lanterns, hay bales and
 * four residents: the Blacksmith, the Librarian and the Cleric (paid services, systems/structureInteract.ts),
 * a Farmer, plus the Iron Golem that guards the plaza (systems/villageGolem.ts). The village chest stands
 * in the smithy.
 *
 * Layout (x right, y down; the stamp may be mirrored left-right per instance):
 *
 *   rrrrrr..rrrrrr   0   r roof (solid)        # wall (solid)     D doorway
 *   rrrrrr..rrrrrr   1   f house floor         = road            o plaza
 *   #ffff#==#ffff#   2   F farmland (crops)    . untouched ground
 *   #ffff#==#ffff#   3
 *   #ffff#==#ffff#   4   smithy (NW): workbench, village chest, Blacksmith
 *   ##DD##==##DD##   5   library (NE): four bookshelves, Librarian
 *   ======oo======   6   chapel (SE): bed, Cleric
 *   ......oorrrrrr   7   farm (SW): ten crops, hay, Farmer
 *   FFFFF.==rrrrrr   8
 *   FFFFF.==#ffff#   9
 *   FFFFF.==#ffff#  10
 *   FFFFF.==#ffff#  11
 *   ......==##DD##  12
 *   ==============  13   <- entry (6, 13)
 */
import { MAT, type MaterialId } from '../blocks';
import type { BiomeId } from '../biomes';
import { type BuildContext, type StructureDef, Stamp } from './stamp';

export interface VillageStyle {
  wall: MaterialId;
  floor: MaterialId;
  roof: MaterialId;
  road: MaterialId;
  plaza: MaterialId;
}

const WOOD: VillageStyle = {
  wall: MAT.OAK_PLANKS,
  floor: MAT.SPRUCE_PLANKS,
  roof: MAT.ROOF_SHINGLES,
  road: MAT.DIRT_PATH,
  plaza: MAT.COBBLE,
};

/** Look of a village by the biome it stands in. */
export function villageStyle(biome: BiomeId): VillageStyle {
  switch (biome) {
    case 'desert':
      return {
        wall: MAT.CUT_SANDSTONE,
        floor: MAT.SMOOTH_SANDSTONE,
        roof: MAT.ORANGE_TERRACOTTA,
        road: MAT.DIRT_PATH,
        plaza: MAT.COBBLE,
      };
    case 'badlands':
      return {
        wall: MAT.CUT_SANDSTONE,
        floor: MAT.SMOOTH_SANDSTONE,
        roof: MAT.BLUE_TERRACOTTA,
        road: MAT.DIRT_PATH,
        plaza: MAT.COBBLE,
      };
    case 'snowy_taiga':
      return {
        wall: MAT.SPRUCE_PLANKS,
        floor: MAT.OAK_PLANKS,
        roof: MAT.SNOWY_ROOF,
        road: MAT.COBBLE,
        plaza: MAT.COBBLE,
      };
    default:
      return WOOD;
  }
}

const ROWS: readonly string[] = [
  'rrrrrr..rrrrrr',
  'rrrrrr..rrrrrr',
  '#ffff#==#ffff#',
  '#ffff#==#ffff#',
  '#ffff#==#ffff#',
  '##DD##==##DD##',
  '======oo======',
  '......oorrrrrr',
  'FFFFF.==rrrrrr',
  'FFFFF.==#ffff#',
  'FFFFF.==#ffff#',
  'FFFFF.==#ffff#',
  '......==##DD##',
  '==============',
];

export const VILLAGE_SIZE = 14;

export function buildVillage(ctx: BuildContext): ReturnType<Stamp['build']> {
  const st = villageStyle(ctx.biome);
  const s = new Stamp(VILLAGE_SIZE, VILLAGE_SIZE);
  s.ascii(ROWS, {
    '.': {},
    '=': { mat: st.road },
    o: { mat: st.plaza },
    r: { mat: st.roof, solid: true },
    '#': { mat: st.wall, solid: true },
    f: { mat: st.floor },
    D: { mat: st.floor },
    F: { mat: MAT.FARMLAND },
  });
  // Well on the plaza crossing (feet on the vertex of the four plaza tiles).
  s.prop('well', 6, 6, { ox: 16, oy: 16 });
  // Smithy: workbench, the village chest, the Blacksmith.
  s.prop('workbench', 1, 2).prop('chest_village', 4, 2).actor('smith', 2, 3);
  // Library: shelves along the back wall, the Librarian.
  for (const x of [9, 10, 11, 12]) s.prop('bookshelf', x, 2);
  s.actor('librarian', 10, 3);
  // Chapel: a bed and the Cleric.
  s.prop('bed', 9, 11, { oy: 14, variant: Math.floor(ctx.rand() * 3) });
  s.actor('cleric', 11, 10);
  // Farm: ten crops on every other furrow, hay, the Farmer.
  for (let x = 0; x < 5; x++) {
    for (const y of [8, 10]) s.prop('crop', x, y, { variant: (x + (y >> 1)) % 4 });
  }
  s.prop('hay_bale', 5, 8).prop('hay_bale', 5, 11).actor('farmer', 5, 9);
  // Lanterns at the road ends and the plaza, and the golem's post.
  s.prop('lantern', 1, 6).prop('lantern', 12, 6).prop('lantern', 5, 12);
  s.actor('golem', 5, 7);
  // The legendary chest of Hero of the Village: stamped here but hidden until a raid is repelled
  // (systems/pillagerOutpost.ts), on the north-south road just below the plaza.
  s.prop('chest_legendary', 7, 8);
  s.enter(6, 13).within(3, 4);
  if (ctx.rand() < 0.5) s.mirrorX();
  return s.build();
}

export const VILLAGE: StructureDef = {
  id: 'village',
  name: 'Village',
  width: VILLAGE_SIZE,
  height: VILLAGE_SIZE,
  allowedBiomes: ['plains', 'forest', 'cherry_grove', 'desert', 'snowy_taiga', 'badlands'],
  minDistFromSpawn: 70,
  spacing: 48,
  chance: 0.5,
  nearChance: 0.75,
  priority: 1,
  clearance: 2,
  color: '#ffd84a',
  build: buildVillage,
};
