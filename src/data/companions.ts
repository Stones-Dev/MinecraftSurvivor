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
  | 'strider';

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
  | 'iron_golem';

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
  /** Atlas hero name (`hero.<name>...`). */
  hero: string;
  /** Id of this hero's active ability (src/abilities). */
  ability: string;
  hp: number;
  dmg: number;
  speed: number;
  passiveName: string;
  passive: string;
}

export interface PetDef extends CompanionBase {
  kind: 'pet';
  effect: PetEffect;
  /** Buff value at levels 1..5. */
  values: readonly [number, number, number, number, number];
  /** Text for the collection (value is the level's number). */
  text: string;
}

export interface AllyDef extends CompanionBase {
  kind: 'ally';
  role: AllyRole;
  hp: number;
  /** Fraction of the hero's damage the ally deals (0 for support roles). */
  dmg: number;
  speed: number;
  text: string;
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
