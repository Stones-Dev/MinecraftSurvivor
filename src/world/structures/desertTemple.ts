/**
 * Desert Temple (v1.4): a 16x16 sandstone pyramid seen from above. Concentric rings (cut sandstone, orange
 * terracotta, cut sandstone) around an 8x8 chamber, a 2-tile tunnel through the south face, twin towers
 * (blue terracotta caps) on the south corners and a sandy apron around it all.
 *
 * Inside: a blue/orange floor inlay with the stone pressure plate on its centre vertex (the trap, see
 * systems/templeTrap.ts) and four lapis-and-gold chests on the chamber's diagonals. The chests are 1-2 tiles
 * from the chamber walls and 56 px from the plate, so a careful player reaches all four along the walls
 * without ever stepping on the plate (its trigger radius is 12 px).
 *
 *   x: 0         1
 *      0123456789012345
 *   y0 ................   0 apron (k = 0, walkable)
 *   y1 .SSSSSSSSSSSSSS.   1 cut sandstone ring
 *   y2 .STTTTTTTTTTTTS.   2 orange terracotta ring
 *   y3 .STSSSSSSSSSSTS.   3 cut sandstone ring
 *   y4 .STS........STS.   4..11 chamber (8x8): chests at (5,5) (10,5) (5,10) (10,10),
 *   ...                       plate on the vertex of (7,7)-(8,8)
 *   y12..15  towers at x0-3 / x12-15 (blue terracotta caps); tunnel x7-8 through the south face
 */
import { MAT } from '../blocks';
import { type StructureDef, Stamp } from './stamp';

export const TEMPLE_SIZE = 16;

export function buildDesertTemple(): ReturnType<Stamp['build']> {
  const n = TEMPLE_SIZE;
  const s = new Stamp(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = Math.min(x, y, n - 1 - x, n - 1 - y);
      if (k === 0) s.set(x, y, MAT.SMOOTH_SANDSTONE);
      else if (k === 1 || k === 3) s.set(x, y, MAT.CUT_SANDSTONE, true);
      else if (k === 2) s.set(x, y, MAT.ORANGE_TERRACOTTA, true);
      else s.set(x, y, MAT.SMOOTH_SANDSTONE);
    }
  }
  // Twin towers on the south corners: sandstone body, orange border, blue cap.
  for (const x0 of [0, 12]) {
    s.wall(x0, 12, 4, 4, MAT.CUT_SANDSTONE);
    for (let i = 0; i < 4; i++) {
      s.set(x0 + i, 12, MAT.ORANGE_TERRACOTTA, true);
      s.set(x0 + i, 15, MAT.ORANGE_TERRACOTTA, true);
      s.set(x0, 12 + i, MAT.ORANGE_TERRACOTTA, true);
      s.set(x0 + 3, 12 + i, MAT.ORANGE_TERRACOTTA, true);
    }
    s.wall(x0 + 1, 13, 2, 2, MAT.BLUE_TERRACOTTA);
  }
  // The tunnel through the south face.
  s.floor(7, 12, 2, 4, MAT.SMOOTH_SANDSTONE);
  // Floor inlay under the trap: orange square, blue core.
  s.floor(6, 6, 4, 4, MAT.ORANGE_TERRACOTTA);
  s.floor(7, 7, 2, 2, MAT.BLUE_TERRACOTTA);
  s.prop('pressure_plate', 7, 7, { ox: 16, oy: 16 });
  for (const [x, y] of [
    [5, 5],
    [10, 5],
    [5, 10],
    [10, 10],
  ] as const)
    s.prop('chest_pyramid', x, y);
  for (const [x, y] of [
    [4, 4],
    [11, 4],
    [4, 11],
    [11, 11],
  ] as const)
    s.prop('lantern', x, y);
  s.enter(7, 15).within(7, 11);
  return s.build();
}

export const DESERT_TEMPLE: StructureDef = {
  id: 'desert_temple',
  name: 'Desert Temple',
  width: TEMPLE_SIZE,
  height: TEMPLE_SIZE,
  allowedBiomes: ['desert', 'badlands'],
  minDistFromSpawn: 60,
  spacing: 80,
  chance: 0.6,
  priority: 0,
  clearance: 2,
  color: '#e8a040',
  build: buildDesertTemple,
};
