import { makeFx } from '../entities/fx';
import type { Enemy } from '../entities/enemy';
import { damageEnemy } from '../systems/combat';
import { applyStatus } from '../systems/status';
import { enemiesInCircle } from '../weapons/helpers';
import { type AbilityDef, aimDirection } from './types';

const hits: Enemy[] = [];
const RANGE = 160;
const RADIUS = 50;
/** Seconds the anvil takes to fall. */
export const ANVIL_FALL = 0.35;

/** Village Smith: drop a heavy anvil on the cursor; the slam stuns and a shockwave rolls out. */
export const anvilDrop: AbilityDef = {
  id: 'anvil_drop',
  name: 'Anvil Drop',
  icon: 'anvil',
  cooldown: 16,
  blurb: 'Drop an anvil on the cursor: heavy area damage, a 1.5 s stun and a rolling shockwave.',
  cast(run, aim) {
    const p = run.player;
    const dir = aimDirection(run, aim);
    const want = Math.hypot(aim.x - p.x, aim.y - p.y);
    const dist = Math.min(RANGE, want > 6 ? want : 70);
    const x = p.x + dir.x * dist;
    const y = p.y + dir.y * dist;
    const r = RADIUS * run.mods.area;
    const dmg = 34 * run.mods.dmg * run.mods.abilityPower;
    const stun = 1.5 * run.mods.duration;
    run.fx.push(makeFx('anvil', x, y, ANVIL_FALL));
    run.fx.push(makeFx('ring', x, y, ANVIL_FALL, { r: r * 0.5, color: '#8a8a96' }));
    if (Math.abs(dir.x) > 0.1) p.aim(dir.x > 0 ? 1 : -1);
    run.emit('swing');
    run.later(ANVIL_FALL, () => {
      enemiesInCircle(run, x, y, r, hits);
      for (const e of hits) {
        damageEnemy(run, e, dmg, x, y, 90);
        applyStatus(e, 'stun', stun);
      }
      run.hitPoints.push(x, y);
      run.fx.push(makeFx('ring', x, y, 0.35, { r, color: '#d8d8e0' }));
      run.fx.push(makeFx('ring', x, y, 0.6, { r: r * 1.5, color: '#8a8a96' }));
      for (let i = 0; i < 10; i++) {
        const a = run.rng.fx.range(0, Math.PI * 2);
        const sp = run.rng.fx.range(40, 90);
        run.fx.push(
          makeFx('spark', x, y - 2, 0.45, {
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp * 0.5 - 30,
            color: i % 2 === 0 ? '#8a8a96' : '#c9b98f',
          }),
        );
      }
      run.shake = Math.max(run.shake, 5);
      run.emit('explode');
    });
    return true;
  },
};
