import { makeFx } from '../entities/fx';
import type { Enemy } from '../entities/enemy';
import type { RunState } from '../game';
import { damageEnemy } from '../systems/combat';
import { enemiesInCircle } from '../weapons/helpers';
import { type AbilityDef, aimDirection } from './types';

const hits: Enemy[] = [];
const RANGE = 150;
const POP_RADIUS = 34;

/** Purple pop where the Enderman leaves and where he lands. */
function pop(run: RunState, x: number, y: number, dmg: number): void {
  const r = POP_RADIUS * run.mods.area;
  enemiesInCircle(run, x, y, r, hits);
  for (const e of hits) damageEnemy(run, e, dmg, x, y, 120);
  run.fx.push(makeFx('ring', x, y - 10, 0.35, { r, color: '#b06bff' }));
  for (let i = 0; i < 8; i++) {
    const a = run.rng.fx.range(0, Math.PI * 2);
    run.fx.push(
      makeFx('spark', x, y - 16, 0.5, {
        vx: Math.cos(a) * 40,
        vy: Math.sin(a) * 40 - 30,
        color: i % 2 === 0 ? '#d9a6ff' : '#7a3ad8',
      }),
    );
  }
}

/** Enderman: teleport towards the cursor with a damaging pop at both ends. */
export const blink: AbilityDef = {
  id: 'blink',
  name: 'Blink',
  icon: 'pearl',
  cooldown: 10,
  blurb:
    'Teleport up to 150 px towards the cursor; both ends burst for damage and you are untouchable briefly.',
  cast(run, aim) {
    const p = run.player;
    const dir = aimDirection(run, aim);
    const want = Math.hypot(aim.x - p.x, aim.y - p.y);
    const dist = Math.max(40, Math.min(RANGE, want > 6 ? want : RANGE));
    const dmg = 16 * run.mods.dmg * run.mods.abilityPower;
    pop(run, p.x, p.y, dmg);
    const c = run.world.collideSwept(p.x, p.y, p.x + dir.x * dist, p.y + dir.y * dist, p.radius);
    p.x = c.x;
    p.y = c.y;
    p.snap();
    run.dash = null;
    p.iframes = Math.max(p.iframes, 0.4);
    if (Math.abs(dir.x) > 0.1) p.aim(dir.x > 0 ? 1 : -1);
    pop(run, p.x, p.y, dmg);
    run.shake = Math.max(run.shake, 2);
    run.emit('portal');
    return true;
  },
};
