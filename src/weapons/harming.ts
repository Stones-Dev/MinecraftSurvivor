import type { WeaponDef, WeaponLevel } from './types';

// STUB: replaced by the real implementation.
const level: WeaponLevel = { dmg: 10, cd: 2, area: 0, count: 1, pierce: 0, blurb: 'TODO' };

export const harming: WeaponDef = {
  id: 'harming',
  name: 'Splash Harming',
  icon: 'potion',
  levels: [level, level, level, level, level],
  evolution: {
    id: 'lingering_harming',
    name: 'Lingering Harming',
    needs: 'infinity',
    blurb: 'Leaves a damage pool.',
    icon: 'potion',
  },
  fire() {
    return false;
  },
};
