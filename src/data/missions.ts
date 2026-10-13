/**
 * Mission templates. A run is reduced to a flat sample of metrics (see `runSample` in
 * systems/missions.ts); a template reads one metric, either summed over the runs of the period
 * (`sum`: "slay 150 mobs") or as the best single run (`best`: "survive 8:00 in one run").
 */
import type { IconName } from '../ui/icons';

export interface MissionReward {
  emeralds?: number;
  spawnEggs?: number;
  rareSpawnEggs?: number;
}

export type MissionKind = 'daily' | 'weekly';

export interface MissionDef {
  id: string;
  kind: MissionKind;
  /** Key into the run sample (`kills`, `timeSec`, `sec.desert`, `kills.undead`, ...) or a meta metric. */
  metric: string;
  mode: 'sum' | 'best';
  target: number;
  /** Shown in the list; the target is part of the sentence. */
  text: string;
  icon: IconName;
  reward: MissionReward;
  /** Only runs played with one of these heroes count; the template is only rolled for players who own one. */
  heroes?: readonly string[];
}

/** Hero groups used by the class missions (the ids are checked against the roster in the tests). */
export const HERO_CLASSES = {
  ranged: ['alex', 'skeleton', 'witch', 'illusioner'],
  melee: ['steve', 'village_smith', 'piglin', 'creeper', 'enderman'],
} as const;

/** Enemy groups for "defeat N undead / arthropods / nether mobs" missions. */
export const ENEMY_GROUPS: Record<string, readonly string[]> = {
  undead: [
    'zombie',
    'skeleton',
    'husk',
    'stray',
    'drowned',
    'wither_skeleton',
    'zombie_piglin',
    'phantom',
  ],
  arthropod: ['spider', 'cave_spider', 'silverfish', 'endermite'],
  nether: [
    'blaze',
    'magma_cube_big',
    'magma_cube_medium',
    'magma_cube_small',
    'piglin',
    'zombie_piglin',
    'hoglin',
    'wither_skeleton',
    'ghast',
  ],
  illager: ['pillager', 'vindicator', 'evoker', 'vex'],
};

const D = (
  id: string,
  metric: string,
  mode: 'sum' | 'best',
  target: number,
  text: string,
  icon: IconName,
  reward: MissionReward,
  heroes?: readonly string[],
): MissionDef => ({ id, kind: 'daily', metric, mode, target, text, icon, reward, heroes });

const W = (
  id: string,
  metric: string,
  mode: 'sum' | 'best',
  target: number,
  text: string,
  icon: IconName,
  reward: MissionReward,
): MissionDef => ({ id, kind: 'weekly', metric, mode, target, text, icon, reward });

export const DAILY_MISSIONS: readonly MissionDef[] = [
  D('d_kills_150', 'kills', 'sum', 150, 'Slay 150 mobs', 'sword', { emeralds: 40 }),
  D('d_kills_400', 'kills', 'sum', 400, 'Slay 400 mobs', 'skull', { emeralds: 80 }),
  D('d_survive_4', 'timeSec', 'best', 240, 'Survive 4:00 in one run', 'clock', { emeralds: 40 }),
  D('d_survive_8', 'timeSec', 'best', 480, 'Survive 8:00 in one run', 'clock', {
    emeralds: 90,
  }),
  D('d_emeralds_60', 'emeraldsPicked', 'sum', 60, 'Collect 60 emeralds', 'emerald', {
    emeralds: 40,
  }),
  D('d_emeralds_200', 'emeraldsPicked', 'sum', 200, 'Collect 200 emeralds', 'chest', {
    emeralds: 80,
  }),
  D('d_mini', 'minis', 'sum', 1, 'Defeat a mini-boss', 'shield', { emeralds: 60 }),
  D('d_boss', 'bosses', 'sum', 1, 'Defeat a boss', 'crossbow', { emeralds: 100, spawnEggs: 1 }),
  D('d_ability_10', 'abilityCasts', 'sum', 10, 'Use your hero ability 10 times', 'star', {
    emeralds: 40,
  }),
  D('d_ability_25', 'abilityCasts', 'sum', 25, 'Use your hero ability 25 times', 'lightning_rod', {
    emeralds: 70,
  }),
  D('d_eggs_1', 'eggsOpened', 'sum', 1, 'Open a Spawn Egg', 'egg', { emeralds: 50 }),
  D('d_eggs_3', 'eggsOpened', 'sum', 3, 'Open 3 Spawn Eggs', 'egg', { emeralds: 90 }),
  D(
    'd_ranged_5',
    'timeSec',
    'best',
    300,
    'Survive 5:00 with a ranged hero',
    'bow',
    { emeralds: 80 },
    HERO_CLASSES.ranged,
  ),
  D(
    'd_melee_100',
    'kills',
    'sum',
    100,
    'Slay 100 mobs with a melee hero',
    'axe',
    { emeralds: 60 },
    HERO_CLASSES.melee,
  ),
  D('d_desert', 'sec.desert', 'sum', 60, 'Spend 60 s in the Desert', 'cactus', { emeralds: 50 }),
  D('d_jungle', 'sec.jungle', 'sum', 60, 'Spend 60 s in the Jungle', 'feather', { emeralds: 50 }),
  D('d_snow', 'sec.snowy_taiga', 'sum', 60, 'Spend 60 s in the Snowy Taiga', 'snowflake', {
    emeralds: 50,
  }),
  D('d_swamp', 'sec.swamp', 'sum', 60, 'Spend 60 s in the Swamp', 'droplet', { emeralds: 50 }),
  D('d_biomes_3', 'biomes', 'best', 3, 'Visit 3 biomes in one run', 'boots', { emeralds: 60 }),
  D('d_runs_3', 'runs', 'sum', 3, 'Play 3 runs', 'campfire', { emeralds: 60 }),
  D('d_escort', 'rescues', 'sum', 1, 'Escort a lost villager to safety', 'heart', {
    emeralds: 70,
    spawnEggs: 1,
  }),
  D('d_trade', 'trades', 'sum', 1, 'Trade with the Wandering Trader', 'apple_gold', {
    emeralds: 60,
  }),
  D('d_level_12', 'level', 'best', 12, 'Reach level 12 in one run', 'arrow_up', { emeralds: 50 }),
  D('d_undead', 'kills.undead', 'sum', 60, 'Defeat 60 undead', 'cross', { emeralds: 50 }),
  D('d_rift', 'rifts', 'sum', 1, 'Enter the Nether rift', 'portal', { emeralds: 70 }),
  D('d_creepers', 'kills.creeper', 'sum', 15, 'Defeat 15 Creepers', 'tnt', { emeralds: 50 }),
  D('d_damage', 'damageDealt', 'sum', 15000, 'Deal 15,000 damage', 'blaze_rod', { emeralds: 60 }),
];

export const WEEKLY_MISSIONS: readonly MissionDef[] = [
  W('w_kills_3000', 'kills', 'sum', 3000, 'Slay 3,000 mobs', 'skull', { emeralds: 350 }),
  W('w_survive_10', 'timeSec', 'best', 600, 'Survive 10:00 in one run', 'clock', {
    emeralds: 300,
    spawnEggs: 1,
  }),
  W('w_boss_5', 'bosses', 'sum', 5, 'Defeat 5 bosses', 'crossbow', {
    emeralds: 400,
    spawnEggs: 2,
  }),
  W('w_win', 'wins', 'sum', 1, 'Win a run (defeat the Warden)', 'totem', {
    emeralds: 500,
    rareSpawnEggs: 1,
  }),
  W('w_emeralds_1500', 'emeraldsPicked', 'sum', 1500, 'Collect 1,500 emeralds', 'emerald', {
    emeralds: 400,
    spawnEggs: 1,
  }),
  W('w_eggs_10', 'eggsOpened', 'sum', 10, 'Open 10 Spawn Eggs', 'egg', { emeralds: 350 }),
  W('w_runs_15', 'runs', 'sum', 15, 'Play 15 runs', 'campfire', { emeralds: 300, spawnEggs: 1 }),
  W('w_minis_10', 'minis', 'sum', 10, 'Defeat 10 mini-bosses', 'shield', {
    emeralds: 400,
    spawnEggs: 1,
  }),
  W('w_biomes_5', 'biomes', 'best', 5, 'Visit 5 biomes in one run', 'boots', {
    emeralds: 350,
    spawnEggs: 1,
  }),
  W('w_rescue_5', 'rescues', 'sum', 5, 'Escort 5 villagers to safety', 'heart', {
    emeralds: 400,
    rareSpawnEggs: 1,
  }),
  W('w_trade_5', 'trades', 'sum', 5, 'Trade 5 times with the Wandering Trader', 'apple_gold', {
    emeralds: 350,
  }),
  W('w_level_30', 'level', 'best', 30, 'Reach level 30 in one run', 'enchant_table', {
    emeralds: 400,
    spawnEggs: 1,
  }),
];

export const ALL_MISSIONS: readonly MissionDef[] = [...DAILY_MISSIONS, ...WEEKLY_MISSIONS];
export const MISSION_BY_ID: ReadonlyMap<string, MissionDef> = new Map(
  ALL_MISSIONS.map((m) => [m.id, m]),
);

/** Daily login rewards, day 1..7 of the cycle (escalating; day 7 carries a rare Spawn Egg). */
export const DAILY_LOGIN_REWARDS: readonly MissionReward[] = [
  { emeralds: 50 },
  { emeralds: 75 },
  { emeralds: 100, spawnEggs: 1 },
  { emeralds: 150 },
  { emeralds: 200, spawnEggs: 1 },
  { emeralds: 300, spawnEggs: 2 },
  { emeralds: 400, spawnEggs: 1, rareSpawnEggs: 1 },
];

/** Short label for a reward, e.g. "+100 emeralds, +1 egg". */
export function rewardText(r: MissionReward): string {
  const parts: string[] = [];
  if (r.emeralds) parts.push(`+${r.emeralds} emeralds`);
  if (r.spawnEggs) parts.push(`+${r.spawnEggs} egg${r.spawnEggs > 1 ? 's' : ''}`);
  if (r.rareSpawnEggs) parts.push(`+${r.rareSpawnEggs} rare egg${r.rareSpawnEggs > 1 ? 's' : ''}`);
  return parts.join(', ');
}
