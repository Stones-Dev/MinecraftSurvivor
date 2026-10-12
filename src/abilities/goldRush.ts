import { makeFx } from '../entities/fx';
import type { AbilityDef } from './types';

const DURATION = 6;

/** Piglin: a berserk gold frenzy. Faster, harder hits, and every kill is more likely to drop an Emerald. */
export const goldRush: AbilityDef = {
  id: 'gold_rush',
  name: 'Gold Rush',
  icon: 'apple_gold',
  cooldown: 20,
  blurb: 'Go berserk for 6 s: +30% damage, +25% speed, and enemies drop Emeralds far more often.',
  cast(run) {
    const p = run.player;
    const power = run.mods.abilityPower;
    run.heroBuff = {
      until: run.time + DURATION * run.mods.duration,
      dmg: 1 + 0.3 * power,
      speed: 1.25,
      emeraldDrop: 0.12 * power,
    };
    run.recomputeStats();
    run.fx.push(makeFx('ring', p.x, p.y - 6, 0.45, { r: 46, color: '#ffd84a' }));
    run.fx.push(
      makeFx('text', p.x, p.y - 34, 1, { text: 'Gold Rush!', vy: -14, color: '#ffd84a' }),
    );
    run.shake = Math.max(run.shake, 2);
    run.emit('emerald');
    return true;
  },
};
