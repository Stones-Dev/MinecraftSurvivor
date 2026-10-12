import { Projectile } from '../entities/projectile';
import { areaOf, countOf, damageOf, faceToward, nearestEnemy, onHitMods } from './helpers';
import type { WeaponDef } from './types';

/** Enemies further than this (px) from the hero are not targeted. */
const RANGE = 180;
/** Outbound speed in px/s before Power-style speed modifiers. */
const SPEED = 260;
/** Angle between two tridents of one volley. */
const SPLIT = 0.2;
/** Riptide: the dash covers up to this many px toward the target. */
const RIPTIDE_DASH = 60;
/** Riptide: horizontal speed of the hero dash; must match the dash step in systems/items.ts. */
const DASH_SPEED = 320;
const RIPTIDE_DASH_TIME = 0.18;
const RIPTIDE_IFRAMES = 0.3;
/** Riptide: extra damage of the trident. */
const RIPTIDE_BONUS = 1.25;

export const trident: WeaponDef = {
  id: 'trident',
  name: 'Trident',
  icon: 'trident',
  levels: [
    {
      dmg: 10,
      cd: 1.8,
      area: 130,
      count: 1,
      pierce: 0,
      blurb: 'Boomerang: hits on the way out and on the way back.',
    },
    { dmg: 12, cd: 1.7, area: 140, count: 1, pierce: 0, blurb: '+2 damage, longer throw.' },
    { dmg: 14, cd: 1.6, area: 150, count: 2, pierce: 1, blurb: 'Two tridents at an angle.' },
    { dmg: 17, cd: 1.5, area: 160, count: 2, pierce: 1, blurb: '+3 damage, longer throw.' },
    { dmg: 20, cd: 1.4, area: 170, count: 2, pierce: 2, blurb: '+3 damage, longest throw.' },
  ],
  evolution: {
    id: 'riptide',
    name: 'Riptide',
    needs: 'depth_strider',
    blurb: 'Dashes you toward the target and hits harder.',
    icon: 'trident',
  },
  fire(run, w, s) {
    const p = run.player;
    const target = nearestEnemy(run, RANGE);
    if (!target || Math.hypot(target.x - p.x, target.y - p.y) > RANGE) return false;
    faceToward(run, target.x);
    run.emit('swing');
    const evolved = w.evolved;
    const reach = areaOf(run, s);
    const speed = SPEED * run.mods.projSpeed;
    const count = countOf(run, s);
    const base = Math.atan2(target.y - 4 - (p.y - 8), target.x - p.x);
    const dmg = damageOf(run, s, true) * (evolved ? RIPTIDE_BONUS : 1);
    // Hits are counted over both passes: the budget covers the outbound and the return trip.
    const pierce = 3 + s.pierce + run.mods.pierce;
    // Out and back at about 1.1x speed, plus a margin; the engine removes it when it reaches the hero.
    const life = (2 * reach) / speed + 0.6;
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * SPLIT;
      const spear = new Projectile(
        p.x,
        p.y - 8,
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        3,
        dmg,
        pierce,
        true,
        life,
      );
      spear.style = 'trident';
      spear.boomerang = true;
      spear.maxDist = reach;
      spear.knock = 30;
      spear.onHit = (r, _spear, e) => onHitMods(r, e, 'projectile', dmg);
      run.projectiles.push(spear);
    }
    if (evolved) {
      // Riptide: lunge toward the target and be briefly invulnerable.
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        const dashT = Math.min(RIPTIDE_DASH_TIME, Math.min(RIPTIDE_DASH, len) / DASH_SPEED);
        run.dash = { dx: dx / len, dy: dy / len, t: dashT };
      }
      p.iframes = Math.max(p.iframes, RIPTIDE_IFRAMES);
    }
    return true;
  },
};
