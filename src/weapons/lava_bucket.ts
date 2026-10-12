import type { WeaponDef, WeaponLevel } from './types';

// STUB: replaced by the real implementation.
const level: WeaponLevel = { dmg: 10, cd: 2, area: 0, count: 1, pierce: 0, blurb: 'TODO' };

export const lava_bucket: WeaponDef = {
  id: 'lava_bucket',
  name: 'Lava Bucket',
  icon: 'lava_bucket',
  levels: [level, level, level, level, level],
  evolution: {
    id: 'magma_trail',
    name: 'Magma Trail',
    needs: 'fire_aspect',
    blurb: 'Wider, lingering trail.',
    icon: 'lava_bucket',
  },
  fire() {
    return false;
  },
};
