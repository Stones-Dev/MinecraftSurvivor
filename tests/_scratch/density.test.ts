import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { biomeAtTile } from '../../src/world/biomeMap';
import { StructureIndex } from '../../src/world/structures';
import { STRUCTURE_DEFS } from '../../src/world/structures/registry';

it('density', () => {
  const out: unknown[][] = [];
  const R = 500;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  for (const def of STRUCTURE_DEFS) {
    let inst = 0;
    let area = 0;
    let nearest: number[] = [];
    for (const seed of seeds) {
      const idx = new StructureIndex(seed);
      inst += idx.inTileRect(-R, -R, R, R).filter((p) => p.def.id === def.id).length;
      for (let y = -R; y < R; y += 8)
        for (let x = -R; x < R; x += 8)
          if (def.allowedBiomes.includes(biomeAtTile(x, y, seed))) area += 64;
      const n = idx.nearest(def.id, 0, 0, 3000 * 16);
      nearest.push(n ? Math.round(Math.hypot(n.cx, n.cy) / 16) : -1);
    }
    out.push([
      def.id,
      'instances',
      inst,
      'allowed area tiles',
      area,
      'per 100x100 of allowed biome',
      ((inst / area) * 10000).toFixed(2),
      'per 100x100 of whole map',
      ((inst / (seeds.length * (2 * R) * (2 * R))) * 10000).toFixed(2),
      'nearest (tiles)',
      nearest.join(','),
    ]);
  }
  writeFileSync('/tmp/claude-0/-home-user-MinecraftSurvivor/74add153-26c0-588e-aacc-8787347bdfd4/scratchpad/density.txt', out.map((r) => r.join(' ')).join('\n'));
});
