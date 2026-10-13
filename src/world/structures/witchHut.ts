/**
 * Witch Hut (v1.4 part 2): a 7x7 hut on stilts in the swamp. Dark oak walls around a spruce plank floor, a
 * doorway on the south side, a cauldron, two shelves and a black cat inside; the Witch lives here.
 *
 *      x: 0123456
 *   y0    WWWWWWW
 *   y1    WsfffsW   s shelf (bookshelf prop), f floor
 *   y2    WffcffW   c cauldron at (3,2)
 *   y3    WfffffW
 *   y4    WfwfkfW   w the Witch's post (3,4), k the cat (5,4)
 *   y5    WfffffW
 *   y6    WWWDWWW   D doorway (3,6)
 *
 * The footprint may stand in the shallows (`allowWaterNear`): the planks are walkable over water.
 */
import { MAT } from '../blocks';
import { type StructureDef, Stamp } from './stamp';

export const HUT_SIZE = 7;

export function buildWitchHut(): ReturnType<Stamp['build']> {
  const n = HUT_SIZE;
  const s = new Stamp(n, n);
  s.wall(0, 0, n, n, MAT.DARK_OAK_PLANKS);
  s.floor(1, 1, 5, 5, MAT.SPRUCE_PLANKS);
  s.set(3, 6, MAT.SPRUCE_PLANKS); // doorway
  s.prop('bookshelf', 1, 1).prop('bookshelf', 5, 1);
  s.prop('cauldron', 3, 2);
  s.prop('cauldron_empty', 3, 2);
  s.prop('black_cat', 5, 4);
  s.actor('witch', 3, 4);
  s.enter(3, 7).within(3, 5);
  return s.build();
}

export const WITCH_HUT: StructureDef = {
  id: 'witch_hut',
  name: 'Witch Hut',
  width: HUT_SIZE,
  height: HUT_SIZE,
  allowedBiomes: ['swamp'],
  minDistFromSpawn: 90,
  spacing: 40,
  chance: 0.5,
  priority: 5,
  clearance: 2,
  allowWaterNear: true,
  color: '#9a5ad0',
  build: buildWitchHut,
};
