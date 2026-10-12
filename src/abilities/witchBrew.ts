import { makeFx } from '../entities/fx';
import { Projectile } from '../entities/projectile';
import type { Enemy } from '../entities/enemy';
import type { RunState, Zone } from '../game';
import { damageEnemy } from '../systems/combat';
import { applyStatus } from '../systems/status';
import { enemiesInCircle } from '../weapons/helpers';
import { type AbilityDef, aimDirection } from './types';

const hits: Enemy[] = [];
const RANGE = 170;
const LOB_DUR = 0.55;
const RADIUS = 56;

interface Brew {
  name: string;
  kind: Zone['kind'];
  color: string;
  /** Pool damage per second and instant splash damage, before modifiers. */
  dps: number;
  splash: number;
  slowF: number;
}

export const BREWS: readonly Brew[] = [
  { name: 'Poison Brew', kind: 'poison', color: '#7bd389', dps: 12, splash: 0, slowF: 0.8 },
  { name: 'Harming Brew', kind: 'harm', color: '#e0457b', dps: 6, splash: 28, slowF: 1 },
  { name: 'Slowness Brew', kind: 'frost', color: '#9fc8ee', dps: 5, splash: 0, slowF: 0.35 },
];

function shatter(run: RunState, brew: Brew, x: number, y: number, power: number): void {
  const r = RADIUS * run.mods.area * run.mods.potionArea;
  const dmg = run.mods.dmg * power;
  if (brew.splash > 0 || brew.slowF < 0.5) {
    enemiesInCircle(run, x, y, r, hits);
    for (const e of hits) {
      if (brew.splash > 0) damageEnemy(run, e, brew.splash * dmg, x, y, 70);
      if (brew.slowF < 0.5) applyStatus(e, 'slow', 2.5 * run.mods.duration, brew.slowF);
    }
  }
  run.zones.push({
    x,
    y,
    r,
    t: 0,
    dur: 5 * run.mods.duration,
    dps: brew.dps * dmg,
    tick: 0,
    kind: brew.kind,
    slowF: brew.slowF,
    friendly: true,
  });
  run.fx.push(makeFx('ring', x, y, 0.45, { r, color: brew.color }));
  run.fx.push(makeFx('text', x, y - 22, 0.9, { text: brew.name, vy: -14, color: brew.color }));
  run.emit('splash');
}

/** Witch: lob a big lingering potion of a random kind at the cursor. */
export const witchBrew: AbilityDef = {
  id: 'witch_brew',
  name: 'Witch Brew',
  icon: 'potion',
  cooldown: 14,
  blurb:
    'Lob a big lingering potion at the cursor: Poison, Harming or Slowness, the cauldron decides.',
  cast(run, aim) {
    const p = run.player;
    const dir = aimDirection(run, aim);
    const want = Math.hypot(aim.x - p.x, aim.y - p.y);
    const dist = Math.max(30, Math.min(RANGE, want > 6 ? want : 110));
    const brew = run.rng.ai.pick(BREWS);
    const power = run.mods.abilityPower;
    const flask = new Projectile(p.x, p.y - 10, 0, 0, 4, 0, 0, true, LOB_DUR + 1);
    flask.style = brew.kind === 'harm' ? 'potion_harm' : 'potion_poison';
    flask.lobDur = LOB_DUR;
    flask.height = 30;
    flask.tx = p.x + dir.x * dist;
    flask.ty = p.y + dir.y * dist;
    flask.onLand = (rn, q) => shatter(rn, brew, q.tx, q.ty, power);
    run.projectiles.push(flask);
    if (Math.abs(dir.x) > 0.1) p.aim(dir.x > 0 ? 1 : -1);
    run.emit('swing');
    return true;
  },
};
