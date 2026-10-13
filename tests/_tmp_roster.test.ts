import { it } from 'vitest';
import { spawnPool } from '../src/data/rosters';
import { BIOMES, type BiomeId } from '../src/world/biomes';
it('dump', () => {
  const out: string[] = [];
  for (const b of Object.keys(BIOMES) as BiomeId[]) {
    for (const t of [0, 30, 60, 120, 180]) {
      const p = spawnPool(b, t / 60, false, false);
      const tot = p.reduce((s, e) => s + e.weight, 0);
      const z = p.find((e) => e.def.id === 'zombie')?.weight ?? 0;
      out.push(`${b} t=${t} types=${p.length} zombie=${((z / tot) * 100).toFixed(0)}% ` + p.map((e) => `${e.def.id}:${((e.weight / tot) * 100).toFixed(0)}`).join(' '));
    }
  }
  console.log(out.join('\n'));
});
