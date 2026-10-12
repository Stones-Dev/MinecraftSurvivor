/**
 * Balance probe: a quick, env-driven slice of the simulator for bisecting and A/B runs.
 * Env: PR_WEAPONS (comma list, default sword), PR_SEEDS (count, default 12), PR_SEED0 (default 2000),
 * PR_POLICY (smart|newbie), PR_BIOME (start biome), PR_CAP (seconds). Prints one line per weapon.
 */
import { it } from 'vitest';
import { type BotResult, type Policy, playRun } from './balance/bot';
import type { WeaponId } from '../src/weapons/types';
import type { BiomeId } from '../src/world/biomes';

const mmss = (t: number): string =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

it('probe', { timeout: 3_600_000 }, () => {
  const weapons = (process.env['PR_WEAPONS'] ?? 'sword').split(',') as WeaponId[];
  const n = Number(process.env['PR_SEEDS'] ?? 12);
  const s0 = Number(process.env['PR_SEED0'] ?? 2000);
  const policy = (process.env['PR_POLICY'] ?? 'smart') as Policy;
  const biome = process.env['PR_BIOME'] as BiomeId | undefined;
  const cap = Number(process.env['PR_CAP'] ?? 1200);
  const verbose = process.env['PR_VERBOSE'] === '1';
  for (const w of weapons) {
    const rs: BotResult[] = [];
    const causes: string[] = [];
    const surf: Record<string, number> = {};
    const bio: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      let last = '';
      const r = playRun({
        seed: s0 + i,
        policy,
        start: w,
        biome,
        maxTime: cap,
        trace: (run) => {
          const p = run.player;
          const near: string[] = [];
          for (const e of run.enemies)
            if (Math.hypot(e.x - p.x, e.y - p.y) < 70) near.push(e.def.id);
          const sf = run.world.surface(p.x, p.y, run.biome());
          surf[sf] = (surf[sf] ?? 0) + 1;
          bio[run.biome()] = (bio[run.biome()] ?? 0) + 1;
          const d = Math.round(Math.hypot(p.x, p.y) / 16);
          last = `${run.biome()}/${run.world.surface(p.x, p.y, run.biome())}/dot=${p.dotT > 0.2 ? p.dotKind : '-'}/d${d}/${[...new Set(near)].slice(0, 3).join('+')}`;
        },
      });
      causes.push(`${r.seed}:${r.dead ? last : 'alive'}`);
      rs.push(r);
    }
    const ts = rs.map((r) => r.time).sort((a, b) => a - b);
    const at = (q: number): number => ts[Math.min(ts.length - 1, Math.floor(q * ts.length))] ?? 0;
    const med = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
    const mean = ts.reduce((a, b) => a + b, 0) / ts.length;
    console.log(
      `PROBE ${w}${biome ? '@' + biome : ''} ${policy} n=${n} med=${mmss(at(0.5))} mean=${mmss(mean)} p10=${mmss(at(0.1))} p90=${mmss(at(0.9))} kills=${med(rs.map((r) => r.kills))} lvl=${med(rs.map((r) => r.level))} won=${rs.filter((r) => r.won).length}`,
    );
    if (verbose) console.log('  times ' + rs.map((r) => mmss(r.time)).join(' '));
    const fr = (o: Record<string, number>): string => {
      const t = Object.values(o).reduce((a, b) => a + b, 0) || 1;
      return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${Math.round((100 * v) / t)}%`).join(' ');
    };
    console.log('  SURF ' + fr(surf) + ' || BIOME ' + fr(bio));
    if (process.env['PR_CAUSES'] === '1') console.log('  CAUSES ' + causes.join(' | '));
  }
});
