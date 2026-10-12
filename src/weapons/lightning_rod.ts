import type { WeaponDef, WeaponLevel } from './types';

// STUB: replaced by the real implementation.
const level: WeaponLevel = { dmg: 10, cd: 2, area: 0, count: 1, pierce: 0, blurb: 'TODO' };

export const lightning_rod: WeaponDef = {
  id: 'lightning_rod',
  name: 'Lightning Rod',
  icon: 'lightning_rod',
  levels: [level, level, level, level, level],
  evolution: {
    id: 'thunderstorm',
    name: 'Thunderstorm',
    needs: 'power',
    blurb: 'Six jumps that stun.',
    icon: 'lightning_rod',
  },
  fire() {
    return false;
  },
};
