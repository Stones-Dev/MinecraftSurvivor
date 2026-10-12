import { makeFx } from '../entities/fx';
import type { Enemy } from '../entities/enemy';
import { damageEnemy, explode } from '../systems/combat';
import { enemiesInCircle } from '../weapons/helpers';
import type { AbilityDef } from './types';

const hits: Enemy[] = [];
/** Fuse length in seconds and the blast radius before Area. */
export const FUSE = 1.2;
const RADIUS = 90;

/** Creeper: hiss, swell, and go off in a huge blast that never hurts him. */
export const chargedBlast: AbilityDef = {
  id: 'charged_blast',
  name: 'Charged Blast',
  icon: 'tnt',
  cooldown: 22,
  blurb:
    'Hiss for 1.2 s, then explode in a huge blast that hurls enemies away and sets off TNT. It never hurts you.',
  cast(run) {
    const p = run.player;
    const power = run.mods.abilityPower;
    const r = RADIUS * run.mods.area;
    p.castT = p.castDur = FUSE;
    run.emit('hiss');
    // The fuse ring pulses on the hero four times while he swells.
    for (let i = 0; i < 4; i++) {
      run.later(i * 0.3, () => {
        const q = run.player;
        run.fx.push(
          makeFx('ring', q.x, q.y - 4, 0.3, { r, color: i % 2 === 0 ? '#ffffff' : '#ff4d4d' }),
        );
      });
    }
    // Untouchable from the last moments of the fuse until just after the bang.
    run.later(FUSE - 0.4, () => {
      run.player.iframes = Math.max(run.player.iframes, 0.8);
    });
    run.later(FUSE, () => {
      const q = run.player;
      if (q.dead) return;
      explode(run, q.x, q.y, r, 0, 0, null); // fx, sound and TNT chain; no self damage
      enemiesInCircle(run, q.x, q.y, r, hits);
      for (const e of hits) damageEnemy(run, e, 48 * run.mods.dmg * power, q.x, q.y, 260);
      run.fx.push(makeFx('ring', q.x, q.y - 4, 0.6, { r: r * 1.15, color: '#7dff6a' }));
      run.shake = Math.max(run.shake, 7);
      run.flash = Math.max(run.flash, 0.35);
    });
    return true;
  },
};
