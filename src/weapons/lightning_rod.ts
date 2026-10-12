import type { Enemy } from '../entities/enemy';
import { boltPoints, makeFx } from '../entities/fx';
import type { RunState } from '../game';
import { damageEnemy } from '../systems/combat';
import { applyStatus } from '../systems/status';
import { areaOf, damageOf, nearestEnemy, onHitMods } from './helpers';
import type { WeaponDef } from './types';

/** How far from the hero the first strike can land. */
const STRIKE_RANGE = 170;
/** Height the first bolt comes down from, px. */
const SKY = 90;
/** Each later jump hits this share of the previous damage. */
const FALLOFF = 0.85;
/** Thunderstorm: stun length per hit, seconds. */
const STUN_TIME = 1;
/** Thunderstorm: total jumps, regardless of the level count. */
const EVOLVED_JUMPS = 6;

const near: Enemy[] = [];

interface Point {
  x: number;
  y: number;
}

/** Nearest living enemy within `reach` of `from` that has not been struck yet. */
function nextTarget(run: RunState, from: Point, reach: number, taken: Enemy[]): Enemy | null {
  run.hash.query(from.x, from.y, reach, near);
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of near) {
    if (e.dying || taken.includes(e)) continue;
    const d = Math.hypot(e.x - from.x, e.y - from.y);
    if (d <= reach && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** One bolt from `from` to the enemy: visual, damage, passives and the Thunderstorm stun. */
function strike(run: RunState, from: Point, e: Enemy, dmg: number, stun: boolean): void {
  run.fx.push(
    makeFx('bolt', 0, 0, 0.3, {
      pts: boltPoints(from.x, from.y, e.x, e.y - 6, 4, () => run.rng.fx.float()),
    }),
  );
  damageEnemy(run, e, dmg, from.x, from.y, 20);
  onHitMods(run, e, 'projectile', dmg);
  if (stun) applyStatus(e, 'stun', STUN_TIME);
}

export const lightning_rod: WeaponDef = {
  id: 'lightning_rod',
  name: 'Lightning Rod',
  icon: 'lightning_rod',
  levels: [
    {
      dmg: 20,
      cd: 3.5,
      area: 70,
      count: 3,
      pierce: 0,
      blurb: 'Chain lightning strikes up to 3 enemies.',
    },
    { dmg: 28, cd: 3.2, area: 70, count: 3, pierce: 0, blurb: '+8 damage, faster strikes.' },
    {
      dmg: 36,
      cd: 2.9,
      area: 80,
      count: 4,
      pierce: 0,
      blurb: 'Chains to 4 enemies, longer jumps.',
    },
    { dmg: 45, cd: 2.5, area: 80, count: 4, pierce: 0, blurb: '+9 damage, faster strikes.' },
    {
      dmg: 55,
      cd: 2.2,
      area: 90,
      count: 5,
      pierce: 0,
      blurb: 'Chains to 5 enemies, longest jumps.',
    },
  ],
  evolution: {
    id: 'thunderstorm',
    name: 'Thunderstorm',
    needs: 'power',
    blurb: 'Six jumps; every hit also stuns for 1 second.',
    icon: 'lightning_rod',
  },
  fire(run, w, s) {
    const first = nearestEnemy(run, STRIKE_RANGE);
    if (!first) return false;
    run.emit('thunder');
    const jumps = w.evolved ? EVOLVED_JUMPS : s.count;
    const reach = areaOf(run, s);
    const taken: Enemy[] = [];
    let from: Point = { x: first.x, y: first.y - SKY };
    let target: Enemy | null = first;
    let dmg = damageOf(run, s);
    while (target && taken.length < jumps) {
      taken.push(target);
      strike(run, from, target, dmg, w.evolved);
      from = { x: target.x, y: target.y };
      dmg *= FALLOFF;
      target = nextTarget(run, from, reach, taken);
    }
    return true;
  },
};
