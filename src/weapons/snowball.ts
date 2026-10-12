import { Projectile } from '../entities/projectile';
import { countOf, damageOf, faceToward, nearestEnemy, onHitMods } from './helpers';
import type { WeaponDef } from './types';

/** Reach of the throw in px. */
const RANGE = 230;
/** Snowball speed in px/s before Power-style speed modifiers. */
const SPEED = 220;
/** Angle between neighbouring snowballs of the fan. */
const SPREAD = 0.18;
/** Blizzard: the fan is wider and tighter-packed per snowball. */
const BLIZZARD_SPREAD = 0.14;
const BLIZZARD_FANS = 7;
/** Blizzard: chance that each snowball freezes its target. */
const BLIZZARD_FREEZE = 0.3;
const SLOW_TIME = 2.5;
const SLOW_FACTOR = 0.6;

export const snowball: WeaponDef = {
  id: 'snowball',
  name: 'Snowball',
  icon: 'snowball',
  levels: [
    {
      dmg: 6,
      cd: 1.8,
      area: 0,
      count: 3,
      pierce: 0,
      blurb: 'Three snowballs that slow what they hit.',
    },
    { dmg: 8, cd: 1.7, area: 0, count: 3, pierce: 0, blurb: '+2 damage, faster throws.' },
    { dmg: 10, cd: 1.6, area: 0, count: 4, pierce: 1, blurb: 'Four snowballs, one pierce.' },
    { dmg: 12, cd: 1.5, area: 0, count: 4, pierce: 1, blurb: '+2 damage, faster throws.' },
    { dmg: 14, cd: 1.4, area: 0, count: 5, pierce: 2, blurb: 'Five snowballs, pierce two.' },
  ],
  evolution: {
    id: 'blizzard',
    name: 'Blizzard',
    needs: 'frost_walker',
    blurb: 'Seven-way fan; each snowball may freeze its target.',
    icon: 'snowball',
  },
  fire(run, w, s) {
    const p = run.player;
    const target = nearestEnemy(run, RANGE);
    if (!target || Math.hypot(target.x - p.x, target.y - p.y) > RANGE) return false;
    faceToward(run, target.x);
    run.emit('snow');
    const base = Math.atan2(target.y - 4 - (p.y - 8), target.x - p.x);
    const evolved = w.evolved;
    const n = evolved ? Math.max(BLIZZARD_FANS, countOf(run, s)) : countOf(run, s);
    const step = evolved ? BLIZZARD_SPREAD : SPREAD;
    const speed = SPEED * run.mods.projSpeed;
    const dmg = damageOf(run, s, true);
    const pierce = s.pierce + run.mods.pierce;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * step;
      const ball = new Projectile(
        p.x,
        p.y - 8,
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        3,
        dmg,
        pierce,
        true,
        (RANGE * 1.2) / speed,
      );
      ball.style = 'snowball';
      ball.knock = 20;
      ball.slowT = SLOW_TIME;
      ball.slowF = SLOW_FACTOR;
      if (evolved && run.rng.ai.chance(BLIZZARD_FREEZE)) ball.freeze = 1.0;
      ball.onHit = (r, _ball, e) => onHitMods(r, e, 'projectile', dmg);
      run.projectiles.push(ball);
    }
    return true;
  },
};
