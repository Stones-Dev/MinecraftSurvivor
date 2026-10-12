import { Projectile } from '../entities/projectile';
import { countOf, damageOf, faceToward, nearestEnemy, onHitMods } from './helpers';
import type { WeaponDef } from './types';

/** Reach of the bolt in px (targets further away are ignored). */
const RANGE = 260;
/** Bolt speed in px/s before Power-style speed modifiers. */
const SPEED = 260;
/** Total angle of the evolved fan, in radians. */
const FAN_SPREAD = 0.5;
/** Each bolt of the evolved fan deals this share of the damage: the fan can hit several targets. */
const FAN_DMG = 0.6;
/** Angle between bolts of a normal volley (only Multishot adds more than one). */
const VOLLEY_STEP = 0.12;

export const crossbow: WeaponDef = {
  id: 'crossbow',
  name: 'Crossbow',
  icon: 'crossbow',
  levels: [
    {
      dmg: 30,
      cd: 2.2,
      area: 0,
      count: 1,
      pierce: 3,
      blurb: 'Slow, heavy bolt that pierces three enemies.',
    },
    { dmg: 38, cd: 2.0, area: 0, count: 1, pierce: 3, blurb: '+8 damage, faster reload.' },
    { dmg: 48, cd: 1.8, area: 0, count: 1, pierce: 3, blurb: '+10 damage, faster reload.' },
    { dmg: 58, cd: 1.6, area: 0, count: 1, pierce: 4, blurb: '+10 damage, bolts pierce one more.' },
    { dmg: 70, cd: 1.5, area: 0, count: 1, pierce: 4, blurb: '+12 damage, fastest reload.' },
  ],
  evolution: {
    id: 'multishot_crossbow',
    name: 'Multishot Crossbow',
    needs: 'multishot',
    blurb: 'Fires a five-way volley that pierces one more enemy.',
    icon: 'crossbow',
  },
  fire(run, w, s) {
    const p = run.player;
    const target = nearestEnemy(run, RANGE);
    if (!target || Math.hypot(target.x - p.x, target.y - p.y) > RANGE) return false;
    faceToward(run, target.x);
    run.emit('bow');
    const base = Math.atan2(target.y - 4 - (p.y - 8), target.x - p.x);
    const evolved = w.evolved;
    // Evolved: a fan of at least five bolts spanning FAN_SPREAD in total.
    const n = evolved ? Math.max(5, countOf(run, s)) : countOf(run, s);
    const step = evolved ? FAN_SPREAD / (n - 1) : VOLLEY_STEP;
    const speed = SPEED * run.mods.projSpeed;
    const dmg = damageOf(run, s, true) * (evolved ? FAN_DMG : 1);
    const pierce = s.pierce + run.mods.pierce + (evolved ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * step;
      const bolt = new Projectile(
        p.x,
        p.y - 8,
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        2,
        dmg,
        pierce,
        true,
        (RANGE * 1.2) / speed,
      );
      bolt.style = 'bolt';
      bolt.knock = 60;
      bolt.onHit = (r, _bolt, e) => onHitMods(r, e, 'projectile', dmg);
      run.projectiles.push(bolt);
    }
    return true;
  },
};
