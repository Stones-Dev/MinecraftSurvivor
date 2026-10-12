import type { WeaponDef, WeaponLevel } from './types';

// STUB: replaced by the real implementation.
const level: WeaponLevel = { dmg: 10, cd: 2, area: 0, count: 1, pierce: 0, blurb: 'TODO' };

export const crossbow: WeaponDef = {
  id: 'crossbow',
  name: 'Crossbow',
  icon: 'crossbow',
  levels: [level, level, level, level, level],
  evolution: {
    id: 'multishot_crossbow',
    name: 'Multishot Crossbow',
    needs: 'multishot',
    blurb: 'Fires a five-way volley.',
    icon: 'crossbow',
  },
  fire() {
    return false;
  },
};
