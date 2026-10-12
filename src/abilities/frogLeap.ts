import { makeFx } from '../entities/fx';
import { type AbilityDef, aimDirection } from './types';

const LEAP_TIME = 0.28;

/** Rana: a long leap that leaves a sticky slime pool where she lands. */
export const frogLeap: AbilityDef = {
  id: 'frog_leap',
  name: 'Frog Leap',
  icon: 'droplet',
  cooldown: 10,
  blurb:
    'Leap towards the cursor, untouchable in the air, and leave a slowing poison pool on landing.',
  cast(run, aim) {
    const p = run.player;
    const dir = aimDirection(run, aim);
    run.dash = { dx: dir.x, dy: dir.y, t: LEAP_TIME };
    p.iframes = Math.max(p.iframes, LEAP_TIME + 0.1);
    run.fx.push(makeFx('ring', p.x, p.y, 0.3, { r: 14, color: '#7dff9a' }));
    run.emit('swing');
    const power = run.mods.abilityPower;
    run.later(LEAP_TIME, () => {
      const q = run.player;
      run.fx.push(makeFx('ring', q.x, q.y, 0.4, { r: 40, color: '#7dff9a' }));
      run.zones.push({
        x: q.x,
        y: q.y,
        r: 40 * run.mods.area,
        t: 0,
        dur: 4.5 * run.mods.duration,
        dps: 6 * run.mods.dmg * power,
        tick: 0,
        kind: 'poison',
        slowF: 0.55,
        friendly: true,
      });
      run.shake = Math.max(run.shake, 2);
      run.emit('hiss');
    });
    return true;
  },
};
