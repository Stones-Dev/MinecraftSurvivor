/** Enemy definitions (Phase 2: zombie, skeleton, spider, creeper, slime). Speeds are art px/s. */
export type Archetype = 'chaser' | 'kiter' | 'leaper' | 'kamikaze';

export interface EnemyDef {
  id: string;
  /** Atlas animation prefix, e.g. `mob.zombie` -> `mob.zombie.walk`. */
  sprite: string;
  name: string;
  hp: number;
  /** Contact damage (zombie, spider, slime), arrow damage (skeleton) or blast damage (creeper). */
  dmg: number;
  speed: number;
  radius: number;
  xp: number;
  archetype: Archetype;
  /** First minute this enemy can appear. */
  fromMinute: number;
  /** Relative spawn weight. */
  weight: number;
  /** Slimes: what the corpse splits into (two of them). */
  splitInto?: string;
  /** Whether the sprite has a walk animation (slimes only idle). */
  walkAnim: boolean;
}

export const ENEMIES: Record<string, EnemyDef> = {
  zombie: {
    id: 'zombie',
    sprite: 'mob.zombie',
    name: 'Zombie',
    hp: 20,
    dmg: 8,
    speed: 28,
    radius: 6,
    xp: 1,
    archetype: 'chaser',
    fromMinute: 0,
    weight: 10,
    walkAnim: true,
  },
  skeleton: {
    id: 'skeleton',
    sprite: 'mob.skeleton',
    name: 'Skeleton',
    hp: 14,
    dmg: 7,
    speed: 26,
    radius: 5,
    xp: 2,
    archetype: 'kiter',
    fromMinute: 1,
    weight: 5,
    walkAnim: true,
  },
  spider: {
    id: 'spider',
    sprite: 'mob.spider',
    name: 'Spider',
    hp: 10,
    dmg: 6,
    speed: 48,
    radius: 6,
    xp: 2,
    archetype: 'leaper',
    fromMinute: 1,
    weight: 5,
    walkAnim: true,
  },
  creeper: {
    id: 'creeper',
    sprite: 'mob.creeper',
    name: 'Creeper',
    hp: 18,
    dmg: 40,
    speed: 34,
    radius: 6,
    xp: 3,
    archetype: 'kamikaze',
    fromMinute: 2,
    weight: 4,
    walkAnim: true,
  },
  slime_big: {
    id: 'slime_big',
    sprite: 'mob.slime_big',
    name: 'Slime',
    hp: 24,
    dmg: 5,
    speed: 22,
    radius: 8,
    xp: 3,
    archetype: 'chaser',
    fromMinute: 2,
    weight: 4,
    splitInto: 'slime_medium',
    walkAnim: false,
  },
  slime_medium: {
    id: 'slime_medium',
    sprite: 'mob.slime_medium',
    name: 'Slime',
    hp: 12,
    dmg: 4,
    speed: 26,
    radius: 6,
    xp: 2,
    archetype: 'chaser',
    fromMinute: 99,
    weight: 0,
    splitInto: 'slime_small',
    walkAnim: false,
  },
  slime_small: {
    id: 'slime_small',
    sprite: 'mob.slime_small',
    name: 'Slime',
    hp: 6,
    dmg: 3,
    speed: 30,
    radius: 4,
    xp: 1,
    archetype: 'chaser',
    fromMinute: 99,
    weight: 0,
    walkAnim: false,
  },
};

/** Damage/HP growth curves from BRIEF section 15. */
export function hpScale(minute: number): number {
  return 1 + 0.12 * minute;
}

export function dmgScale(minute: number): number {
  return 1 + 0.06 * minute;
}
