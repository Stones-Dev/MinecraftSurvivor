import { aimPointY } from '../core/geom';
import type { Enemy } from '../entities/enemy';
import { Projectile } from '../entities/projectile';
import type { RunState } from '../game';
import { applyStatus } from '../systems/status';
import { areaOf, countOf, damageOf, enemiesInCircle, faceToward, onHitMods } from './helpers';
import type { WeaponDef } from './types';

/** Pull strength added to the enemy's knockback velocity (px/s, decays quickly). */
const PULL = 220;
/** Bosses and mini-bosses resist the pull. */
const BOSS_PULL = 80;
const HOOK_SPEED = 200;
/** Harpoon: hooks thrown per use, at the nearest distinct enemies. */
const HARPOON_HOOKS = 3;
/** Harpoon: stun time of each hook hit, in seconds. */
const HARPOON_STUN = 1;
/** Homing turn rate of the hook, in rad/s. */
const HOOK_TURN = 6;
/** Manual aim: angle between neighbouring hooks of one throw, radians. */
const MANUAL_FAN = 0.2;

const found: Enemy[] = [];

/** Up to `n` distinct living enemies whose centre is within `range` px, nearest first. */
function nearestTargets(run: RunState, range: number, n: number): Enemy[] {
  const p = run.player;
  const dist = (e: Enemy): number => Math.hypot(e.x - p.x, e.y - p.y);
  const list = enemiesInCircle(run, p.x, p.y, range, found).filter((e) => dist(e) <= range);
  list.sort((a, b) => dist(a) - dist(b));
  return list.slice(0, n);
}

export const fishing_rod: WeaponDef = {
  id: 'fishing_rod',
  name: 'Fishing Rod',
  icon: 'fishing_rod',
  levels: [
    {
      dmg: 8,
      cd: 0.9,
      area: 120,
      count: 1,
      pierce: 0,
      blurb: 'Hooks the nearest enemy and reels it in.',
    },
    { dmg: 11, cd: 0.9, area: 130, count: 1, pierce: 0, blurb: '+3 damage, longer line.' },
    {
      dmg: 15,
      cd: 0.85,
      area: 140,
      count: 2,
      pierce: 0,
      blurb: 'Two hooks at the two nearest enemies.',
    },
    {
      dmg: 19,
      cd: 0.85,
      area: 150,
      count: 2,
      pierce: 1,
      blurb: '+4 damage, hooks pass one enemy.',
    },
    { dmg: 24, cd: 0.8, area: 160, count: 2, pierce: 1, blurb: '+5 damage, longest line.' },
  ],
  evolution: {
    id: 'harpoon',
    name: 'Harpoon',
    needs: 'knockback',
    blurb: 'Hooks three enemies; each hit stuns them.',
    icon: 'fishing_rod',
  },
  fire(run, w, s) {
    const p = run.player;
    const evolved = w.evolved;
    const hooks = evolved ? Math.max(HARPOON_HOOKS, countOf(run, s)) : countOf(run, s);
    const range = areaOf(run, s);
    const targets = nearestTargets(run, range, hooks);
    const first = targets[0];
    if (!first) return false;
    faceToward(run, first.x);
    run.emit('swing');
    const speed = HOOK_SPEED * run.mods.projSpeed;
    const dmg = damageOf(run, s, true);
    const pierce = s.pierce + run.mods.pierce;
    const manual = p.manualAim;
    let hookNo = 0;
    for (const target of targets) {
      // Manual aim: the hooks fly straight along the aim (a small fan for two or three), no homing.
      const a = manual
        ? Math.atan2(manual.y, manual.x) + (hookNo++ - (targets.length - 1) / 2) * MANUAL_FAN
        : Math.atan2(aimPointY(target) - (p.y - 8), target.x - p.x);
      const hook = new Projectile(
        p.x,
        p.y - 8,
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        2,
        dmg,
        pierce,
        true,
        (range * 1.1) / speed,
      );
      hook.style = 'hook';
      hook.knock = 0; // the line reels the enemy in; it is not pushed away
      if (!manual) {
        hook.homing = true;
        hook.turn = HOOK_TURN;
        hook.target = target;
      }
      hook.onHit = (r, _hook, e) => {
        onHitMods(r, e, 'projectile', dmg);
        const hero = r.player;
        const dx = hero.x - e.x;
        const dy = hero.y - e.y;
        const len = Math.hypot(dx, dy) || 1;
        const pull = e.boss ? BOSS_PULL : PULL;
        e.kx += (dx / len) * pull;
        e.ky += (dy / len) * pull;
        if (evolved) applyStatus(e, 'stun', HARPOON_STUN);
      };
      run.projectiles.push(hook);
    }
    return true;
  },
};
