import { it } from 'vitest';
import { World } from '../../src/world/world';
import { TILE_PX } from '../../src/world/terrain';

it('placement stats', () => {
  const dists: number[] = [];
  let totalV = 0;
  let totalT = 0;
  const t0 = performance.now();
  for (let seed = 1; seed <= 50; seed++) {
    const w = new World(seed * 977 + 13);
    const v = w.structures?.nearest('village', 0, 0, 400 * TILE_PX);
    const d = v ? Math.hypot(v.cx, v.cy) / TILE_PX : Infinity;
    dists.push(d);
    const inR = w.structures?.inTileRect(-300, -300, 300, 300) ?? [];
    totalV += inR.filter((p) => p.def.id === 'village').length;
    totalT += inR.filter((p) => p.def.id === 'desert_temple').length;
  }
  dists.sort((a, b) => a - b);
  console.log('nearest village dist (tiles) sorted:', dists.map((d) => Math.round(d)).join(' '));
  console.log('villages per 601x601 tiles avg', totalV / 50, 'temples', totalT / 50, 'ms', performance.now() - t0);
});
