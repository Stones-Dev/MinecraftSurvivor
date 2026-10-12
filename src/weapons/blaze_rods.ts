import { areaOf, damageOf, syncOrbiters } from './helpers';
import type { WeaponDef, WeaponState } from './types';

/** Orbit speed in rad/s: 3.2 at level 1 up to 4.5 at level 5. */
function spinOf(w: WeaponState): number {
  const level = Math.min(5, Math.max(1, w.level));
  return 3.2 + 0.325 * (level - 1);
}

/**
 * Rods orbit the hero and touch-hit whatever they pass. The rods are the weapon: they are kept
 * in sync from `tick`, and `fire` never starts a cooldown.
 */
export const blaze_rods: WeaponDef = {
  id: 'blaze_rods',
  name: 'Blaze Rods',
  icon: 'blaze_rod',
  levels: [
    {
      dmg: 7,
      cd: 0,
      area: 26,
      count: 2,
      pierce: 99,
      blurb: 'Two rods orbit you and hit what they touch.',
    },
    {
      dmg: 9,
      cd: 0,
      area: 28,
      count: 2,
      pierce: 99,
      blurb: '+2 damage, wider orbit, faster spin.',
    },
    { dmg: 11, cd: 0, area: 30, count: 3, pierce: 99, blurb: 'A third rod and +2 damage.' },
    { dmg: 13, cd: 0, area: 32, count: 3, pierce: 99, blurb: '+2 damage, wider orbit.' },
    {
      dmg: 16,
      cd: 0,
      area: 34,
      count: 4,
      pierce: 99,
      blurb: 'Four rods, fastest spin, +3 damage.',
    },
  ],
  evolution: {
    id: 'blaze_crown',
    name: 'Blaze Crown',
    needs: 'haste',
    blurb: 'Five faster rods that set what they touch on fire.',
    icon: 'blaze_rod',
  },
  tick(run, w, s) {
    const count = w.evolved ? 5 : s.count;
    const speed = spinOf(w) * (w.evolved ? 1.35 : 1);
    syncOrbiters(run, 'blaze_rods', count, {
      radius: areaOf(run, s),
      speed,
      dmg: damageOf(run, s),
      size: 6,
      knock: 40,
      rehit: 0.45,
      burn: w.evolved,
      style: 'rod',
    });
  },
  fire() {
    return false;
  },
};
