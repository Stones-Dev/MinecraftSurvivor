import type { RunState } from '../game';
import { areaOf, damageOf } from './helpers';
import type { WeaponDef, WeaponLevel, WeaponState } from './types';

/** Distance walked before the next burning patch is dropped, px. */
const DROP_STEP = 10;
/** Stop dropping patches while this many zones exist (keeps the zone list small). */
const ZONE_CAP = 120;
/** Patch duration per weapon level, seconds (before the Infinity multiplier). */
const PATCH_DUR = [2.5, 2.9, 3.2, 3.6, 4];

function levelIndex(w: WeaponState): number {
  return Math.min(PATCH_DUR.length - 1, Math.max(0, w.level - 1));
}

export const lava_bucket: WeaponDef = {
  id: 'lava_bucket',
  name: 'Lava Bucket',
  icon: 'lava_bucket',
  levels: [
    {
      dmg: 6,
      cd: 2.0,
      area: 10,
      count: 1,
      pierce: 0,
      blurb: 'Leaves a burning trail where you walk.',
    },
    { dmg: 8, cd: 2.0, area: 12, count: 1, pierce: 0, blurb: '+2 damage, wider trail.' },
    { dmg: 11, cd: 2.0, area: 13, count: 1, pierce: 0, blurb: '+3 damage, trail lasts longer.' },
    {
      dmg: 14,
      cd: 2.0,
      area: 15,
      count: 1,
      pierce: 0,
      blurb: '+3 damage, wider and longer trail.',
    },
    {
      dmg: 18,
      cd: 2.0,
      area: 16,
      count: 1,
      pierce: 0,
      blurb: '+4 damage, the widest, longest trail.',
    },
  ],
  evolution: {
    id: 'magma_trail',
    name: 'Magma Trail',
    needs: 'fire_aspect',
    blurb: 'Wider, longer-lasting fire trail.',
    icon: 'lava_bucket',
  },
  /** The trail is the weapon: nothing to fire, so it never starts a cooldown. */
  fire(): boolean {
    return false;
  },
  /** Drop a burning patch every DROP_STEP px of walking. */
  tick(run: RunState, w: WeaponState, s: WeaponLevel): void {
    const p = run.player;
    const lx = w.data.lx;
    const ly = w.data.ly;
    if (lx === undefined || ly === undefined) {
      w.data.lx = p.x;
      w.data.ly = p.y;
      return;
    }
    if (run.zones.length > ZONE_CAP) return;
    if (Math.hypot(p.x - lx, p.y - ly) < DROP_STEP) return;
    run.zones.push({
      x: p.x,
      y: p.y,
      r: areaOf(run, s) * (w.evolved ? 1.5 : 1),
      t: 0,
      dur: (PATCH_DUR[levelIndex(w)] ?? 2.5) * run.mods.duration * (w.evolved ? 1.6 : 1),
      dps: damageOf(run, s),
      tick: 0,
      kind: 'burn',
      slowF: 1,
      friendly: true,
    });
    w.data.lx = p.x;
    w.data.ly = p.y;
  },
};
