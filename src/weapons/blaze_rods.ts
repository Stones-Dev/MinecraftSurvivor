import type { WeaponDef, WeaponLevel } from './types';

// STUB: replaced by the real implementation.
const level: WeaponLevel = { dmg: 10, cd: 2, area: 0, count: 1, pierce: 0, blurb: 'TODO' };

export const blaze_rods: WeaponDef = {
  id: 'blaze_rods',
  name: 'Blaze Rods',
  icon: 'blaze_rod',
  levels: [level, level, level, level, level],
  evolution: {
    id: 'blaze_crown',
    name: 'Blaze Crown',
    needs: 'haste',
    blurb: 'Five faster rods.',
    icon: 'blaze_rod',
  },
  fire() {
    return false;
  },
};
