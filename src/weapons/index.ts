/** Weapon registry: every weapon is a self-contained module exporting a WeaponDef. */
import { axe } from './axe';
import { blaze_rods } from './blaze_rods';
import { bow } from './bow';
import { crossbow } from './crossbow';
import { fishing_rod } from './fishing_rod';
import { harming } from './harming';
import { lava_bucket } from './lava_bucket';
import { lightning_rod } from './lightning_rod';
import { poison } from './poison';
import { shield } from './shield';
import { snowball } from './snowball';
import { sword } from './sword';
import { tnt } from './tnt';
import { trident } from './trident';
import {
  MAX_WEAPON_LEVEL,
  type WeaponDef,
  type WeaponId,
  type WeaponLevel,
  type WeaponState,
} from './types';

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sword,
  bow,
  crossbow,
  trident,
  harming,
  poison,
  tnt,
  snowball,
  fishing_rod,
  lava_bucket,
  blaze_rods,
  axe,
  shield,
  lightning_rod,
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
export { MAX_WEAPON_LEVEL };

export function weaponLevel(id: WeaponId, level: number): WeaponLevel {
  const levels = WEAPONS[id].levels;
  const l = levels[Math.max(0, Math.min(levels.length - 1, level - 1))];
  if (!l) throw new Error(`No stats for ${id} level ${level}`);
  return l;
}

export function newWeapon(id: WeaponId): WeaponState {
  return { id, level: 1, cd: 0.3, evolved: false, data: {} };
}
