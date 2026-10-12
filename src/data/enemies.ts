/** Enemy definitions. Behaviour is data-driven: an archetype plus optional parameter blocks. Speeds are art px/s. */
import type { ProjStyle } from '../entities/projectile';

export type Archetype =
  | 'chaser'
  | 'kiter'
  | 'leaper'
  | 'kamikaze'
  | 'charger'
  | 'summoner'
  | 'healer'
  | 'teleporter'
  | 'diver'
  | 'turret'
  | 'boss';

export interface ShotDef {
  style: ProjStyle;
  speed: number;
  /** Damage as a multiple of the enemy's scaled damage. */
  dmgMult: number;
  /** Attack range (also the preferred kiting distance). */
  range: number;
  count: number;
  /** Total fan width in radians when count > 1. */
  spread: number;
  /** Seconds between shots (min, max). */
  cd: readonly [number, number];
  /** Aim time with a ground telegraph before the shot (>= 0.6 s per BRIEF section 9). */
  windup: number;
  life: number;
  /** Slow the hero for this many seconds on hit (stray, shulker). */
  slow?: number;
  /** Explosion radius on impact (ghast). */
  blast?: number;
  /** Homing turn rate in rad/s (shulker, wither blue skull). */
  homing?: number;
  /** Lobbed shot that leaves a hostile pool (witch). */
  pool?: { kind: 'poison' | 'burn' | 'wither' | 'frost'; r: number; dur: number; slowF: number };
}

export interface EnemyDef {
  id: string;
  /** Atlas animation prefix, e.g. `mob.zombie` -> `mob.zombie.walk`. */
  sprite: string;
  name: string;
  hp: number;
  /** Contact damage, projectile base damage, or blast damage (creeper). */
  dmg: number;
  speed: number;
  radius: number;
  xp: number;
  archetype: Archetype;
  /** First minute this enemy can appear. */
  fromMinute: number;
  /** Relative spawn weight (0 = never spawned directly). */
  weight: number;
  /** The sprite faces LEFT by default (most mob sheets from the author face right), so the flip is inverted. */
  faceLeft?: boolean;
  /** Slimes: what the corpse splits into (two of them). */
  splitInto?: string;
  /** Whether the sprite has a walk animation. */
  walkAnim: boolean;
  /** Sprite height in px (status icons and health bars sit above it); default 28. */
  height?: number;
  /** Animation suffix overrides: idle, walk, aim, windup, dash, cast. */
  anims?: Partial<Record<'idle' | 'walk' | 'aim' | 'windup' | 'dash' | 'cast', string>>;
  shot?: ShotDef;
  /** Status applied to the hero on contact hits. */
  contactStatus?: { kind: 'poison' | 'wither' | 'hunger'; dur: number; dps: number };
  flying?: boolean;
  nightOnly?: boolean;
  /** Only spawns in these biomes (ids from world/biomes). */
  biomes?: readonly string[];
  /** Only spawns when water is near the hero (drowned, guardian). */
  nearWater?: boolean;
  /** Spawns this many at once (silverfish swarms). */
  pack?: number;
  /** Charger parameters: telegraphed dash. */
  charge?: { range: number; windup: number; dash: number; speed: number; rest: number };
  summon?: { id: string; count: number; max: number; cd: number };
  /** Healer: pulse heals allies and throws pools. */
  heal?: { pct: number; radius: number; cd: number };
  /** Teleporter: blink next to the hero after a telegraph. */
  blink?: { cd: readonly [number, number]; windup: number };
  /** Starts with a shield worth this fraction of max HP (vindicator). */
  shieldPct?: number;
  /** Leaves burning ground behind (magma cube). */
  trail?: boolean;
  /** Zombified piglins: when one is hurt, nearby ones speed up. */
  packAggro?: boolean;
  /** Draw scale (bosses and mini-bosses are bigger). */
  scale?: number;
  /** Scripted boss pattern (systems/bossAI.ts). */
  boss?: 'captain' | 'wither' | 'warden';
  /** Mini-boss: scheduled by the director, never spawned by the trickle. */
  mini?: boolean;
}

const E: Record<string, EnemyDef> = {};
function add(def: EnemyDef): void {
  E[def.id] = def;
}

const base = { fromMinute: 0, weight: 0, walkAnim: true } as const;

add({
  ...base,
  id: 'zombie',
  sprite: 'mob.zombie',
  name: 'Zombie',
  hp: 20,
  dmg: 8,
  speed: 28,
  radius: 6,
  xp: 1,
  archetype: 'chaser',
  weight: 10,
});
add({
  ...base,
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
  shot: {
    style: 'arrow',
    speed: 130,
    dmgMult: 1,
    range: 100,
    count: 1,
    spread: 0,
    cd: [1.8, 2.6],
    windup: 0.7,
    life: 1.8,
  },
});
add({
  ...base,
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
  height: 18,
});
add({
  ...base,
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
});
add({
  ...base,
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
  height: 20,
});
add({
  ...base,
  id: 'slime_medium',
  sprite: 'mob.slime_medium',
  name: 'Slime',
  hp: 12,
  dmg: 4,
  speed: 26,
  radius: 6,
  xp: 2,
  archetype: 'chaser',
  splitInto: 'slime_small',
  walkAnim: false,
  height: 14,
});
add({
  ...base,
  id: 'slime_small',
  sprite: 'mob.slime_small',
  name: 'Slime',
  hp: 6,
  dmg: 3,
  speed: 30,
  radius: 4,
  xp: 1,
  archetype: 'chaser',
  walkAnim: false,
  height: 10,
});
add({
  ...base,
  id: 'cave_spider',
  sprite: 'mob.cave_spider',
  name: 'Cave Spider',
  hp: 8,
  dmg: 4,
  speed: 56,
  radius: 4,
  xp: 2,
  archetype: 'chaser',
  fromMinute: 3,
  weight: 4,
  height: 12,
  contactStatus: { kind: 'poison', dur: 4, dps: 2 },
});
add({
  ...base,
  id: 'husk',
  sprite: 'mob.husk',
  name: 'Husk',
  hp: 26,
  dmg: 9,
  speed: 28,
  radius: 6,
  xp: 2,
  archetype: 'chaser',
  weight: 8,
  biomes: ['desert'],
  contactStatus: { kind: 'hunger', dur: 6, dps: 0 },
});
add({
  ...base,
  id: 'stray',
  sprite: 'mob.stray',
  name: 'Stray',
  hp: 16,
  dmg: 6,
  speed: 26,
  radius: 5,
  xp: 2,
  archetype: 'kiter',
  weight: 7,
  biomes: ['snowy_taiga'],
  shot: {
    style: 'arrow',
    speed: 125,
    dmgMult: 1,
    range: 100,
    count: 1,
    spread: 0,
    cd: [1.8, 2.6],
    windup: 0.7,
    life: 1.8,
    slow: 2.5,
  },
});
add({
  ...base,
  id: 'drowned',
  sprite: 'mob.drowned',
  name: 'Drowned',
  hp: 22,
  dmg: 10,
  speed: 30,
  radius: 6,
  xp: 3,
  archetype: 'kiter',
  fromMinute: 4,
  weight: 6,
  nearWater: true,
  walkAnim: false,
  anims: { aim: 'throw' },
  shot: {
    style: 'trident',
    speed: 150,
    dmgMult: 1,
    range: 120,
    count: 1,
    spread: 0,
    cd: [2.2, 3.2],
    windup: 0.7,
    life: 1.6,
  },
});
add({
  ...base,
  id: 'enderman',
  sprite: 'mob.enderman',
  name: 'Enderman',
  hp: 40,
  dmg: 16,
  speed: 36,
  radius: 6,
  xp: 5,
  archetype: 'teleporter',
  fromMinute: 4,
  weight: 3,
  height: 40,
  blink: { cd: [3.5, 5], windup: 0.7 },
});
add({
  ...base,
  id: 'witch',
  sprite: 'mob.witch',
  name: 'Witch',
  hp: 28,
  dmg: 6,
  speed: 24,
  radius: 5,
  xp: 4,
  archetype: 'healer',
  fromMinute: 4,
  weight: 3,
  anims: { aim: 'throw' },
  heal: { pct: 0.07, radius: 150, cd: 4 },
  shot: {
    style: 'potion_poison',
    speed: 0,
    dmgMult: 0.8,
    range: 110,
    count: 1,
    spread: 0,
    cd: [4, 5.5],
    windup: 0.8,
    life: 1,
    pool: { kind: 'poison', r: 20, dur: 4, slowF: 0.7 },
  },
});
add({
  ...base,
  id: 'silverfish',
  sprite: 'mob.silverfish',
  name: 'Silverfish',
  hp: 6,
  dmg: 3,
  speed: 62,
  radius: 3,
  xp: 1,
  archetype: 'chaser',
  fromMinute: 5,
  weight: 4,
  pack: 4,
  height: 8,
});
add({
  ...base,
  id: 'endermite',
  sprite: 'mob.endermite',
  name: 'Endermite',
  hp: 7,
  dmg: 3,
  speed: 58,
  radius: 3,
  xp: 1,
  archetype: 'chaser',
  fromMinute: 5,
  weight: 3,
  pack: 3,
  height: 8,
});
add({
  ...base,
  id: 'phantom',
  sprite: 'mob.phantom',
  name: 'Phantom',
  hp: 18,
  dmg: 9,
  speed: 52,
  radius: 6,
  xp: 3,
  archetype: 'diver',
  fromMinute: 2,
  weight: 5,
  flying: true,
  nightOnly: true,
  walkAnim: false,
  height: 16,
});
add({
  ...base,
  id: 'pillager',
  sprite: 'mob.pillager',
  name: 'Pillager',
  hp: 24,
  dmg: 7,
  speed: 26,
  radius: 5,
  xp: 4,
  archetype: 'kiter',
  fromMinute: 6,
  weight: 5,
  anims: { aim: 'firing' },
  shot: {
    style: 'bolt',
    speed: 150,
    dmgMult: 1,
    range: 130,
    count: 3,
    spread: 0.3,
    cd: [2.6, 3.4],
    windup: 0.8,
    life: 1.7,
  },
});
add({
  ...base,
  id: 'vindicator',
  sprite: 'mob.vindicator',
  name: 'Vindicator',
  hp: 40,
  dmg: 16,
  speed: 30,
  radius: 6,
  xp: 5,
  archetype: 'chaser',
  fromMinute: 6,
  weight: 5,
  shieldPct: 0.3,
});
add({
  ...base,
  id: 'evoker',
  sprite: 'mob.evoker',
  name: 'Evoker',
  hp: 36,
  dmg: 10,
  speed: 22,
  radius: 5,
  xp: 6,
  archetype: 'summoner',
  fromMinute: 8,
  weight: 3,
  anims: { cast: 'magic' },
  summon: { id: 'vex', count: 2, max: 4, cd: 8 },
  shot: {
    style: 'bolt',
    speed: 0,
    dmgMult: 1.2,
    range: 110,
    count: 1,
    spread: 0,
    cd: [4, 5],
    windup: 0.9,
    life: 1,
  },
});
add({
  ...base,
  id: 'vex',
  sprite: 'mob.vex',
  name: 'Vex',
  hp: 8,
  dmg: 8,
  speed: 62,
  radius: 4,
  xp: 2,
  archetype: 'chaser',
  fromMinute: 8,
  weight: 2,
  flying: true,
  walkAnim: false,
  height: 14,
  anims: { idle: 'summon' },
});
add({
  ...base,
  id: 'blaze',
  sprite: 'mob.blaze',
  name: 'Blaze',
  hp: 30,
  dmg: 8,
  speed: 28,
  radius: 5,
  xp: 5,
  archetype: 'kiter',
  fromMinute: 9,
  weight: 4,
  flying: true,
  walkAnim: false,
  anims: { aim: 'firing' },
  shot: {
    style: 'fireball',
    speed: 100,
    dmgMult: 1,
    range: 140,
    count: 3,
    spread: 0.45,
    cd: [2.8, 3.6],
    windup: 0.8,
    life: 2,
  },
});
add({
  ...base,
  id: 'magma_cube_medium',
  sprite: 'mob.magma_cube_medium',
  name: 'Magma Cube',
  hp: 28,
  dmg: 8,
  speed: 24,
  radius: 7,
  xp: 4,
  archetype: 'chaser',
  fromMinute: 9,
  weight: 4,
  splitInto: 'magma_cube_small',
  walkAnim: false,
  trail: true,
  height: 16,
});
add({
  ...base,
  id: 'magma_cube_small',
  sprite: 'mob.magma_cube_small',
  name: 'Magma Cube',
  hp: 12,
  dmg: 5,
  speed: 30,
  radius: 5,
  xp: 2,
  archetype: 'chaser',
  walkAnim: false,
  trail: true,
  height: 10,
});
add({
  ...base,
  id: 'piglin',
  sprite: 'mob.piglin',
  name: 'Piglin',
  hp: 34,
  dmg: 12,
  speed: 32,
  radius: 6,
  xp: 4,
  archetype: 'chaser',
  fromMinute: 10,
  weight: 4,
});
add({
  ...base,
  id: 'zombie_piglin',
  sprite: 'mob.zombie_piglin',
  name: 'Zombified Piglin',
  hp: 30,
  dmg: 11,
  speed: 28,
  radius: 6,
  xp: 4,
  archetype: 'chaser',
  fromMinute: 10,
  weight: 4,
  packAggro: true,
});
add({
  ...base,
  id: 'hoglin',
  sprite: 'mob.hoglin',
  name: 'Hoglin',
  hp: 55,
  dmg: 18,
  speed: 30,
  radius: 8,
  xp: 6,
  archetype: 'charger',
  fromMinute: 10,
  weight: 3,
  height: 24,
  anims: { windup: 'idle', dash: 'ram' },
  charge: { range: 160, windup: 0.7, dash: 0.5, speed: 3.6, rest: 1.4 },
});
add({
  ...base,
  id: 'wither_skeleton',
  sprite: 'mob.wither_skeleton',
  name: 'Wither Skeleton',
  hp: 40,
  dmg: 14,
  speed: 30,
  radius: 6,
  xp: 6,
  archetype: 'chaser',
  fromMinute: 10,
  weight: 4,
  height: 34,
  contactStatus: { kind: 'wither', dur: 3, dps: 3 },
});
add({
  ...base,
  id: 'ghast',
  sprite: 'mob.ghast',
  name: 'Ghast',
  hp: 60,
  dmg: 22,
  speed: 14,
  radius: 9,
  xp: 9,
  archetype: 'kiter',
  fromMinute: 12,
  weight: 2,
  flying: true,
  walkAnim: false,
  height: 30,
  anims: { idle: 'firing', aim: 'firing' },
  shot: {
    style: 'fireball',
    speed: 70,
    dmgMult: 1,
    range: 220,
    count: 1,
    spread: 0,
    cd: [4, 5.5],
    windup: 1.0,
    life: 4,
    blast: 26,
  },
});
add({
  ...base,
  id: 'guardian',
  sprite: 'mob.guardian',
  name: 'Guardian',
  hp: 40,
  dmg: 12,
  speed: 26,
  radius: 8,
  xp: 6,
  archetype: 'turret',
  fromMinute: 12,
  weight: 3,
  nearWater: true,
  flying: true,
  walkAnim: false,
  height: 22,
  anims: { aim: 'firing' },
  shot: {
    style: 'bubble',
    speed: 0,
    dmgMult: 1,
    range: 150,
    count: 1,
    spread: 0,
    cd: [3, 4],
    windup: 1.2,
    life: 1,
  },
});
add({
  ...base,
  id: 'shulker',
  sprite: 'mob.shulker',
  name: 'Shulker',
  hp: 50,
  dmg: 9,
  speed: 0,
  radius: 7,
  xp: 7,
  archetype: 'turret',
  fromMinute: 13,
  weight: 2,
  walkAnim: false,
  height: 20,
  anims: { aim: 'firing' },
  shot: {
    style: 'skull_blue',
    speed: 70,
    dmgMult: 1,
    range: 190,
    count: 1,
    spread: 0,
    cd: [3, 4],
    windup: 0.7,
    life: 4,
    slow: 2.5,
    homing: 2.4,
  },
});

// Bosses (5:00 Raid Captain, 10:00 Wither, 15:00 Warden) and mini-bosses (BRIEF section 7).
add({
  ...base,
  id: 'raid_captain',
  sprite: 'mob.pillager_captain',
  name: 'Raid Captain',
  hp: 520,
  dmg: 20,
  speed: 34,
  radius: 9,
  xp: 60,
  archetype: 'boss',
  boss: 'captain',
  scale: 1.7,
  height: 30,
});
add({
  ...base,
  id: 'wither',
  sprite: 'mob.wither',
  name: 'Wither',
  hp: 1200,
  dmg: 16,
  speed: 30,
  radius: 12,
  xp: 150,
  archetype: 'boss',
  boss: 'wither',
  flying: true,
  scale: 1.6,
  walkAnim: false,
  height: 40,
  anims: { idle: 'firing', aim: 'firing' },
});
add({
  ...base,
  id: 'warden',
  sprite: 'mob.warden',
  name: 'Warden',
  hp: 2800,
  dmg: 40,
  speed: 26,
  radius: 13,
  xp: 400,
  archetype: 'boss',
  boss: 'warden',
  scale: 1.7,
  height: 36,
});
add({
  ...base,
  id: 'vindicator_captain',
  sprite: 'mob.vindicator_armor_diamond',
  name: 'Vindicator Captain',
  hp: 240,
  dmg: 26,
  speed: 36,
  radius: 7,
  xp: 30,
  archetype: 'chaser',
  mini: true,
  shieldPct: 0.5,
  scale: 1.35,
  height: 36,
});
add({
  ...base,
  id: 'piglin_brute',
  sprite: 'mob.piglin_brute',
  name: 'Piglin Brute',
  hp: 300,
  dmg: 26,
  speed: 34,
  radius: 8,
  xp: 30,
  archetype: 'charger',
  mini: true,
  scale: 1.35,
  height: 36,
  anims: { windup: 'idle', dash: 'attack' },
  charge: { range: 170, windup: 0.7, dash: 0.5, speed: 3.4, rest: 1.2 },
});
add({
  ...base,
  id: 'elder_guardian',
  sprite: 'mob.guardian',
  name: 'Elder Guardian',
  hp: 340,
  dmg: 20,
  speed: 22,
  radius: 11,
  xp: 30,
  archetype: 'turret',
  mini: true,
  flying: true,
  walkAnim: false,
  scale: 1.8,
  height: 36,
  anims: { aim: 'firing' },
  shot: {
    style: 'bubble',
    speed: 0,
    dmgMult: 1,
    range: 170,
    count: 1,
    spread: 0,
    cd: [2.4, 3.2],
    windup: 1.2,
    life: 1,
  },
});
add({
  ...base,
  id: 'charged_creeper',
  sprite: 'mob.charged_creeper',
  name: 'Charged Creeper',
  hp: 160,
  dmg: 80,
  speed: 38,
  radius: 8,
  xp: 30,
  archetype: 'kamikaze',
  mini: true,
  scale: 1.4,
  height: 36,
});

export const MINI_BOSSES = [
  'vindicator_captain',
  'piglin_brute',
  'elder_guardian',
  'charged_creeper',
] as const;

export const ENEMIES: Record<string, EnemyDef> = E;

/** Sprites drawn facing left in the source sheets (checked on a contact sheet of every shipped mob). */
const FACES_LEFT = [
  'husk',
  'spider',
  'cave_spider',
  'hoglin',
  'zoglin',
  'pillager',
  'pillager_captain',
  'skeleton',
  'stray',
  'wither_skeleton',
  'silverfish',
  'piglin',
  'zombie_piglin',
  'piglin_brute',
  'raid_captain',
];
for (const id of FACES_LEFT) {
  const def = ENEMIES[id];
  if (def) def.faceLeft = true;
}

/** Damage/HP growth curves from BRIEF section 15. */
export function hpScale(minute: number): number {
  return 1 + 0.12 * minute;
}

export function dmgScale(minute: number): number {
  return 1 + 0.06 * minute;
}
