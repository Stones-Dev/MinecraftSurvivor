import { makeFx } from '../entities/fx';
import { damageEnemy } from '../systems/combat';
import { enemiesInCircle } from '../weapons/helpers';
import type { Enemy } from '../entities/enemy';
import type { AbilityDef } from './types';

const hits: Enemy[] = [];

/** Steve: brace behind a wall of stone. Soaks damage, halves incoming hits and shoves everything away. */
export const ironResolve: AbilityDef = {
  id: 'iron_resolve',
  name: 'Iron Resolve',
  icon: 'shield',
  cooldown: 16,
  blurb: 'Gain a 25 HP shield and halve damage taken for 4 s, and shove nearby enemies away.',
  cast(run) {
    const p = run.player;
    const power = run.mods.abilityPower;
    run.absorb = Math.max(run.absorb, 25 * power);
    run.resistUntil = Math.max(run.resistUntil, run.time + 4);
    run.recomputeStats();
    const radius = 72 * run.mods.area;
    enemiesInCircle(run, p.x, p.y, radius, hits);
    for (const e of hits) damageEnemy(run, e, 6 * run.mods.dmg * power, p.x, p.y, 220);
    run.fx.push(makeFx('ring', p.x, p.y - 4, 0.45, { r: radius, color: '#b8c0cc' }));
    run.fx.push(
      makeFx('text', p.x, p.y - 30, 1, { text: 'Iron Resolve', vy: -14, color: '#cfd6e0' }),
    );
    run.shake = Math.max(run.shake, 4);
    run.emit('explode');
    return true;
  },
};
