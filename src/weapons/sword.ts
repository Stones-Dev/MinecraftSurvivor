import { makeFx } from '../entities/fx';
import type { Enemy } from '../entities/enemy';
import { damageEnemy } from '../systems/combat';
import {
  areaOf,
  cooldownOf,
  damageOf,
  enemiesInCircle,
  faceToward,
  nearestEnemy,
  onHitMods,
} from './helpers';
import type { WeaponDef } from './types';

const hits: Enemy[] = [];

export const sword: WeaponDef = {
  id: 'sword',
  name: 'Sword',
  icon: 'sword',
  levels: [
    { dmg: 14, cd: 0.85, area: 38, count: 1, pierce: 99, blurb: 'Sweeps an arc in front of you.' },
    { dmg: 17, cd: 0.8, area: 41, count: 1, pierce: 99, blurb: '+3 damage, wider arc.' },
    { dmg: 21, cd: 0.74, area: 44, count: 1, pierce: 99, blurb: '+4 damage, faster swings.' },
    { dmg: 26, cd: 0.68, area: 48, count: 1, pierce: 99, blurb: '+5 damage, wider arc.' },
    { dmg: 32, cd: 0.6, area: 54, count: 1, pierce: 99, blurb: '+6 damage, much faster.' },
  ],
  evolution: {
    id: 'sweeping_blade',
    name: 'Sweeping Blade',
    needs: 'sweeping_edge',
    blurb: 'Spins in a full 360 degree circle.',
    icon: 'sweep',
  },
  cooldown: (run, _w, s) => cooldownOf(run, s) * run.swordCd,
  fire(run, w, s) {
    const area = areaOf(run, s) * (1 + run.swordArea);
    const target = nearestEnemy(run, area + 14);
    if (!target) return false;
    const p = run.player;
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    faceToward(run, target.x);
    p.swingT = 0.33;
    run.emit('swing');
    const half = w.evolved ? Math.PI : w.level >= 5 ? 1.4 : 1.1;
    const dmg = damageOf(run, s) * run.swordDmg * run.mods.swordMult * (w.evolved ? 1.15 : 1);
    enemiesInCircle(run, p.x, p.y, area, hits);
    for (const e of hits) {
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      let diff = Math.abs(a - angle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > half) continue;
      damageEnemy(run, e, dmg, p.x, p.y, 70);
      onHitMods(run, e, 'melee', dmg);
    }
    run.fx.push(
      makeFx('arc', p.x, p.y - 8, 0.22, {
        a0: angle - half,
        a1: angle + half,
        r: area,
        color: '#e9f4ff',
      }),
    );
    return true;
  },
};
