import type { IconName } from '../ui/icons';

export type WeaponId = 'sword' | 'bow' | 'tnt';

export interface WeaponLevel {
  dmg: number;
  /** Seconds between uses. */
  cd: number;
  /** Arc radius (sword) or blast radius (tnt), art px. */
  area: number;
  /** Arrows per volley / mines per drop. */
  count: number;
  pierce: number;
  blurb: string;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  icon: IconName;
  levels: readonly WeaponLevel[];
}

export const MAX_WEAPON_LEVEL = 5;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sword: {
    id: 'sword',
    name: 'Sword',
    icon: 'sword',
    levels: [
      { dmg: 10, cd: 1.0, area: 34, count: 1, pierce: 99, blurb: 'Sweeps an arc in front of you.' },
      { dmg: 12, cd: 0.92, area: 37, count: 1, pierce: 99, blurb: '+2 damage, wider arc.' },
      { dmg: 15, cd: 0.85, area: 40, count: 1, pierce: 99, blurb: '+3 damage, faster swings.' },
      { dmg: 18, cd: 0.78, area: 44, count: 1, pierce: 99, blurb: '+3 damage, wider arc.' },
      { dmg: 22, cd: 0.7, area: 50, count: 1, pierce: 99, blurb: '+4 damage, much faster.' },
    ],
  },
  bow: {
    id: 'bow',
    name: 'Bow',
    icon: 'bow',
    levels: [
      { dmg: 8, cd: 1.3, area: 0, count: 1, pierce: 0, blurb: 'Shoots the nearest enemy.' },
      { dmg: 9, cd: 1.2, area: 0, count: 1, pierce: 0, blurb: '+1 damage, faster.' },
      { dmg: 11, cd: 1.1, area: 0, count: 2, pierce: 0, blurb: 'Two arrows per volley.' },
      { dmg: 13, cd: 1.0, area: 0, count: 2, pierce: 1, blurb: 'Arrows pierce one enemy.' },
      { dmg: 16, cd: 0.9, area: 0, count: 3, pierce: 2, blurb: 'Three piercing arrows.' },
    ],
  },
  tnt: {
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
  },
};

export function weaponLevel(id: WeaponId, level: number): WeaponLevel {
  const levels = WEAPONS[id].levels;
  const l = levels[Math.max(0, Math.min(levels.length - 1, level - 1))];
  if (!l) throw new Error(`No stats for ${id} level ${level}`);
  return l;
}
