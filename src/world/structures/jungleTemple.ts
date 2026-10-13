/**
 * Jungle Temple (v1.4 part 2): a 12x14 block of mossy bricks and vine-covered cobblestone.
 *
 * Layout (x right, y down; the stamp may be mirrored left-right per instance):
 *
 *      x: 0123456789AB
 *   y0    V#VV#V#VV#VV   outer wall (# mossy bricks, V vine cobble, both solid)
 *   y1    ##Vffffff##V   chest room (f): the temple chest at (5,1)
 *   y2    V##ffffff##V
 *   y3    #V###DD#####   sliding stone door (D: floor + one 'stone_door' prop per tile) at (5,3) (6,3)
 *   y4-8  VhhhhhhhhhhV   main hall (h), 10x5
 *   y9    ###cc###L##V   corridor opening (3,9) (4,9); opening L (8,9) to the lever room, hidden by vines
 *   y10   V#nccn##lll#   corridor x=3..4 with dispenser niches (n) at x=2 and x=5 on y=10 and y=12;
 *   y11   ###cc###lllV   lever room x=8..10, y=10..12: colour-mark plaque at (9,10), levers at y=11
 *   y12   V#nccn##lll#
 *   y13   ..aaaa......   apron: the way in is the corridor
 *
 * Two tripwires cross the corridor (invisible lines between the dispenser props of a niche pair, y=10.5 and
 * y=12.5 tiles): crossing one fires three poison arrows (systems/jungleTemple.ts). The levers in the hidden
 * room open the stone door in the order the plaque shows (their colours match the dots). The chest behind
 * the door holds an exotic ranged weapon card.
 */
import { MAT } from '../blocks';
import { MARK_ORDERS } from '../structureSprites';
import { type BuildContext, Stamp, type StructureDef } from './stamp';

export const JUNGLE_W = 12;
export const JUNGLE_H = 14;

const ROWS: readonly string[] = [
  'V#VV#V#VV#VV',
  '##Vffffff##V',
  'V##ffffff##V',
  '#V###DD#####',
  'VhhhhhhhhhhV',
  '#hhhhhhhhhh#',
  'VhhhhhhhhhhV',
  '#hhhhhhhhhh#',
  'VhhhhhhhhhhV',
  '###cc###L##V',
  'V#nccn##lll#',
  '###cc###lllV',
  'V#nccn##lll#',
  '..aaaa......',
];

export function buildJungleTemple(ctx: BuildContext): ReturnType<Stamp['build']> {
  const s = new Stamp(JUNGLE_W, JUNGLE_H);
  s.ascii(ROWS, {
    '.': {},
    V: { mat: MAT.VINE_COBBLE, solid: true },
    '#': { mat: MAT.MOSSY_BRICKS, solid: true },
    f: { mat: MAT.MOSSY_COBBLE },
    D: { mat: MAT.COBBLE },
    h: { mat: MAT.COBBLE },
    c: { mat: MAT.MOSSY_COBBLE },
    n: { mat: MAT.MOSSY_COBBLE },
    l: { mat: MAT.MOSSY_COBBLE },
    L: { mat: MAT.MOSSY_COBBLE },
    a: { mat: MAT.MOSSY_COBBLE },
  });
  // The chest room and its sliding door (one block of stone per door tile).
  s.prop('chest_jungle', 5, 1);
  s.prop('stone_door', 5, 3).prop('stone_door', 6, 3);
  s.prop('vine_curtain', 4, 1, { oy: 16 }).prop('vine_curtain', 8, 1, { oy: 16 });
  // Hall decoration: vines hanging from the north wall.
  for (const x of [2, 5, 9]) s.prop('vine_curtain', x, 4, { oy: 16 });
  // The corridor: dispenser pairs (west one shoots east, east one shoots west).
  for (const y of [10, 12]) {
    s.prop('dispenser', 2, y, { variant: 0 });
    s.prop('dispenser', 5, y, { variant: 1 });
  }
  // The secret room: the opening is curtained with vines; the plaque shows the order, the levers wear colours.
  s.prop('vine_curtain', 8, 9, { oy: 16 });
  const colors = [0, 1, 2];
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.rand() * (i + 1));
    [colors[i], colors[j]] = [colors[j] ?? 0, colors[i] ?? 0];
  }
  const order = Math.floor(ctx.rand() * MARK_ORDERS.length);
  s.prop('color_marks', 9, 10, { variant: order });
  colors.forEach((c, i) => {
    s.prop('lever', 8 + i, 11, { variant: c });
    s.prop('lever_on', 8 + i, 11, { variant: c });
  });
  s.enter(3, 13).within(3, 11);
  if (ctx.rand() < 0.5) {
    s.mirrorX();
    // The dispensers swap sides with the corridor: they must still shoot across it.
    for (const p of s.props) if (p.kind === 'dispenser') p.variant = 1 - (p.variant ?? 0);
  }
  return s.build();
}

export const JUNGLE_TEMPLE: StructureDef = {
  id: 'jungle_temple',
  name: 'Jungle Temple',
  width: JUNGLE_W,
  height: JUNGLE_H,
  allowedBiomes: ['jungle'],
  minDistFromSpawn: 90,
  spacing: 40,
  chance: 0.9,
  priority: 2,
  clearance: 2,
  color: '#6fcf5a',
  build: buildJungleTemple,
};
