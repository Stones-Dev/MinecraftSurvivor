import type { WeaponDef, WeaponLevel } from './types';

// STUB: replaced by the real implementation.
const level: WeaponLevel = { dmg: 10, cd: 2, area: 0, count: 1, pierce: 0, blurb: 'TODO' };

export const axe: WeaponDef = {
  id: 'axe',
  name: 'Axe',
  icon: 'axe',
  levels: [level, level, level, level, level],
  evolution: {
    id: 'diamond_cleaver',
    name: 'Diamond Cleaver',
    needs: 'sharpness',
    blurb: 'Armor-ignoring crits.',
    icon: 'axe',
  },
  fire() {
    return false;
  },
};
