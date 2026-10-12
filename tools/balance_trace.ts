import { it } from 'vitest';
import { playRun } from './balance/bot';
import type { WeaponId } from '../src/weapons/types';

it('trace', { timeout: 600_000 }, () => {
  const w = (process.env['PR_WEAPONS'] ?? 'blaze_rods') as WeaponId;
  const seed = Number(process.env['PR_SEED0'] ?? 2004);
  const every = Number(process.env['PR_EVERY'] ?? 5);
  let n = 0;
  const r = playRun({
    seed,
    policy: 'smart',
    start: w,
    maxTime: 1200,
    trace: (run) => {
      if (n++ % every !== 0 && run.player.hp > run.player.maxHp * 0.5) return;
      const p = run.player;
      const near: Record<string, number> = {};
      for (const e of run.enemies) {
        if (Math.hypot(e.x - p.x, e.y - p.y) < 90) near[e.def.id] = (near[e.def.id] ?? 0) + 1;
      }
      console.log(
        `t=${run.time.toFixed(0)} hp=${p.hp.toFixed(0)}/${p.maxHp.toFixed(0)} pos=${p.x.toFixed(0)},${p.y.toFixed(0)} biome=${run.biome()} surf=${run.world.surface(p.x, p.y)} n=${run.enemies.length} dot=${p.dotKind}:${p.dotT.toFixed(1)} near=${JSON.stringify(near)}`,
      );
    },
  });
  console.log('RESULT', JSON.stringify(r));
});
