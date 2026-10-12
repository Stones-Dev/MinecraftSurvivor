import type { WeaponDef, WeaponLevel } from './types';

// STUB: replaced by the real implementation.
const level: WeaponLevel = { dmg: 10, cd: 2, area: 0, count: 1, pierce: 0, blurb: 'TODO' };

export const fishing_rod: WeaponDef = {
  id: 'fishing_rod',
  name: 'Fishing Rod',
  icon: 'fishing_rod',
  levels: [level, level, level, level, level],
  evolution: {
    id: 'harpoon',
    name: 'Harpoon',
    needs: 'knockback',
    blurb: 'Pulls three enemies and stuns.',
    icon: 'fishing_rod',
  },
  fire() {
    return false;
  },
};
