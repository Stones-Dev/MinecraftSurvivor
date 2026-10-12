import { makeFx } from '../entities/fx';
import { spawnDecoy } from './decoys';
import type { AbilityDef } from './types';

const IMAGES = 3;
const SPREAD = 46;

/** Illusioner: three mirror images that pull nearby chasers away and burst when they fade. */
export const mirrorImages: AbilityDef = {
  id: 'mirror_images',
  name: 'Mirror Images',
  icon: 'eye',
  cooldown: 18,
  blurb:
    'Summon 3 decoys for 6 s. Nearby enemies chase the decoys instead of you; they burst when they fade.',
  cast(run) {
    const p = run.player;
    const dur = 6 * run.mods.duration;
    const pop = 14 * run.mods.dmg * run.mods.abilityPower;
    const a0 = run.rng.events.range(0, Math.PI * 2);
    for (let i = 0; i < IMAGES; i++) {
      const a = a0 + (i / IMAGES) * Math.PI * 2;
      spawnDecoy(run, p.x + Math.cos(a) * SPREAD, p.y + Math.sin(a) * SPREAD * 0.75, dur, 150, pop);
    }
    p.iframes = Math.max(p.iframes, 0.3);
    run.fx.push(makeFx('ring', p.x, p.y - 10, 0.4, { r: SPREAD, color: '#9a7bff' }));
    run.fx.push(
      makeFx('text', p.x, p.y - 34, 1, { text: 'Mirror Images', vy: -14, color: '#c9b8ff' }),
    );
    run.emit('portal');
    return true;
  },
};
