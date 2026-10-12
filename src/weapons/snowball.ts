import type { WeaponDef, WeaponLevel } from './types';

// STUB: replaced by the real implementation.
const level: WeaponLevel = { dmg: 10, cd: 2, area: 0, count: 1, pierce: 0, blurb: 'TODO' };

export const snowball: WeaponDef = {
  id: 'snowball',
  name: 'Snowball',
  icon: 'snowball',
  levels: [level, level, level, level, level],
  evolution: {
    id: 'blizzard',
    name: 'Blizzard',
    needs: 'frost_walker',
    blurb: 'Seven-way freezing fan.',
    icon: 'snowball',
  },
  fire() {
    return false;
  },
};
