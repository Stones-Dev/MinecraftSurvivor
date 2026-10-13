/**
 * Pillager Outpost (v1.4 part 2): a 10x10 camp with a walled watchtower in the north-west corner, a yard of
 * dirt path and cobble, a wooden cage with a captive and four to six Pillagers. A Raid Captain waits in the
 * tower with the ominous banner (systems/pillagerOutpost.ts spawns the guards when the hero comes near).
 *
 *      x: 0123456789
 *   y0    ..........
 *   y1    .CWWWC....   W cobble wall, C dark oak post (solid)
 *   y2    .WffbW....   f tower floor; the Captain stands at (4,2), the banner at (2,2)
 *   y3    .WfffW....
 *   y4    .CWDWC....   D doorway (3,4)
 *   y5    ..p.......   p dirt path from the door to the south edge
 *   y6    ..p....kk.   k cobble pad of the cage at (7,6)
 *   ...
 */
import { MAT } from '../blocks';
import { type BuildContext, type StructureDef, Stamp } from './stamp';

export const OUTPOST_SIZE = 10;

/** Candidate guard posts (blueprint tiles); 4 to 6 of them are used. */
const POSTS: readonly (readonly [number, number])[] = [
  [1, 6],
  [5, 6],
  [8, 3],
  [5, 8],
  [8, 8],
  [1, 9],
];

export function buildPillagerOutpost(ctx: BuildContext): ReturnType<Stamp['build']> {
  const n = OUTPOST_SIZE;
  const s = new Stamp(n, n);
  // Tower ring and floor.
  s.wall(1, 1, 5, 4, MAT.COBBLE);
  s.floor(2, 2, 3, 2, MAT.OAK_PLANKS);
  // Dark oak posts in the corners and beside the doorway.
  for (const [x, y] of [
    [1, 1],
    [5, 1],
    [1, 4],
    [5, 4],
    [2, 4],
    [4, 4],
  ] as const)
    s.set(x, y, MAT.DARK_OAK_PLANKS, true);
  s.set(3, 4, MAT.OAK_PLANKS); // the doorway
  // Yard: a dirt path from the door and a cobble pad for the cage.
  for (let y = 5; y < n; y++) s.set(3, y, MAT.DIRT_PATH);
  s.floor(7, 6, 2, 2, MAT.COBBLE);
  // Props.
  s.prop('outpost_banner', 2, 2);
  s.prop('lantern', 2, 5).prop('lantern', 4, 5);
  s.prop('cage', 7, 6, { variant: Math.floor(ctx.rand() * 2) });
  s.prop('cage_open', 7, 6, { variant: 0 });
  s.prop('hay_bale', 8, 1).prop('hay_bale', 7, 9);
  // Guards: the Captain in the tower, four to six Pillagers in the yard.
  s.actor('captain', 4, 2);
  const count = 4 + Math.floor(ctx.rand() * 3);
  for (const [x, y] of POSTS.slice(0, count)) s.actor('pillager', x, y);
  s.enter(4, 9).within(3, 6);
  if (ctx.rand() < 0.5) s.mirrorX();
  return s.build();
}

export const PILLAGER_OUTPOST: StructureDef = {
  id: 'pillager_outpost',
  name: 'Pillager Outpost',
  width: OUTPOST_SIZE,
  height: OUTPOST_SIZE,
  allowedBiomes: ['plains', 'snowy_taiga', 'forest'],
  minDistFromSpawn: 90,
  spacing: 56,
  chance: 0.7,
  nearChance: 0.8,
  priority: 4,
  clearance: 3,
  color: '#d05a5a',
  build: buildPillagerOutpost,
};
