import { areaOf, countOf, damageOf, nearestEnemy } from './helpers';
import type { WeaponDef } from './types';

export const tnt: WeaponDef = {
  id: 'tnt',
  name: 'TNT',
  icon: 'tnt',
  levels: [
    { dmg: 30, cd: 4.0, area: 40, count: 1, pierce: 0, blurb: 'Drops a mine with a 1 s fuse.' },
    { dmg: 36, cd: 3.7, area: 44, count: 1, pierce: 0, blurb: '+6 damage, bigger blast.' },
    { dmg: 44, cd: 3.4, area: 48, count: 1, pierce: 0, blurb: '+8 damage, bigger blast.' },
    { dmg: 52, cd: 3.1, area: 52, count: 2, pierce: 0, blurb: 'Drops two mines.' },
    { dmg: 64, cd: 2.8, area: 60, count: 2, pierce: 0, blurb: 'Two huge mines, rapid.' },
  ],
  evolution: {
    id: 'creeper_cluster',
    name: 'Creeper Cluster',
    needs: 'quick_charge',
    blurb: 'Drops three mines that chain-detonate.',
    icon: 'tnt',
  },
  fire(run, w, s) {
    if (!nearestEnemy(run, 150)) return false;
    const p = run.player;
    run.emit('tnt');
    const count = Math.max(countOf(run, s), w.evolved ? 3 : 1);
    for (let i = 0; i < count; i++) {
      run.mines.push({
        x: p.x + (i === 0 ? 0 : run.rng.ai.range(-18, 18)),
        y: p.y + (i === 0 ? 4 : run.rng.ai.range(-8, 14)),
        fuse: 1.0,
        area: areaOf(run, s) * (w.evolved ? 1.15 : 1),
        dmg: damageOf(run, s),
      });
    }
    return true;
  },
};
