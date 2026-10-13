/**
 * Achievement definitions. Each one reads a number from the save (lifetime stats, counters, the
 * collection) and optionally from the run that just ended; it unlocks when that number reaches
 * `goal`. Run-only secrets use a 0/1 value with goal 1.
 */
import type { SaveData } from '../core/save';
import { COMPANION_BY_ID, COMPANIONS, HEROES } from './companions';
import { META_BY_ID } from './metaUpgrades';
import type { MissionReward } from './missions';
import type { RunRecord } from '../systems/runStats';
import { BIOME_VISIT_SEC } from '../systems/runStats';
import type { IconName } from '../ui/icons';

export type AchievementCategory =
  'combat' | 'survival' | 'exploration' | 'collection' | 'heroes' | 'economy' | 'secrets';

export const ACHIEVEMENT_CATEGORIES: readonly { id: AchievementCategory; label: string }[] = [
  { id: 'combat', label: 'Combat' },
  { id: 'survival', label: 'Survival' },
  { id: 'exploration', label: 'Explore' },
  { id: 'collection', label: 'Collect' },
  { id: 'heroes', label: 'Heroes' },
  { id: 'economy', label: 'Economy' },
  { id: 'secrets', label: 'Secrets' },
];

export interface AchievementContext {
  save: SaveData;
  /** The run that just ended (null when evaluating from a meta event or at start-up). */
  rec: RunRecord | null;
}

export interface AchievementDef {
  id: string;
  cat: AchievementCategory;
  icon: IconName;
  name: string;
  desc: string;
  /** Hidden achievements show as "???" until unlocked. */
  hidden?: boolean;
  reward?: MissionReward;
  goal: number;
  value(c: AchievementContext): number;
  /** Run-only conditions have no meaningful progress bar. */
  binary?: boolean;
}

const OVERWORLD = [
  'plains',
  'forest',
  'dark_forest',
  'snowy_taiga',
  'desert',
  'swamp',
  'jungle',
  'badlands',
  'cherry_grove',
  'mushroom_fields',
] as const;

const cnt = (s: SaveData, k: string): number => s.stats.counters[k] ?? 0;
/** Eggs opened: the stat, or the gacha's own pull counter when the stat was never bumped. */
export const eggsOpened = (s: SaveData): number => Math.max(s.stats.eggsOpened, s.pullCount);
const biomeSec = (s: SaveData, b: string): number => cnt(s, `sec.${b}`);
export const biomesEverVisited = (s: SaveData): number =>
  [...OVERWORLD, 'nether'].filter((b) => biomeSec(s, b) >= BIOME_VISIT_SEC).length;
const ownedOf = (s: SaveData, kind: 'hero' | 'pet' | 'ally'): number =>
  Object.keys(s.owned).filter((id) => COMPANION_BY_ID.get(id)?.kind === kind).length;
const upgradeRanks = (s: SaveData): number =>
  Object.values(s.upgrades).reduce(
    (a, ranks) =>
      a +
      Object.entries(ranks).reduce(
        (x, [id, r]) => x + (META_BY_ID.has(id) ? Math.max(0, Math.floor(r) || 0) : 0),
        0,
      ),
    0,
  );
const hasMaxedUpgrade = (s: SaveData): boolean =>
  Object.values(s.upgrades).some((ranks) =>
    Object.entries(ranks).some(([id, r]) => {
      const def = META_BY_ID.get(id);
      return !!def && r >= def.max;
    }),
  );
const run = (c: AchievementContext, test: (r: RunRecord) => boolean): number =>
  c.rec && test(c.rec) ? 1 : 0;
const localHour = (ms: number): number => new Date(ms).getHours();

const A = (
  id: string,
  cat: AchievementCategory,
  icon: IconName,
  name: string,
  desc: string,
  goal: number,
  value: (c: AchievementContext) => number,
  reward?: MissionReward,
  extra: { hidden?: boolean; binary?: boolean } = {},
): AchievementDef => ({ id, cat, icon, name, desc, goal, value, reward, ...extra });

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // Combat
  A(
    'first_blood',
    'combat',
    'sword',
    'First Blood',
    'Defeat your first mob.',
    1,
    (c) => c.save.stats.kills,
    { emeralds: 20 },
  ),
  A(
    'mob_hunter',
    'combat',
    'axe',
    'Mob Hunter',
    'Defeat 1,000 mobs.',
    1000,
    (c) => c.save.stats.kills,
    { emeralds: 60 },
  ),
  A(
    'exterminator',
    'combat',
    'skull',
    'Exterminator',
    'Defeat 10,000 mobs.',
    10000,
    (c) => c.save.stats.kills,
    { emeralds: 300, spawnEggs: 1 },
  ),
  A(
    'massacre',
    'combat',
    'tnt',
    'Massacre',
    'Defeat 500 mobs in a single run.',
    500,
    (c) => c.save.stats.bestKills,
    { emeralds: 100 },
  ),
  A(
    'boss_slayer',
    'combat',
    'crossbow',
    'Boss Slayer',
    'Defeat a boss.',
    1,
    (c) => c.save.stats.bosses,
    { emeralds: 100 },
  ),
  A(
    'raid_breaker',
    'combat',
    'shield',
    'Raid Breaker',
    'Defeat 10 bosses.',
    10,
    (c) => c.save.stats.bosses,
    { emeralds: 250, rareSpawnEggs: 1 },
  ),
  A(
    'wither_bane',
    'combat',
    'blaze_rod',
    'Wither Away',
    'Defeat the Wither.',
    1,
    (c) => cnt(c.save, 'kills.wither'),
    { emeralds: 150 },
  ),
  A(
    'champion_hunter',
    'combat',
    'trident',
    'Champion Hunter',
    'Defeat 20 mini-bosses.',
    20,
    (c) => c.save.stats.minis,
    { emeralds: 150 },
  ),
  A(
    'creeper_nope',
    'combat',
    'cross',
    'Aw Man',
    'Defeat 100 Creepers.',
    100,
    (c) => cnt(c.save, 'kills.creeper') + cnt(c.save, 'kills.charged_creeper'),
    { emeralds: 80 },
  ),
  A(
    'heavy_hitter',
    'combat',
    'lightning_rod',
    'Heavy Hitter',
    'Deal 1,000,000 damage in total.',
    1000000,
    (c) => cnt(c.save, 'damageDealt'),
    { emeralds: 200 },
  ),
  A(
    'dragon_slayer',
    'combat',
    'portal',
    'Dragon Slayer',
    'Defeat the Ender Dragon in the End.',
    1,
    (c) => cnt(c.save, 'endDragons'),
    { emeralds: 1000, rareSpawnEggs: 2 },
  ),
  // Survival
  A(
    'dawn_patrol',
    'survival',
    'clock',
    'Dawn Patrol',
    'Survive 5:00 in one run.',
    300,
    (c) => c.save.stats.bestTimeSec,
    { emeralds: 40 },
  ),
  A(
    'long_night',
    'survival',
    'campfire',
    'Long Night',
    'Survive 10:00 in one run.',
    600,
    (c) => c.save.stats.bestTimeSec,
    { emeralds: 100 },
  ),
  A(
    'night_survived',
    'survival',
    'totem',
    'Night Survived',
    'Defeat the Warden and win a run.',
    1,
    (c) => c.save.stats.wins,
    { emeralds: 300, rareSpawnEggs: 1 },
  ),
  A(
    'endless_night',
    'survival',
    'beacon',
    'Endless Night',
    'Survive 25:00 in one run.',
    1500,
    (c) => c.save.stats.bestTimeSec,
    { emeralds: 400, rareSpawnEggs: 1 },
  ),
  A(
    'tough_skin',
    'survival',
    'heart',
    'Tough Skin',
    'Take 10,000 damage in total.',
    10000,
    (c) => cnt(c.save, 'damageTaken'),
    { emeralds: 80 },
  ),
  A('veteran', 'survival', 'helmet', 'Veteran', 'Play 50 runs.', 50, (c) => c.save.stats.runs, {
    emeralds: 150,
  }),
  A(
    'level_head',
    'survival',
    'arrow_up',
    'Level Head',
    'Reach level 20 in one run.',
    20,
    (c) => cnt(c.save, 'best.level'),
    { emeralds: 60 },
  ),
  A(
    'overleveled',
    'survival',
    'enchant_table',
    'Overleveled',
    'Reach level 40 in one run.',
    40,
    (c) => cnt(c.save, 'best.level'),
    { emeralds: 200 },
  ),
  // Exploration
  A(
    'wanderer',
    'exploration',
    'boots',
    'Wanderer',
    'Visit 5 different biomes.',
    5,
    (c) => biomesEverVisited(c.save),
    { emeralds: 60 },
  ),
  A(
    'cartographer',
    'exploration',
    'book',
    'Cartographer',
    'Visit every overworld biome.',
    10,
    (c) => OVERWORLD.filter((b) => biomeSec(c.save, b) >= BIOME_VISIT_SEC).length,
    { emeralds: 250, spawnEggs: 1 },
  ),
  A(
    'into_the_fire',
    'exploration',
    'portal',
    'Into the Fire',
    'Enter the Nether rift.',
    1,
    (c) => cnt(c.save, 'rifts'),
    { emeralds: 60 },
  ),
  A(
    'rift_runner',
    'exploration',
    'flame',
    'Rift Runner',
    'Enter the Nether rift 10 times.',
    10,
    (c) => cnt(c.save, 'rifts'),
    { emeralds: 150 },
  ),
  A(
    'jungle_raider',
    'exploration',
    'crossbow',
    'Jungle Raider',
    'Solve the Jungle Temple and open its chest.',
    1,
    (c) => cnt(c.save, 'struct.jungle'),
    { emeralds: 120, spawnEggs: 1 },
  ),
  A(
    'trial_passed',
    'exploration',
    'trophy',
    'Trial Passed',
    'Win a Trial Chamber and open its Vault.',
    1,
    (c) => cnt(c.save, 'struct.trial'),
    { emeralds: 150, spawnEggs: 1 },
  ),
  A(
    'raid_hero',
    'exploration',
    'crown',
    'Village Defender',
    'Repel a village raid, called by Bad Omen from an Outpost Captain, to earn the Hero buff.',
    1,
    (c) => cnt(c.save, 'struct.hero'),
    { emeralds: 250, rareSpawnEggs: 1 },
  ),
  A(
    'witchs_brew',
    'exploration',
    'potion',
    "Witch's Brew",
    "Try the cauldron in a Witch's Hut.",
    1,
    (c) => cnt(c.save, 'struct.brew'),
    { emeralds: 60 },
  ),
  A(
    'lost_and_found',
    'exploration',
    'heart_half',
    'Lost and Found',
    'Escort a lost villager to safety.',
    1,
    (c) => cnt(c.save, 'rescues'),
    { emeralds: 60 },
  ),
  A(
    'hero_of_the_village',
    'exploration',
    'apple_gold',
    'Hero of the Village',
    'Escort 25 villagers to safety.',
    25,
    (c) => cnt(c.save, 'rescues'),
    { emeralds: 250, spawnEggs: 1 },
  ),
  // Collection
  A(
    'first_egg',
    'collection',
    'egg',
    'Egg-cited',
    'Open your first Spawn Egg.',
    1,
    (c) => eggsOpened(c.save),
    { emeralds: 30 },
  ),
  A(
    'egg_hunter',
    'collection',
    'egg',
    'Egg Hunter',
    'Open 50 Spawn Eggs.',
    50,
    (c) => eggsOpened(c.save),
    { emeralds: 150 },
  ),
  A(
    'spawner_addict',
    'collection',
    'chest',
    'Spawner Addict',
    'Open 250 Spawn Eggs.',
    250,
    (c) => eggsOpened(c.save),
    { emeralds: 400, rareSpawnEggs: 1 },
  ),
  A(
    'pack_starter',
    'collection',
    'foot',
    'Pack Starter',
    'Own 6 companions.',
    6,
    (c) => Object.keys(c.save.owned).length,
    { spawnEggs: 1 },
  ),
  A(
    'collector',
    'collection',
    'clover',
    'Collector',
    'Own 20 companions.',
    20,
    (c) => Object.keys(c.save.owned).length,
    { emeralds: 150, spawnEggs: 1 },
  ),
  A(
    'zoo_keeper',
    'collection',
    'shell',
    'Zoo Keeper',
    'Own 40 companions.',
    40,
    (c) => Object.keys(c.save.owned).length,
    { emeralds: 300, rareSpawnEggs: 1 },
  ),
  A(
    'completionist',
    'collection',
    'star',
    'Completionist',
    'Own every companion.',
    COMPANIONS.length,
    (c) => Object.keys(c.save.owned).length,
    { emeralds: 1000, rareSpawnEggs: 3 },
  ),
  A(
    'legend',
    'collection',
    'apple_ench',
    'Legendary',
    'Own a Legendary companion.',
    1,
    (c) =>
      Object.keys(c.save.owned).filter((id) => COMPANION_BY_ID.get(id)?.rarity === 'legendary')
        .length,
    { emeralds: 100 },
  ),
  A(
    'fully_grown',
    'collection',
    'xp_orb',
    'Fully Grown',
    'Raise a companion to level 5.',
    1,
    (c) => Object.values(c.save.owned).filter((o) => o.level >= 5).length,
    { emeralds: 120 },
  ),
  // Heroes
  A(
    'fresh_faces',
    'heroes',
    'helmet',
    'Fresh Faces',
    'Own 3 heroes.',
    3,
    (c) => ownedOf(c.save, 'hero'),
    { emeralds: 60 },
  ),
  A(
    'full_roster',
    'heroes',
    'totem',
    'Full Roster',
    'Own every hero.',
    HEROES.length,
    (c) => ownedOf(c.save, 'hero'),
    { emeralds: 500, rareSpawnEggs: 1 },
  ),
  A(
    'try_them_all',
    'heroes',
    'foot',
    'Try Them All',
    'Play a run with 5 different heroes.',
    5,
    (c) => Object.values(c.save.stats.perHero).filter((h) => h.runs > 0).length,
    { emeralds: 100 },
  ),
  A(
    'versatile',
    'heroes',
    'thorns',
    'Versatile',
    'Win a run with 3 different heroes.',
    3,
    (c) => Object.keys(c.save.stats.counters).filter((k) => k.startsWith('wins.')).length,
    { emeralds: 300, spawnEggs: 1 },
  ),
  A(
    'spell_slinger',
    'heroes',
    'star',
    'Spell Slinger',
    'Use hero abilities 500 times.',
    500,
    (c) => cnt(c.save, 'abilityCasts'),
    { emeralds: 100 },
  ),
  A(
    'master_of_arts',
    'heroes',
    'enchant_table',
    'Master of Arts',
    'Raise a hero ability to rank 5.',
    20,
    (c) => Math.max(0, ...HEROES.map((h) => c.save.owned[h.id]?.shards ?? 0)),
    { emeralds: 200 },
  ),
  // Economy
  A(
    'pocket_change',
    'economy',
    'emerald',
    'Pocket Change',
    'Earn 1,000 emeralds from runs.',
    1000,
    (c) => c.save.stats.emeraldsEarned,
    { emeralds: 30 },
  ),
  A(
    'emerald_baron',
    'economy',
    'emerald',
    'Emerald Baron',
    'Earn 25,000 emeralds from runs.',
    25000,
    (c) => c.save.stats.emeraldsEarned,
    { emeralds: 150 },
  ),
  A(
    'tycoon',
    'economy',
    'chest',
    'Tycoon',
    'Earn 250,000 emeralds from runs.',
    250000,
    (c) => c.save.stats.emeraldsEarned,
    { emeralds: 500, rareSpawnEggs: 1 },
  ),
  A(
    'investor',
    'economy',
    'anvil',
    'Investor',
    'Buy 10 permanent upgrade ranks.',
    10,
    (c) => upgradeRanks(c.save),
    { emeralds: 60 },
  ),
  A(
    'magnate',
    'economy',
    'anvil',
    'Magnate',
    'Buy 50 permanent upgrade ranks.',
    50,
    (c) => upgradeRanks(c.save),
    { emeralds: 250 },
  ),
  A(
    'maxed_out',
    'economy',
    'magnet',
    'Maxed Out',
    'Max out a permanent upgrade.',
    1,
    (c) => (hasMaxedUpgrade(c.save) ? 1 : 0),
    { emeralds: 150 },
  ),
  A(
    'barter',
    'economy',
    'pearl',
    'Barter',
    'Trade 5 times with the Wandering Trader.',
    5,
    (c) => cnt(c.save, 'trades'),
    { emeralds: 60 },
  ),
  A(
    'taskmaster',
    'economy',
    'book',
    'Taskmaster',
    'Claim 25 missions.',
    25,
    (c) => cnt(c.save, 'missionsClaimed'),
    { emeralds: 150 },
  ),
  A(
    'loyal_customer',
    'economy',
    'potion',
    'Loyal Customer',
    'Reach a 7-day login streak.',
    7,
    (c) => Math.max(c.save.dailyReward.streak, cnt(c.save, 'best.streak')),
    { emeralds: 100, spawnEggs: 1 },
  ),
  // Secrets
  A(
    'bare_bones',
    'secrets',
    'foot',
    'Bare Bones',
    'Survive 5:00 without any armor.',
    1,
    (c) => run(c, (r) => r.timeSec >= 300 && r.armorTier === 0),
    { emeralds: 100 },
    { hidden: true, binary: true },
  ),
  A(
    'untouchable',
    'secrets',
    'eye',
    'Untouchable',
    'Survive 3:00 without taking any damage.',
    1,
    (c) => run(c, (r) => r.timeSec >= 180 && r.damageTaken === 0),
    { emeralds: 150 },
    { hidden: true, binary: true },
  ),
  A(
    'night_owl',
    'secrets',
    'eye',
    'Night Owl',
    'Finish a run between 3 and 5 in the morning.',
    1,
    (c) => run(c, (r) => localHour(r.endedAt) >= 3 && localHour(r.endedAt) < 5),
    { emeralds: 50 },
    { hidden: true, binary: true },
  ),
  A(
    'speed_demon',
    'secrets',
    'elytra',
    'Speed Demon',
    'Win a run in under 16 minutes.',
    1,
    (c) => run(c, (r) => r.won && r.timeSec < 960),
    { emeralds: 300, spawnEggs: 1 },
    { hidden: true, binary: true },
  ),
  A(
    'mooshroom_island',
    'secrets',
    'apple_ench',
    'Mushroom Island',
    'Spend a full minute on a mushroom island.',
    60,
    (c) => biomeSec(c.save, 'mushroom_fields'),
    { emeralds: 100 },
    { hidden: true },
  ),
  A(
    'obsessed',
    'secrets',
    'campfire',
    'Obsessed',
    'Reach a 30-day login streak.',
    30,
    (c) => Math.max(c.save.dailyReward.streak, cnt(c.save, 'best.streak')),
    { emeralds: 500, rareSpawnEggs: 1 },
    { hidden: true },
  ),
  A(
    'the_end',
    'secrets',
    'egg',
    'The End?',
    'Take the Dragon Egg. Is this really the end?',
    1,
    (c) => cnt(c.save, 'dragonEggs'),
    { emeralds: 3000, rareSpawnEggs: 5 },
    { hidden: true },
  ),
  A(
    'scrooge',
    'secrets',
    'chest',
    'Scrooge',
    'Hold 100,000 emeralds at once.',
    100000,
    (c) => c.save.currencies.emeralds,
    { emeralds: 200 },
    { hidden: true },
  ),
];

export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, AchievementDef> = new Map(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);
