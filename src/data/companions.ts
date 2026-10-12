/** Collectable heroes, pets and allies (BRIEF section 11) with per-level buffs and lore quips. */
export type CompanionRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type CompanionKind = 'hero' | 'pet' | 'ally';

export const RARITY_ORDER: CompanionRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const RARITY_COLOR: Record<CompanionRarity, string> = {
  common: '#a8a8b4',
  uncommon: '#5fd068',
  rare: '#4aa0ff',
  epic: '#b06bff',
  legendary: '#ffc83a',
};
export const RARITY_LABEL: Record<CompanionRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};
/** Emeralds refunded for a duplicate of a companion that is already at level 5. */
export const DUPE_EMERALDS: Record<CompanionRarity, number> = {
  common: 30,
  uncommon: 60,
  rare: 120,
  epic: 250,
  legendary: 500,
};
/** Duplicates needed to go from level n to n + 1 (index n - 1). */
export const DUPES_FOR_LEVEL = [1, 2, 3, 4] as const;
export const MAX_COMPANION_LEVEL = 5;

export type PetEffect =
  | 'xp'
  | 'emeralds'
  | 'max_hp'
  | 'armor'
  | 'speed'
  | 'cat'
  | 'parrot'
  | 'bee'
  | 'frog'
  | 'fox'
  | 'turtle'
  | 'axolotl'
  | 'wolf_pup'
  | 'panda'
  | 'strider'
  | 'duck'
  | 'moobloom'
  | 'arctic_fox'
  | 'toast'
  | 'pufferfish'
  | 'polar_bear'
  | 'toucan'
  | 'magma_cow'
  | 'ocelot'
  | 'mooshroom'
  | 'piggy_bank'
  | 'golden_monkey'
  | 'bat'
  | 'glare'
  | 'wisp';

export type AllyRole =
  | 'wolf'
  | 'snow_golem'
  | 'llama'
  | 'fletcher'
  | 'cleric'
  | 'weaponsmith'
  | 'armorer'
  | 'librarian'
  | 'horse'
  | 'iron_golem'
  | 'mini_golem'
  | 'butcher'
  | 'leatherworker'
  | 'goat'
  | 'cat'
  | 'melon_golem'
  | 'fisherman'
  | 'copper_golem'
  | 'shepherd'
  | 'love_golem'
  | 'furnace_golem'
  | 'soul_wizard';

interface CompanionBase {
  id: string;
  name: string;
  rarity: CompanionRarity;
  /** Atlas animation prefix (`<sprite>.idle`, `<sprite>.walk`, ...). */
  sprite: string;
  quip: string;
}

export interface HeroDef extends CompanionBase {
  kind: 'hero';
  /**
   * How the hero is drawn: 'hero' uses the layered hero sheets (`hero.<hero>.<armor>.<sword>.<anim>`, armor and
   * sword tiers swap the sprite); 'sprite' uses a mob/NPC set under `sprite` (idle/walk/attack/hurt/death) and
   * keeps the tiers as stats only.
   */
  render: 'hero' | 'sprite';
  /** Atlas hero name (`hero.<name>...`); sprite heroes use their id (it is never looked up). */
  hero: string;
  /** Id of this hero's active ability (src/abilities). */
  ability: string;
  hp: number;
  dmg: number;
  speed: number;
  passiveName: string;
  passive: string;
  /** Sprite heroes: draw scale (feet anchored), default 1. */
  scale?: number;
  /** Hitbox radius in art px (default 5). */
  radius?: number;
  /** Sprite heroes: css colour washed over the sprite (recolours; keep the alpha low). */
  tint?: string;
  /** Sprite heroes: animation played while the ability is being cast (first one that exists wins). */
  castAnims?: readonly string[];
  /**
   * Only the first N frames of the cast / attack animation are used: several sets end in frames of the
   * projectile or puff alone (the creeper's blast, the witch's flask, the skeleton's arrow).
   */
  castFrames?: number;
  attackFrames?: number;
  /** Sprite heroes whose art faces left when not mirrored (most mob sets; the default assumes right). */
  faceLeft?: boolean;
}

export interface PetDef extends CompanionBase {
  kind: 'pet';
  effect: PetEffect;
  /** Buff value at levels 1..5. */
  values: readonly [number, number, number, number, number];
  /** Text for the collection (value is the level's number). */
  text: string;
  /** Floats above the ground with a gentle bob (bats, wisps, fish). */
  hover?: boolean;
  /** Draw scale (feet anchored), default 1. */
  scale?: number;
}

export interface AllyDef extends CompanionBase {
  kind: 'ally';
  role: AllyRole;
  hp: number;
  /** Fraction of the hero's damage the ally deals (0 for support roles). */
  dmg: number;
  speed: number;
  text: string;
  /** Draw scale (feet anchored), default 1. */
  scale?: number;
}

export type CompanionDef = HeroDef | PetDef | AllyDef;

const v = (a: number, b: number, c: number, d: number, e: number): PetDef['values'] => [
  a,
  b,
  c,
  d,
  e,
];

export const HEROES: HeroDef[] = [
  {
    id: 'steve',
    kind: 'hero',
    name: 'Steve',
    rarity: 'common',
    sprite: 'hero.steve.none.none',
    render: 'hero',
    hero: 'steve',
    ability: 'iron_resolve',
    hp: 100,
    dmg: 1,
    speed: 1,
    passiveName: "Builder's Grit",
    passive:
      '+10% max HP. Armor tiers cost one fewer card; the first Leather tier is free at minute 1.',
    quip: 'Punches trees for a living. It is going great.',
  },
  {
    id: 'alex',
    kind: 'hero',
    name: 'Alex',
    rarity: 'legendary',
    sprite: 'hero.alex.none.none',
    render: 'hero',
    hero: 'alex',
    ability: 'arrow_rain',
    hp: 90,
    dmg: 1.05,
    speed: 1.08,
    passiveName: 'Ranger',
    passive: 'Projectiles +15% speed and +1 pierce. Starts with the Bow at level 2.',
    quip: 'Never misses. Claims the arrows were aimed at the other zombie.',
  },
  {
    id: 'rana',
    kind: 'hero',
    name: 'Rana',
    rarity: 'legendary',
    sprite: 'hero.rana.none.none',
    render: 'hero',
    hero: 'rana',
    ability: 'frog_leap',
    hp: 85,
    dmg: 1,
    speed: 1.04,
    passiveName: "Frog's Luck",
    passive:
      '+10% luck, double XP from slimes and magma cubes, slimes split at most once, water does not slow her.',
    quip: 'Jumps at every puddle. Lands on the right side of luck.',
  },
  // Sprite heroes: drawn from mob / NPC sets; armor and sword tiers only change their stats.
  {
    id: 'skeleton',
    kind: 'hero',
    name: 'Skeleton',
    rarity: 'uncommon',
    sprite: 'mob.skeleton',
    render: 'sprite',
    hero: 'skeleton',
    ability: 'bone_barrage',
    hp: 75,
    dmg: 1,
    speed: 1.04,
    passiveName: 'Bone Dry',
    passive: 'Starts with the Bow at level 3, projectiles +1 pierce. Undead: immune to poison.',
    castAnims: ['firing', 'attack'],
    castFrames: 5,
    attackFrames: 5,
    faceLeft: true,
    quip: 'All bones, no stamina. Still out-shoots everyone in the room.',
  },
  {
    id: 'wandering_trader',
    kind: 'hero',
    name: 'Wandering Trader',
    rarity: 'rare',
    sprite: 'npc.wandering_trader',
    render: 'sprite',
    hero: 'wandering_trader',
    ability: 'emerald_shower',
    hp: 95,
    dmg: 0.95,
    speed: 1,
    passiveName: 'Haggler',
    passive:
      '+25% Emerald payout and +25% Emeralds from chests. Starts the run with a random item.',
    castAnims: ['trading', 'talk'],
    quip: 'Sells you a bucket of fish for twelve emeralds. Somehow you say yes.',
  },
  {
    id: 'village_smith',
    kind: 'hero',
    name: 'Village Smith',
    rarity: 'rare',
    sprite: 'npc.weaponsmith_plains_villager',
    render: 'sprite',
    hero: 'village_smith',
    ability: 'anvil_drop',
    hp: 110,
    dmg: 1.02,
    speed: 0.96,
    passiveName: 'Forge Master',
    passive: 'Sword damage +20% and starts with an Iron sword. +2 armor.',
    castAnims: ['trading', 'talk'],
    quip: 'Hrm. Fixes swords, fixes armor, fixes you with a look.',
  },
  {
    id: 'enderman',
    kind: 'hero',
    name: 'Enderman',
    rarity: 'epic',
    sprite: 'mob.enderman',
    render: 'sprite',
    hero: 'enderman',
    ability: 'blink',
    hp: 90,
    dmg: 1.05,
    speed: 1.08,
    passiveName: 'Phase Step',
    passive: '15% chance to blink out of the way of a hit. Takes 30% more damage while in water.',
    castAnims: ['teleport_appear', 'teleport_away'],
    quip: 'Do not look him in the eyes. Do look at his damage numbers.',
  },
  {
    id: 'witch',
    kind: 'hero',
    name: 'Witch',
    rarity: 'epic',
    sprite: 'mob.witch',
    render: 'sprite',
    hero: 'witch',
    ability: 'witch_brew',
    hp: 85,
    dmg: 1,
    speed: 0.98,
    passiveName: 'Cauldron Craft',
    passive: 'Potion weapons +30% area. Starts with a random potion weapon (Poison or Harming).',
    castAnims: ['throw', 'attack'],
    castFrames: 4,
    attackFrames: 4,
    faceLeft: true,
    quip: 'Cackles at everything. The potions are labelled, just not honestly.',
  },
  {
    id: 'illusioner',
    kind: 'hero',
    name: 'Illusioner',
    rarity: 'epic',
    sprite: 'mob.illusioner',
    render: 'sprite',
    hero: 'illusioner',
    ability: 'mirror_images',
    hp: 85,
    dmg: 1,
    speed: 1,
    passiveName: 'Sleight of Hand',
    passive:
      '+10% speed. 20% of the hits you take leave a decoy behind that lures enemies for 1.5 s.',
    castAnims: ['magic', 'firing'],
    castFrames: 4,
    attackFrames: 5,
    faceLeft: true,
    quip: 'There are four of him. None of them did the dishes.',
  },
  {
    id: 'piglin',
    kind: 'hero',
    name: 'Piglin',
    rarity: 'legendary',
    sprite: 'mob.piglin',
    render: 'sprite',
    hero: 'piglin',
    ability: 'gold_rush',
    hp: 100,
    dmg: 1.08,
    speed: 1,
    passiveName: 'Gold Digger',
    passive:
      '+15% luck and heal 1 HP per kill. Piglins and zombified piglins ignore him (bosses and rift foes do not).',
    castAnims: ['attack'],
    faceLeft: true,
    tint: 'rgba(255,214,90,0.22)',
    quip: 'Will fight for you. Will fight a lot harder for gold.',
  },
  {
    id: 'creeper',
    kind: 'hero',
    name: 'Creeper',
    rarity: 'legendary',
    sprite: 'mob.enchanted_creeper',
    render: 'sprite',
    hero: 'creeper',
    ability: 'charged_blast',
    hp: 95,
    dmg: 1.08,
    speed: 1,
    passiveName: 'Short Fuse',
    passive: 'Explosion damage taken -50%. 10% of his hits set off a mini explosion.',
    castAnims: ['explode'],
    castFrames: 5,
    quip: 'Finally found a hug that lasts. Everyone else keeps running away.',
  },
];

export const PETS: PetDef[] = [
  {
    id: 'chicken',
    kind: 'pet',
    name: 'Chicken',
    rarity: 'common',
    sprite: 'pet.chicken',
    effect: 'xp',
    values: v(5, 8, 10, 13, 15),
    text: '+{v}% XP',
    quip: 'Lays an egg whenever things get tense. Never the right kind.',
  },
  {
    id: 'pig',
    kind: 'pet',
    name: 'Pig',
    rarity: 'common',
    sprite: 'pet.pig',
    effect: 'emeralds',
    values: v(5, 8, 10, 13, 15),
    text: '+{v}% Emeralds',
    quip: 'Has a nose for shiny things. Eats your carrots too.',
  },
  {
    id: 'cow',
    kind: 'pet',
    name: 'Cow',
    rarity: 'common',
    sprite: 'pet.cow',
    effect: 'max_hp',
    values: v(5, 8, 10, 13, 15),
    text: '+{v} max HP',
    quip: 'Moo. That is the whole plan, and it works surprisingly well.',
  },
  {
    id: 'sheep',
    kind: 'pet',
    name: 'Sheep',
    rarity: 'common',
    sprite: 'pet.sheep_white',
    effect: 'armor',
    values: v(1, 1.5, 2, 2.5, 3),
    text: '+{v} armor',
    quip: 'Wool is a fashion choice and also a very soft chestplate.',
  },
  {
    id: 'rabbit',
    kind: 'pet',
    name: 'Rabbit',
    rarity: 'uncommon',
    sprite: 'pet.brown_rabbit',
    effect: 'speed',
    values: v(4, 5.5, 7, 8.5, 10),
    text: '+{v}% speed',
    quip: 'Runs on carrots and pure anxiety.',
  },
  {
    id: 'cat',
    kind: 'pet',
    name: 'Cat',
    rarity: 'uncommon',
    sprite: 'pet.tabby_cat',
    effect: 'cat',
    values: v(10, 15, 20, 25, 30),
    text: 'Explosions hurt {v}% less; creepers hiss slower',
    quip: 'Creepers fear her. She has opinions about their haircut.',
  },
  {
    id: 'parrot',
    kind: 'pet',
    name: 'Parrot',
    rarity: 'uncommon',
    sprite: 'pet.red_parrot',
    effect: 'parrot',
    values: v(15, 22, 28, 34, 40),
    text: '+{v}% pickup radius; squawks before a boss',
    quip: 'Repeats everything the Warden says. Do not ask what that was.',
  },
  {
    id: 'bee',
    kind: 'pet',
    name: 'Bee',
    rarity: 'uncommon',
    sprite: 'pet.bee',
    effect: 'bee',
    values: v(5, 8, 10, 13, 15),
    text: 'Hits poison {v}% of the time',
    quip: 'Bzzz. Deeply offended on your behalf.',
  },
  {
    id: 'frog',
    kind: 'pet',
    name: 'Frog',
    rarity: 'rare',
    sprite: 'pet.temperate_frog',
    effect: 'frog',
    values: v(10, 15, 20, 25, 30),
    text: 'Eats small slimes; +{v}% XP from slimes',
    quip: 'Slimes are snacks. Magma cubes are a dare.',
  },
  {
    id: 'fox',
    kind: 'pet',
    name: 'Fox',
    rarity: 'rare',
    sprite: 'pet.fox',
    effect: 'fox',
    values: v(5, 8, 10, 13, 15),
    text: '+{v}% luck; enemies drop Emeralds more often',
    quip: 'Steals berries, leaves clues, never apologises.',
  },
  {
    id: 'turtle',
    kind: 'pet',
    name: 'Turtle',
    rarity: 'rare',
    sprite: 'pet.turtle',
    effect: 'turtle',
    values: v(10, 15, 20, 25, 30),
    text: '{v} HP shield, recharges when you stand still',
    quip: 'Carries its house. Has never once been late to a fight.',
  },
  {
    id: 'axolotl',
    kind: 'pet',
    name: 'Axolotl',
    rarity: 'rare',
    sprite: 'pet.wild_axolotl',
    effect: 'axolotl',
    values: v(2, 3, 4, 5, 6),
    text: 'Heal {v}% of max HP on kill in water, +regen',
    quip: 'Smiles through everything. Regrows what it loses.',
  },
  {
    id: 'wolf_pup',
    kind: 'pet',
    name: 'Wolf Pup',
    rarity: 'epic',
    sprite: 'pet.baby_wolf',
    effect: 'wolf_pup',
    values: v(10, 12.5, 15, 17.5, 20),
    text: '+{v}% damage; barks when a Charged mob is near',
    quip: 'Tiny growl, enormous confidence.',
  },
  {
    id: 'panda',
    kind: 'pet',
    name: 'Panda',
    rarity: 'epic',
    sprite: 'pet.baby_panda',
    effect: 'panda',
    values: v(10, 14, 18, 22, 25),
    text: '-{v}% cooldowns',
    quip: 'Lazy aura. Somehow makes you the efficient one.',
  },
  {
    id: 'strider',
    kind: 'pet',
    name: 'Strider',
    rarity: 'legendary',
    sprite: 'pet.strider',
    effect: 'strider',
    values: v(8, 11, 14, 17, 20),
    text: 'Lava immunity; +{v}% speed on lava and Nether ground',
    quip: 'Shivers on dry land. Skates over lava like it is a dance floor.',
  },
  {
    id: 'duck',
    kind: 'pet',
    name: 'Duck',
    rarity: 'common',
    sprite: 'pet.duck',
    effect: 'duck',
    values: v(8, 11, 14, 17, 20),
    text: '+{v}% projectile speed',
    quip: 'Quacks at your arrows until they hurry up.',
  },
  {
    id: 'moobloom',
    kind: 'pet',
    name: 'Moobloom',
    rarity: 'common',
    sprite: 'pet.moobloom',
    effect: 'moobloom',
    values: v(0.2, 0.3, 0.4, 0.5, 0.6),
    text: '+{v} HP regenerated per second',
    quip: 'Smells like buttercups. Mostly. Do not check the other part.',
  },
  {
    id: 'arctic_fox',
    kind: 'pet',
    name: 'Arctic Fox',
    rarity: 'common',
    sprite: 'pet.arctic_fox',
    effect: 'arctic_fox',
    values: v(10, 14, 18, 22, 26),
    text: '+{v}% damage to slowed, frozen or stunned enemies',
    quip: 'Pounces on anything that stops moving. Including snowmen.',
  },
  {
    id: 'toast',
    kind: 'pet',
    name: 'Toast',
    rarity: 'common',
    sprite: 'pet.toast',
    effect: 'toast',
    values: v(6, 9, 12, 15, 18),
    text: '+{v}% loot drops (Emeralds and Spawn Eggs)',
    quip: 'A rabbit named after breakfast. Finds things nobody dropped.',
  },
  {
    id: 'pufferfish',
    kind: 'pet',
    name: 'Pufferfish',
    rarity: 'uncommon',
    sprite: 'pet.pufferfish_big',
    effect: 'pufferfish',
    values: v(30, 40, 50, 60, 75),
    text: 'Reflects {v}% of contact damage',
    quip: 'Hugs are not recommended. Neither is biting the hero.',
    hover: true,
  },
  {
    id: 'polar_bear',
    kind: 'pet',
    name: 'Polar Bear Cub',
    rarity: 'uncommon',
    sprite: 'pet.baby_polar_bear',
    effect: 'polar_bear',
    values: v(20, 24, 28, 32, 36),
    text: 'Enemies within {v} px are slowed; snow does not slow you',
    quip: 'Chilly breath, warm heart, cold stare for skeletons.',
  },
  {
    id: 'toucan',
    kind: 'pet',
    name: 'Toucan',
    rarity: 'uncommon',
    sprite: 'pet.toucan',
    effect: 'toucan',
    values: v(25, 35, 45, 55, 70),
    text: '+{v}% XP from elites and bosses',
    quip: 'Big beak, bigger appetite for the shiny ones.',
    hover: true,
  },
  {
    id: 'magma_cow',
    kind: 'pet',
    name: 'Magma Cow',
    rarity: 'uncommon',
    sprite: 'pet.magma_cow',
    effect: 'magma_cow',
    values: v(25, 35, 45, 55, 65),
    text: 'Burning, lava and fireballs hurt you {v}% less',
    quip: 'Gives hot milk. Very hot. Please use a bucket.',
  },
  {
    id: 'ocelot',
    kind: 'pet',
    name: 'Ocelot',
    rarity: 'rare',
    sprite: 'pet.ocelot',
    effect: 'ocelot',
    values: v(6, 8, 10, 12, 15),
    text: '{v}% chance for any hit to crit for double damage',
    quip: 'Will not be tamed. Will, however, point at weak spots.',
  },
  {
    id: 'mooshroom',
    kind: 'pet',
    name: 'Mooshroom',
    rarity: 'rare',
    sprite: 'pet.mooshroom',
    effect: 'mooshroom',
    values: v(15, 20, 25, 30, 35),
    text: 'Below 35% HP, a stew heals {v}% of max HP (40 s cooldown)',
    quip: 'Carries soup on its back. Suspiciously generous.',
  },
  {
    id: 'piggy_bank',
    kind: 'pet',
    name: 'Piggy Bank',
    rarity: 'rare',
    sprite: 'pet.piggy_bank',
    effect: 'piggy_bank',
    values: v(8, 11, 14, 17, 20),
    text: 'Chests and ores have a {v}% chance to give a Spawn Egg',
    quip: 'Saving up for something. Will not say what. Jingles when it runs.',
  },
  {
    id: 'golden_monkey',
    kind: 'pet',
    name: 'Golden Monkey',
    rarity: 'epic',
    sprite: 'pet.golden_monkey',
    effect: 'golden_monkey',
    values: v(6, 8, 10, 12, 15),
    text: '{v}% chance to dodge a hit completely',
    quip: 'Pulls you out of the way by the sleeve. Charges in bananas.',
  },
  {
    id: 'bat',
    kind: 'pet',
    name: 'Bat',
    rarity: 'epic',
    sprite: 'pet.bat',
    effect: 'bat',
    values: v(10, 13, 16, 20, 25),
    text: 'At night: +{v}% speed and damage; nights are brighter',
    quip: 'Sleeps all day upside down. Night shift is where it shines.',
    hover: true,
    scale: 0.7,
  },
  {
    id: 'glare',
    kind: 'pet',
    name: 'Glare',
    rarity: 'legendary',
    sprite: 'pet.glare_classic_oak',
    effect: 'glare',
    values: v(15, 20, 25, 30, 40),
    text: '+{v}% damage to elites and bosses; elites drop an Emerald',
    quip: 'Glares at the dark until the dark apologises.',
    hover: true,
  },
  {
    id: 'wisp',
    kind: 'pet',
    name: 'Wisp',
    rarity: 'legendary',
    sprite: 'pet.yellow_wisp',
    effect: 'wisp',
    values: v(30, 40, 50, 60, 75),
    text: 'Once per run, revive with {v}% HP when you fall',
    quip: 'A tiny lantern with opinions. Refuses to let you stay down.',
    hover: true,
  },
];

export const ALLIES: AllyDef[] = [
  {
    id: 'wolf',
    kind: 'ally',
    name: 'Wolf',
    rarity: 'common',
    sprite: 'ally.wolf_white',
    role: 'wolf',
    hp: 60,
    dmg: 0.7,
    speed: 74,
    text: 'Melee chaser, 70% of your damage',
    quip: 'Good dog. Excellent dog. Please stop eating the zombies.',
  },
  {
    id: 'snow_golem',
    kind: 'ally',
    name: 'Snow Golem',
    rarity: 'uncommon',
    sprite: 'ally.snow_golem',
    role: 'snow_golem',
    hp: 50,
    dmg: 0.4,
    speed: 30,
    text: 'Throws slowing snowballs',
    quip: 'Melts in deserts and in arguments.',
  },
  {
    id: 'trader_llama',
    kind: 'ally',
    name: 'Trader Llama',
    rarity: 'uncommon',
    sprite: 'pet.white_llama_trader_decor',
    role: 'llama',
    hp: 70,
    dmg: 0.5,
    speed: 46,
    text: 'Spits at range and knocks enemies back',
    quip: 'Spits first, haggles later.',
  },
  {
    id: 'fletcher',
    kind: 'ally',
    name: 'Villager Fletcher',
    rarity: 'uncommon',
    sprite: 'npc.fletcher_plains_villager',
    role: 'fletcher',
    hp: 55,
    dmg: 0.5,
    speed: 40,
    text: 'Shoots arrows; you start with +1 Bow level',
    quip: 'Hrm. Sharper than a sword, flightier than a chicken.',
  },
  {
    id: 'cleric',
    kind: 'ally',
    name: 'Villager Cleric',
    rarity: 'rare',
    sprite: 'npc.cleric_plains_villager',
    role: 'cleric',
    hp: 55,
    dmg: 0,
    speed: 40,
    text: 'Heals you 2% every 3 s and cures poison',
    quip: 'Hrmmm. Brews a potion for every occasion except this one.',
  },
  {
    id: 'weaponsmith',
    kind: 'ally',
    name: 'Villager Weaponsmith',
    rarity: 'rare',
    sprite: 'npc.weaponsmith_plains_villager',
    role: 'weaponsmith',
    hp: 60,
    dmg: 0,
    speed: 40,
    text: 'You start with an Iron sword',
    quip: 'Hrm. Sharpens everything. Including the conversation.',
  },
  {
    id: 'armorer',
    kind: 'ally',
    name: 'Villager Armorer',
    rarity: 'rare',
    sprite: 'npc.armorer_plains_villager',
    role: 'armorer',
    hp: 70,
    dmg: 0,
    speed: 40,
    text: 'You start with Chainmail armor',
    quip: 'Hrm. Dented, never broken.',
  },
  {
    id: 'librarian',
    kind: 'ally',
    name: 'Villager Librarian',
    rarity: 'epic',
    sprite: 'npc.librarian_plains_villager',
    role: 'librarian',
    hp: 50,
    dmg: 0,
    speed: 40,
    text: 'Level-up offers show 4 cards',
    quip: 'Shh. Reading about creepers. Carefully.',
  },
  {
    id: 'horse',
    kind: 'ally',
    name: 'Horse',
    rarity: 'epic',
    sprite: 'ally.chestnut_horse',
    role: 'horse',
    hp: 90,
    dmg: 0.6,
    speed: 90,
    text: 'You move +20% faster and trample enemies at speed',
    quip: 'Does not need a saddle. Needs hay. And respect.',
  },
  {
    id: 'iron_golem',
    kind: 'ally',
    name: 'Iron Golem',
    rarity: 'legendary',
    sprite: 'ally.iron_golem',
    role: 'iron_golem',
    hp: 300,
    dmg: 1.2,
    speed: 36,
    text: 'Taunts nearby enemies and slams for area damage',
    quip: 'Gives flowers to villagers. Gives zombies a bad day.',
  },
  {
    id: 'mini_golem',
    kind: 'ally',
    name: 'Small Iron Golem',
    rarity: 'common',
    sprite: 'ally.small_iron_golem',
    role: 'mini_golem',
    hp: 140,
    dmg: 0.5,
    speed: 40,
    text: 'Tiny tank: taunts enemies within 40 px, takes 40% less damage',
    quip: 'Built from leftover blocks. Has something to prove.',
  },
  {
    id: 'butcher',
    kind: 'ally',
    name: 'Villager Butcher',
    rarity: 'common',
    sprite: 'npc.butcher_plains_villager',
    role: 'butcher',
    hp: 60,
    dmg: 0.6,
    speed: 52,
    text: 'Cleaver melee; each kill he lands heals you 2% of max HP',
    quip: 'Hrm. Knows forty ways to cook a zombie. Recommends none.',
  },
  {
    id: 'leatherworker',
    kind: 'ally',
    name: 'Villager Leatherworker',
    rarity: 'common',
    sprite: 'npc.leatherworker_plains_villager',
    role: 'leatherworker',
    hp: 55,
    dmg: 0,
    speed: 40,
    text: 'Stitches a patch every 12 s: +6 shield HP (stacks to 18)',
    quip: 'Hrm. Patches your armor while you are still wearing it.',
  },
  {
    id: 'goat',
    kind: 'ally',
    name: 'Goat',
    rarity: 'uncommon',
    sprite: 'pet.goat',
    role: 'goat',
    hp: 80,
    dmg: 0.9,
    speed: 60,
    text: 'Telegraphs a charge, then rams through a line of enemies',
    quip: 'Screams first, rams second, apologises never.',
  },
  {
    id: 'black_cat',
    kind: 'ally',
    name: 'Black Cat',
    rarity: 'uncommon',
    sprite: 'pet.black_cat',
    role: 'cat',
    hp: 45,
    dmg: 0.4,
    speed: 92,
    text: 'Fast scratcher; 25% of scratches crit for 2.5x',
    quip: 'Crossed your path on purpose. It is the zombies who are unlucky.',
  },
  {
    id: 'melon_golem',
    kind: 'ally',
    name: 'Melon Golem',
    rarity: 'uncommon',
    sprite: 'ally.melon_golem',
    role: 'melon_golem',
    hp: 60,
    dmg: 0.35,
    speed: 30,
    text: 'Spits a fan of 3 melon seeds that pierce 2 enemies',
    quip: 'Snow golem who went on holiday. Never came back.',
  },
  {
    id: 'fisherman',
    kind: 'ally',
    name: 'Villager Fisherman',
    rarity: 'uncommon',
    sprite: 'npc.fisherman_plains_villager',
    role: 'fisherman',
    hp: 55,
    dmg: 0,
    speed: 40,
    text: 'Reels in the farthest XP orb or Emerald every 1.5 s',
    quip: 'Hrm. Caught a boot, two orbs and, once, a creeper.',
  },
  {
    id: 'copper_golem',
    kind: 'ally',
    name: 'Copper Golem',
    rarity: 'rare',
    sprite: 'ally.copper_golem',
    role: 'copper_golem',
    hp: 110,
    dmg: 0.6,
    speed: 34,
    text: 'Melee; calls a lightning bolt on crowds every 6 s (3 s in storms)',
    quip: 'Presses buttons. One of them summons lightning. It loves that button.',
  },
  {
    id: 'shepherd',
    kind: 'ally',
    name: 'Villager Shepherd',
    rarity: 'rare',
    sprite: 'npc.shepherd_plains_villager',
    role: 'shepherd',
    hp: 55,
    dmg: 0,
    speed: 40,
    text: 'Drops a wool decoy every 12 s that lures nearby enemies for 5 s',
    quip: 'Hrm. Every sheep is a decoy if you believe in it.',
  },
  {
    id: 'love_golem',
    kind: 'ally',
    name: 'Love Golem',
    rarity: 'epic',
    sprite: 'ally.love_golem',
    role: 'love_golem',
    hp: 150,
    dmg: 0,
    speed: 36,
    text: 'Charms the toughest nearby enemy every 4 s (stun 2.5 s) and heals you',
    quip: 'Gives flowers to zombies. They are too confused to bite.',
  },
  {
    id: 'furnace_golem',
    kind: 'ally',
    name: 'Furnace Golem',
    rarity: 'epic',
    sprite: 'ally.furnace_golem',
    role: 'furnace_golem',
    hp: 220,
    dmg: 0.8,
    speed: 34,
    text: 'Melee bruiser with a burning aura (sets enemies within 36 px on fire)',
    quip: 'Runs on coal and spite. Do not ask it to make toast.',
  },
  {
    id: 'soul_wizard',
    kind: 'ally',
    name: 'Soul Wizard',
    rarity: 'legendary',
    sprite: 'ally.soul_wizard',
    role: 'soul_wizard',
    hp: 80,
    dmg: 0.8,
    speed: 44,
    text: 'Casts 3 homing soul orbs every 2.2 s; blinks to you when cornered',
    quip: 'Speaks only in whispers and critical hits.',
  },
];

export const COMPANIONS: CompanionDef[] = [...HEROES, ...PETS, ...ALLIES];
export const COMPANION_BY_ID = new Map<string, CompanionDef>(COMPANIONS.map((c) => [c.id, c]));

export function petById(id: string | null): PetDef | undefined {
  const c = id ? COMPANION_BY_ID.get(id) : undefined;
  return c?.kind === 'pet' ? c : undefined;
}

export function allyById(id: string): AllyDef | undefined {
  const c = COMPANION_BY_ID.get(id);
  return c?.kind === 'ally' ? c : undefined;
}

export function heroById(id: string): HeroDef {
  const c = COMPANION_BY_ID.get(id);
  return c?.kind === 'hero' ? c : (HEROES[0] as HeroDef);
}

/** The buff line shown in the collection for a pet at a given level. */
export function petText(pet: PetDef, level: number): string {
  const value = pet.values[Math.max(0, Math.min(4, level - 1))] ?? 0;
  return pet.text.replace('{v}', String(value));
}
