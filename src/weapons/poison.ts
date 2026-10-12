import type { Enemy } from '../entities/enemy';
import { makeFx } from '../entities/fx';
import { Projectile } from '../entities/projectile';
import type { RunState, Zone } from '../game';
import { areaOf, countOf, damageOf, faceToward, nearestEnemy } from './helpers';
import type { WeaponDef, WeaponState } from './types';

/** How far from the hero the potions look for targets. */
const RANGE = 200;
/** Flight time of a lobbed potion, seconds. */
const LOB_DUR = 0.7;
/** Cloud duration per weapon level, seconds (before the Infinity multiplier). */
const CLOUD_DUR = [4, 5, 5.5, 6, 7];
const CLOUD_COLOR = '#7bd389';

const near: Enemy[] = [];

/** Nearest living enemy to the hero within RANGE that is not already in `taken`. */
function nextTarget(run: RunState, taken: Enemy[]): Enemy | null {
  const p = run.player;
  run.hash.query(p.x, p.y, RANGE, near);
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of near) {
    if (e.dying || taken.includes(e)) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d <= RANGE && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Lob a potion from the hero to the target; `onLand` runs where it shatters. */
function throwAt(
  run: RunState,
  target: Enemy,
  onLand: (run: RunState, x: number, y: number) => void,
): void {
  const p = run.player;
  const potion = new Projectile(p.x, p.y - 8, 0, 0, 4, 0, 0, true, LOB_DUR + 1);
  potion.style = 'potion_poison';
  potion.lobDur = LOB_DUR;
  potion.tx = target.x;
  potion.ty = target.y - 4;
  potion.onLand = (rn, proj) => {
    rn.emit('splash');
    onLand(rn, proj.tx, proj.ty);
  };
  run.projectiles.push(potion);
}

function levelIndex(w: WeaponState): number {
  return Math.min(CLOUD_DUR.length - 1, Math.max(0, w.level - 1));
}

export const poison: WeaponDef = {
  id: 'poison',
  name: 'Poison Potion',
  icon: 'potion',
  levels: [
    {
      dmg: 6,
      cd: 4.0,
      area: 28,
      count: 1,
      pierce: 0,
      blurb: 'Lobs a poison potion that leaves a damaging cloud.',
    },
    {
      dmg: 8,
      cd: 3.7,
      area: 32,
      count: 1,
      pierce: 0,
      blurb: '+2 damage per second, bigger cloud.',
    },
    {
      dmg: 10,
      cd: 3.4,
      area: 36,
      count: 1,
      pierce: 0,
      blurb: '+2 damage per second, lasts longer.',
    },
    {
      dmg: 13,
      cd: 3.1,
      area: 40,
      count: 2,
      pierce: 0,
      blurb: '+3 damage per second, a second potion.',
    },
    {
      dmg: 16,
      cd: 2.8,
      area: 46,
      count: 2,
      pierce: 0,
      blurb: '+3 damage per second, widest and fastest.',
    },
  ],
  evolution: {
    id: 'wither_cloud',
    name: 'Wither Cloud',
    needs: 'protection',
    blurb: 'Bigger cloud that withers enemies and slows them.',
    icon: 'potion',
  },
  fire(run, w, s) {
    const first = nearestEnemy(run, RANGE);
    if (!first) return false;
    faceToward(run, first.x);
    const targets: Enemy[] = [first];
    const want = countOf(run, s);
    while (targets.length < want) {
      const next = nextTarget(run, targets);
      if (!next) break;
      targets.push(next);
    }
    const evolved = w.evolved;
    const dps = damageOf(run, s, true);
    const radius = areaOf(run, s) * run.mods.potionArea * (evolved ? 1.4 : 1);
    const dur = (CLOUD_DUR[levelIndex(w)] ?? 4) * run.mods.duration * (evolved ? 1.3 : 1);
    const kind: Zone['kind'] = evolved ? 'wither' : 'poison';
    const slowF = evolved ? 0.6 : 1;
    for (const t of targets) {
      throwAt(run, t, (rn, x, y) => {
        rn.fx.push(makeFx('ring', x, y, 0.35, { r: radius, color: CLOUD_COLOR }));
        rn.zones.push({
          x,
          y,
          r: radius,
          t: 0,
          dur,
          dps,
          tick: 0,
          kind,
          slowF,
          friendly: true,
        });
      });
    }
    return true;
  },
};
