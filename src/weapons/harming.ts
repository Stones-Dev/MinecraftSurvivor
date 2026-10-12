import type { Enemy } from '../entities/enemy';
import { makeFx } from '../entities/fx';
import { Projectile } from '../entities/projectile';
import type { RunState } from '../game';
import { damageEnemy } from '../systems/combat';
import {
  areaOf,
  countOf,
  damageOf,
  enemiesInCircle,
  faceToward,
  nearestEnemy,
  onHitMods,
} from './helpers';
import type { WeaponDef } from './types';

/** How far from the hero the potions look for targets. */
const RANGE = 200;
/** Flight time of a lobbed potion, seconds. */
const LOB_DUR = 0.7;
/** Lingering Harming: the pool hurts this share of the splash damage per second. */
const POOL_SHARE = 0.25;
const RING_COLOR = '#e0457b';

const hits: Enemy[] = [];
const near: Enemy[] = [];

interface Pool {
  dps: number;
  dur: number;
}

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
  potion.style = 'potion_harm';
  potion.lobDur = LOB_DUR;
  potion.tx = target.x;
  potion.ty = target.y - 4;
  potion.onLand = (rn, proj) => {
    rn.emit('splash');
    onLand(rn, proj.tx, proj.ty);
  };
  run.projectiles.push(potion);
}

/** Splash damage around (x, y), plus an optional lingering pool. */
function splash(
  run: RunState,
  x: number,
  y: number,
  dmg: number,
  radius: number,
  pool: Pool | null,
): void {
  run.fx.push(makeFx('ring', x, y, 0.35, { r: radius, color: RING_COLOR }));
  enemiesInCircle(run, x, y, radius, hits);
  for (const e of hits) {
    if (Math.hypot(e.x - x, e.y - y) > radius + e.radius) continue;
    damageEnemy(run, e, dmg, x, y, 60);
    onHitMods(run, e, 'projectile', dmg);
  }
  if (pool) {
    run.zones.push({
      x,
      y,
      r: radius,
      t: 0,
      dur: pool.dur,
      dps: pool.dps,
      tick: 0,
      kind: 'harm',
      slowF: 1,
      friendly: true,
    });
  }
}

export const harming: WeaponDef = {
  id: 'harming',
  name: 'Splash Harming',
  icon: 'potion',
  levels: [
    {
      dmg: 24,
      cd: 3.0,
      area: 30,
      count: 1,
      pierce: 0,
      blurb: 'Lobs a splash potion at the nearest enemy.',
    },
    { dmg: 32, cd: 2.75, area: 36, count: 1, pierce: 0, blurb: '+8 damage, wider splash.' },
    { dmg: 40, cd: 2.5, area: 40, count: 1, pierce: 0, blurb: '+8 damage, quicker throws.' },
    { dmg: 50, cd: 2.25, area: 46, count: 2, pierce: 0, blurb: '+10 damage, a second potion.' },
    { dmg: 60, cd: 2.0, area: 52, count: 2, pierce: 0, blurb: '+10 damage, widest and fastest.' },
  ],
  evolution: {
    id: 'lingering_harming',
    name: 'Lingering Harming',
    needs: 'infinity',
    blurb: 'Splash potions also leave a damage pool that lasts 4 seconds.',
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
    const dmg = damageOf(run, s, true);
    const radius = areaOf(run, s) * run.mods.potionArea;
    const pool: Pool | null = w.evolved
      ? { dps: dmg * POOL_SHARE, dur: 4 * run.mods.duration }
      : null;
    for (const t of targets) {
      throwAt(run, t, (rn, x, y) => splash(rn, x, y, dmg, radius, pool));
    }
    return true;
  },
};
