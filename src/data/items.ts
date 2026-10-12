import type { IconName } from '../ui/icons';

/** One equipped item per run (BRIEF section 7.5); `active` items are used with Space. */
export type ItemId =
  | 'totem'
  | 'golden_apple'
  | 'enchanted_apple'
  | 'elytra'
  | 'ender_pearl'
  | 'turtle_shell'
  | 'fire_potion'
  | 'rabbit_foot';

export interface ItemDef {
  id: ItemId;
  name: string;
  icon: IconName;
  blurb: string;
  active: boolean;
  /** Seconds between uses (0 = single use / passive). */
  cooldown: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  totem: {
    id: 'totem',
    name: 'Totem of Undying',
    icon: 'totem',
    blurb: 'Revives you once at 50% HP.',
    active: false,
    cooldown: 0,
  },
  golden_apple: {
    id: 'golden_apple',
    name: 'Golden Apple',
    icon: 'apple_gold',
    blurb: 'Space: heal 50% and gain absorption. One use.',
    active: true,
    cooldown: 0,
  },
  enchanted_apple: {
    id: 'enchanted_apple',
    name: 'Enchanted Golden Apple',
    icon: 'apple_ench',
    blurb: 'Space: full heal and 20 s of resistance. One use.',
    active: true,
    cooldown: 0,
  },
  elytra: {
    id: 'elytra',
    name: 'Elytra',
    icon: 'elytra',
    blurb: 'Space: dash forward (15 s cooldown).',
    active: true,
    cooldown: 15,
  },
  ender_pearl: {
    id: 'ender_pearl',
    name: 'Ender Pearl',
    icon: 'pearl',
    blurb: 'Space: teleport to the cursor (20 s cooldown).',
    active: true,
    cooldown: 20,
  },
  turtle_shell: {
    id: 'turtle_shell',
    name: 'Turtle Shell',
    icon: 'shell',
    blurb: 'Regenerate while standing still.',
    active: false,
    cooldown: 0,
  },
  fire_potion: {
    id: 'fire_potion',
    name: 'Fire Resistance Potion',
    icon: 'potion',
    blurb: 'Immune to fire and lava.',
    active: false,
    cooldown: 0,
  },
  rabbit_foot: {
    id: 'rabbit_foot',
    name: "Lucky Rabbit's Foot",
    icon: 'foot',
    blurb: '+15% luck.',
    active: false,
    cooldown: 0,
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
