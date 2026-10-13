import type { Enemy } from '../entities/enemy';
import { makeFx } from '../entities/fx';
import { damageEnemy } from '../systems/combat';
import {
  aimedAngle,
  areaOf,
  damageOf,
  enemiesInCircle,
  faceToward,
  nearestEnemy,
  onHitMods,
} from './helpers';
import type { WeaponDef } from './types';

const hits: Enemy[] = [];
/** Half-width of the swing around the target direction, in radians. */
const HALF_ARC = 1.0;
const KNOCK = 160;

export const axe: WeaponDef = {
  id: 'axe',
  name: 'Axe',
  icon: 'axe',
  levels: [
    {
      dmg: 28,
      cd: 1.9,
      area: 30,
      count: 1,
      pierce: 99,
      blurb: 'A heavy swing with a 25% crit chance.',
    },
    { dmg: 36, cd: 1.7, area: 32, count: 1, pierce: 99, blurb: '+8 damage, faster swings.' },
    { dmg: 47, cd: 1.55, area: 34, count: 1, pierce: 99, blurb: '+11 damage, wider swing.' },
    { dmg: 58, cd: 1.4, area: 36, count: 1, pierce: 99, blurb: '+11 damage, faster swings.' },
    { dmg: 70, cd: 1.2, area: 38, count: 1, pierce: 99, blurb: '+12 damage, widest and fastest.' },
  ],
  evolution: {
    id: 'diamond_cleaver',
    name: 'Diamond Cleaver',
    needs: 'sharpness',
    blurb: 'Crits hit 60% of the time for x2.5 and strip armor.',
    icon: 'axe',
  },
  fire(run, w, s) {
    const area = areaOf(run, s);
    const target = nearestEnemy(run, area + 16);
    if (!target) return false;
    const p = run.player;
    const angle = aimedAngle(run, Math.atan2(target.y - p.y, target.x - p.x));
    faceToward(run, target.x);
    p.swingT = 0.33;
    run.emit('swing');
    const baseDmg = damageOf(run, s);
    const critChance = (w.evolved ? 0.6 : 0.25) + run.mods.luck;
    const critMult = w.evolved ? 2.5 : 2;
    enemiesInCircle(run, p.x, p.y, area, hits);
    let landed = false;
    for (const e of hits) {
      let diff = Math.abs(Math.atan2(e.y - p.y, e.x - p.x) - angle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > HALF_ARC) continue;
      let dmg = baseDmg;
      if (run.rng.ai.chance(critChance)) {
        dmg *= critMult;
        // Diamond Cleaver: the crit cuts through armor first.
        if (w.evolved) e.shield = 0;
        run.fx.push(
          makeFx('text', e.x, e.y - 22, 0.6, { text: 'CRIT!', vy: -20, color: '#ffe27a' }),
        );
      }
      damageEnemy(run, e, dmg, p.x, p.y, KNOCK, false, dmg > baseDmg);
      onHitMods(run, e, 'melee', dmg);
      landed = true;
    }
    if (landed) run.hitStop.holdSwing();
    run.fx.push(
      makeFx('arc', p.x, p.y - 8, 0.3, {
        a0: angle - HALF_ARC,
        a1: angle + HALF_ARC,
        r: area,
        color: '#e9f4ff',
      }),
    );
    return true;
  },
};
