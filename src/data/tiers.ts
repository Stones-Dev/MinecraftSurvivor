/** In-run armor and sword tiers; both change the hero sprite (BRIEF section 7.4). */
export const ARMOR_IDS = [
  'none',
  'leather',
  'chainmail',
  'iron',
  'gold',
  'diamond',
  'netherite',
  'enchanted',
] as const;
export type ArmorId = (typeof ARMOR_IDS)[number];

export const SWORD_IDS = [
  'wood',
  'stone',
  'iron',
  'gold',
  'diamond',
  'netherite',
  'enchanted',
] as const;
export type SwordId = (typeof SWORD_IDS)[number];

export interface ArmorTier {
  id: ArmorId;
  name: string;
  armor: number;
  hp: number;
  luck: number;
  regen: number;
  blurb: string;
}

export interface SwordTier {
  id: SwordId;
  name: string;
  /** Multiplier on the Sword weapon's damage. */
  dmg: number;
  /** Multiplier on its cooldown (lower = faster). */
  cd: number;
  /** Extra arc radius fraction. */
  area: number;
  /** Built-in Fire Aspect chance. */
  burn: number;
  blurb: string;
}

/** Index = tier number; tier 0 is "no armor". Values are absolute, not cumulative. */
export const ARMOR_TIERS: readonly ArmorTier[] = [
  { id: 'none', name: 'No armor', armor: 0, hp: 0, luck: 0, regen: 0, blurb: '' },
  {
    id: 'leather',
    name: 'Leather',
    armor: 2,
    hp: 10,
    luck: 0,
    regen: 0,
    blurb: '+2 armor, +10 HP.',
  },
  { id: 'chainmail', name: 'Chainmail', armor: 4, hp: 10, luck: 0, regen: 0, blurb: '4 armor.' },
  { id: 'iron', name: 'Iron', armor: 7, hp: 10, luck: 0, regen: 0, blurb: '7 armor.' },
  {
    id: 'gold',
    name: 'Gold',
    armor: 3,
    hp: 10,
    luck: 0.12,
    regen: 0,
    blurb: 'Luck +12% instead of armor.',
  },
  {
    id: 'diamond',
    name: 'Diamond',
    armor: 11,
    hp: 20,
    luck: 0,
    regen: 0,
    blurb: '11 armor, +20 HP.',
  },
  {
    id: 'netherite',
    name: 'Netherite',
    armor: 15,
    hp: 30,
    luck: 0,
    regen: 0,
    blurb: '15 armor, +30 HP, heavy knockback.',
  },
  {
    id: 'enchanted',
    name: 'Enchanted',
    armor: 16,
    hp: 30,
    luck: 0,
    regen: 0.6,
    blurb: '16 armor, regenerates, glints.',
  },
];

/** Index = tier number; tier 0 is the starting wooden sword. */
export const SWORD_TIERS: readonly SwordTier[] = [
  { id: 'wood', name: 'Wooden', dmg: 1, cd: 1, area: 0, burn: 0, blurb: 'Starting sword.' },
  {
    id: 'stone',
    name: 'Stone',
    dmg: 1.12,
    cd: 1,
    area: 0.04,
    burn: 0,
    blurb: '+12% sword damage.',
  },
  { id: 'iron', name: 'Iron', dmg: 1.25, cd: 1, area: 0.08, burn: 0, blurb: '+25% sword damage.' },
  {
    id: 'gold',
    name: 'Gold',
    dmg: 1.1,
    cd: 0.8,
    area: 0.08,
    burn: 0,
    blurb: 'Fast swings, lower damage.',
  },
  {
    id: 'diamond',
    name: 'Diamond',
    dmg: 1.5,
    cd: 0.9,
    area: 0.12,
    burn: 0,
    blurb: '+50% sword damage.',
  },
  {
    id: 'netherite',
    name: 'Netherite',
    dmg: 1.75,
    cd: 0.9,
    area: 0.16,
    burn: 0,
    blurb: '+75% sword damage.',
  },
  {
    id: 'enchanted',
    name: 'Enchanted',
    dmg: 2,
    cd: 0.85,
    area: 0.2,
    burn: 0.25,
    blurb: 'Doubled damage, built-in Fire Aspect.',
  },
];
