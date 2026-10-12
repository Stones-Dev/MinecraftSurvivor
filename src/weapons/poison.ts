import type { WeaponDef, WeaponLevel } from './types';

// STUB: replaced by the real implementation.
const level: WeaponLevel = { dmg: 10, cd: 2, area: 0, count: 1, pierce: 0, blurb: 'TODO' };

export const poison: WeaponDef = {
  id: 'poison',
  name: 'Poison Potion',
  icon: 'potion',
  levels: [level, level, level, level, level],
  evolution: {
    id: 'wither_cloud',
    name: 'Wither Cloud',
    needs: 'protection',
    blurb: 'Bigger cloud that slows.',
    icon: 'potion',
  },
  fire() {
    return false;
  },
};
