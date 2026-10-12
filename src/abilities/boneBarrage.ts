import { Projectile } from '../entities/projectile';
import { makeFx } from '../entities/fx';
import type { RunState } from '../game';
import type { AbilityDef } from './types';

const PER_WAVE = 8;
const SPEED = 240;

function volley(run: RunState, offset: number, dmg: number): void {
  const p = run.player;
  const n = PER_WAVE + run.mods.projCount;
  const sp = SPEED * run.mods.projSpeed;
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * Math.PI * 2;
    const pr = new Projectile(
      p.x,
      p.y - 8,
      Math.cos(a) * sp,
      Math.sin(a) * sp,
      3,
      dmg,
      2 + run.mods.pierce,
      true,
      0.9,
    );
    pr.style = 'arrow';
    pr.knock = 60;
    run.projectiles.push(pr);
  }
  run.emit('bow');
}

/** Skeleton: two rings of piercing bone arrows in every direction. */
export const boneBarrage: AbilityDef = {
  id: 'bone_barrage',
  name: 'Bone Barrage',
  icon: 'skull',
  cooldown: 12,
  blurb: 'Loose two rings of piercing arrows in every direction around you.',
  cast(run) {
    const p = run.player;
    const dmg = 11 * run.mods.dmg * run.mods.projDmg * run.mods.abilityPower;
    volley(run, 0, dmg);
    run.later(0.15, () => volley(run, Math.PI / (PER_WAVE + run.mods.projCount), dmg));
    run.fx.push(makeFx('ring', p.x, p.y - 8, 0.3, { r: 22, color: '#e8e0c0' }));
    return true;
  },
};
