import { boltPoints, makeFx } from '../entities/fx';
import { damageEnemy } from '../systems/combat';
import { enemiesInCircle } from '../weapons/helpers';
import type { Enemy } from '../entities/enemy';
import { type AbilityDef, aimDirection } from './types';

const hits: Enemy[] = [];
const WAVES = 3;
const ARROWS = 8;
const RANGE = 190;

/** Alex: call down three volleys of arrows on the aimed spot. */
export const arrowRain: AbilityDef = {
  id: 'arrow_rain',
  name: 'Arrow Rain',
  icon: 'arrow',
  cooldown: 15,
  blurb: 'Three volleys of arrows fall on the targeted area, hitting everything in it.',
  cast(run, aim) {
    const p = run.player;
    // The storm lands on the cursor, kept within range of the hero.
    const dir = aimDirection(run, aim);
    const dist = Math.min(RANGE, Math.max(40, Math.hypot(aim.x - p.x, aim.y - p.y) || 110));
    const cx = p.x + dir.x * dist;
    const cy = p.y + dir.y * dist;
    const radius = 48 * run.mods.area;
    const dmg = 13 * run.mods.dmg * run.mods.projDmg * run.mods.abilityPower;
    run.fx.push(makeFx('ring', cx, cy, 0.5, { r: radius, color: '#ffd84a' }));
    run.emit('bow');
    for (let w = 0; w < WAVES; w++) {
      for (let i = 0; i < ARROWS; i++) {
        const a = run.rng.ai.range(0, Math.PI * 2);
        const r = Math.sqrt(run.rng.ai.float()) * radius;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.75;
        run.later(0.25 + w * 0.4 + i * 0.03, () => {
          run.fx.push(
            makeFx('bolt', 0, 0, 0.16, {
              pts: boltPoints(x + 5, y - 70, x, y, 1, () => 0.5),
              color: '#e8e0c0',
            }),
          );
          enemiesInCircle(run, x, y, 13, hits);
          for (const e of hits) damageEnemy(run, e, dmg, x, y - 40, 30);
        });
      }
    }
    return true;
  },
};
