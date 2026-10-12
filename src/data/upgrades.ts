import type { IconName } from '../ui/icons';

/** In-run passives (Phase 2 set; Phase 3 adds the full enchantment/potion list). */
export type PassiveId = 'sharpness' | 'quick_charge' | 'swiftness' | 'protection' | 'magnet';

export interface PassiveDef {
  id: PassiveId;
  name: string;
  icon: IconName;
  blurb: (level: number) => string;
}

export const MAX_PASSIVE_LEVEL = 5;
export const MAX_WEAPONS = 4;
export const MAX_PASSIVES = 4;

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  sharpness: {
    id: 'sharpness',
    name: 'Sharpness',
    icon: 'sword',
    blurb: (l) => `+${l * 10}% damage.`,
  },
  quick_charge: {
    id: 'quick_charge',
    name: 'Quick Charge',
    icon: 'clock',
    blurb: (l) => `-${l * 8}% cooldowns.`,
  },
  swiftness: {
    id: 'swiftness',
    name: 'Swiftness',
    icon: 'boots',
    blurb: (l) => `+${l * 6}% move speed.`,
  },
  protection: {
    id: 'protection',
    name: 'Protection',
    icon: 'shield',
    blurb: (l) => `+${l * 3} armor.`,
  },
  magnet: {
    id: 'magnet',
    name: 'Magnet',
    icon: 'magnet',
    blurb: (l) => `+${l * 30}% pickup radius.`,
  },
};

export const PASSIVE_IDS = Object.keys(PASSIVES) as PassiveId[];
