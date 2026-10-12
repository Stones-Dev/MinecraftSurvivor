import type { WeaponDef, WeaponLevel } from './types';

// STUB: replaced by the real implementation.
const level: WeaponLevel = { dmg: 10, cd: 2, area: 0, count: 1, pierce: 0, blurb: 'TODO' };

export const shield: WeaponDef = {
  id: 'shield',
  name: 'Shield',
  icon: 'shield',
  levels: [level, level, level, level, level],
  evolution: {
    id: 'spiked_shield',
    name: 'Spiked Shield',
    needs: 'thorns',
    blurb: 'Reflects projectiles.',
    icon: 'shield',
  },
  fire() {
    return false;
  },
};
