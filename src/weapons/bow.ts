import { aimPointY } from '../core/geom';
import { Projectile } from '../entities/projectile';
import { aimedAngle, areaOf, countOf, damageOf, faceToward, nearestEnemy } from './helpers';
import type { WeaponDef } from './types';

export const bow: WeaponDef = {
  id: 'bow',
  name: 'Bow',
  icon: 'bow',
  levels: [
    { dmg: 8, cd: 1.3, area: 0, count: 1, pierce: 0, blurb: 'Shoots the nearest enemy.' },
    { dmg: 9, cd: 1.2, area: 0, count: 1, pierce: 0, blurb: '+1 damage, faster.' },
    { dmg: 11, cd: 1.1, area: 0, count: 2, pierce: 0, blurb: 'Two arrows per volley.' },
    { dmg: 13, cd: 1.0, area: 0, count: 2, pierce: 1, blurb: 'Arrows pierce one enemy.' },
    { dmg: 16, cd: 0.9, area: 0, count: 3, pierce: 2, blurb: 'Three piercing arrows.' },
  ],
  evolution: {
    id: 'inferno_bow',
    name: 'Inferno Bow',
    needs: 'flame',
    blurb: 'Burning, piercing arrows.',
    icon: 'bow',
  },
  fire(run, w, s) {
    void areaOf;
    const target = nearestEnemy(run, 230);
    if (!target) return false;
    const p = run.player;
    const base = aimedAngle(run, Math.atan2(aimPointY(target) - (p.y - 8), target.x - p.x));
    faceToward(run, target.x);
    run.emit('bow');
    const count = countOf(run, s);
    const speed = 220 * run.mods.projSpeed;
    const dmg = damageOf(run, s, true) * (w.evolved ? 1.2 : 1);
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * 0.14;
      const arrow = new Projectile(
        p.x,
        p.y - 8,
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        2,
        dmg,
        s.pierce + run.mods.pierce + (w.evolved ? 2 : 0),
        true,
        1.3,
      );
      if (w.evolved || run.rng.ai.chance(run.mods.flame)) {
        arrow.burn = 3 * run.mods.duration;
        arrow.burnDps = Math.max(2, dmg * 0.3);
      }
      run.projectiles.push(arrow);
    }
    return true;
  },
};
