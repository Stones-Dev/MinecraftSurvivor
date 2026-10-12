import type { WeaponDef, WeaponLevel } from './types';

// STUB: replaced by the real implementation.
const level: WeaponLevel = { dmg: 10, cd: 2, area: 0, count: 1, pierce: 0, blurb: 'TODO' };

export const trident: WeaponDef = {
  id: 'trident',
  name: 'Trident',
  icon: 'trident',
  levels: [level, level, level, level, level],
  evolution: {
    id: 'riptide',
    name: 'Riptide',
    needs: 'depth_strider',
    blurb: 'Dashes you along its path.',
    icon: 'trident',
  },
  fire() {
    return false;
  },
};
