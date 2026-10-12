import { makeFx } from '../entities/fx';
import { Pickup } from '../entities/pickup';
import type { Enemy } from '../entities/enemy';
import { damageEnemy } from '../systems/combat';
import { applyStatus } from '../systems/status';
import { enemiesInCircle } from '../weapons/helpers';
import type { AbilityDef } from './types';

const hits: Enemy[] = [];
const RADIUS = 80;
const EMERALDS = 4;

/** Wandering Trader: a burst of Emeralds that dazzles everything around him. */
export const emeraldShower: AbilityDef = {
  id: 'emerald_shower',
  name: 'Emerald Shower',
  icon: 'emerald',
  cooldown: 20,
  blurb: 'Fling a shower of Emeralds around you; the glitter stuns and hurts nearby enemies.',
  cast(run) {
    const p = run.player;
    const power = run.mods.abilityPower;
    const n = Math.round(EMERALDS * power);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + run.rng.fx.range(0, 0.6);
      const d = run.rng.fx.range(36, 58);
      run.pickups.push(
        new Pickup('emerald', p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.8, 1),
      );
    }
    const radius = RADIUS * run.mods.area;
    enemiesInCircle(run, p.x, p.y, radius, hits);
    for (const e of hits) {
      damageEnemy(run, e, 12 * run.mods.dmg * power, p.x, p.y, 60);
      applyStatus(e, 'stun', 1.2 * run.mods.duration);
    }
    run.fx.push(makeFx('ring', p.x, p.y - 4, 0.5, { r: radius, color: '#3fe07a' }));
    for (let i = 0; i < 14; i++) {
      const a = run.rng.fx.range(0, Math.PI * 2);
      const sp = run.rng.fx.range(40, 100);
      run.fx.push(
        makeFx('spark', p.x, p.y - 14, 0.6, {
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 40,
          color: i % 2 === 0 ? '#3fe07a' : '#c9ffd9',
        }),
      );
    }
    run.fx.push(
      makeFx('text', p.x, p.y - 34, 1, { text: 'Emerald Shower', vy: -14, color: '#7dff9a' }),
    );
    run.emit('trade');
    return true;
  },
};
