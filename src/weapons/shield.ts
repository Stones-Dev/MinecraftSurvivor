import { cooldownOf } from './helpers';
import type { WeaponDef } from './types';

/**
 * Passive defence: the shield blocks one hit per cooldown (combat.ts consumes it in hurtPlayer
 * and in the Spiked Shield reflect path). `dmg` is the thorns damage returned to attackers.
 */
export const shield: WeaponDef = {
  id: 'shield',
  name: 'Shield',
  icon: 'shield',
  levels: [
    { dmg: 10, cd: 8, area: 0, count: 1, pierce: 0, blurb: 'Blocks one hit every 8 s. 10 thorns.' },
    { dmg: 15, cd: 7, area: 0, count: 1, pierce: 0, blurb: 'Blocks every 7 s. Thorns 15.' },
    { dmg: 20, cd: 6, area: 0, count: 1, pierce: 0, blurb: 'Blocks every 6 s. Thorns 20.' },
    { dmg: 25, cd: 5, area: 0, count: 1, pierce: 0, blurb: 'Blocks every 5 s. Thorns 25.' },
    { dmg: 30, cd: 4, area: 0, count: 1, pierce: 0, blurb: 'Blocks every 4 s. Thorns 30.' },
  ],
  evolution: {
    id: 'spiked_shield',
    name: 'Spiked Shield',
    needs: 'thorns',
    blurb: 'Blocked projectiles fly back at their shooter; thorns x1.5, cooldown x0.8.',
    icon: 'shield',
  },
  tick(run, w, s, dt) {
    const sh = run.shield;
    sh.has = true;
    sh.cd = cooldownOf(run, s) * (w.evolved ? 0.8 : 1);
    sh.thorns = s.dmg * (w.evolved ? 1.5 : 1);
    sh.reflect = w.evolved;
    if (!sh.ready) {
      sh.timer -= dt;
      if (sh.timer <= 0) {
        sh.timer = 0;
        sh.ready = true;
      }
    }
  },
  fire() {
    return false;
  },
};
