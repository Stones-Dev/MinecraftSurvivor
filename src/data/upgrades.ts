import type { IconName } from '../ui/icons';

/** Numeric modifiers every system reads; rebuilt from passives, tiers and items by RunState.recomputeStats. */
export interface Mods {
  /** Damage multiplier (all sources). */
  dmg: number;
  /** Extra multiplier for projectiles only (Power). */
  projDmg: number;
  /** Cooldown multiplier (lower = faster). */
  cd: number;
  /** Area / radius multiplier. */
  area: number;
  /** Duration multiplier for pools, fuses and statuses (Infinity). */
  duration: number;
  projSpeed: number;
  /** Extra projectiles per volley (Multishot). */
  projCount: number;
  pierce: number;
  knock: number;
  /** Chance that a melee hit sets the enemy on fire (Fire Aspect). */
  burnChance: number;
  /** Chance that a projectile hit ignites (Flame). */
  flame: number;
  /** Reflected damage fraction of contact hits (Thorns). */
  thorns: number;
  lootMult: number;
  luck: number;
  regen: number;
  armor: number;
  maxHpBonus: number;
  /** Incoming damage multiplier (Resistance). */
  dmgTaken: number;
  healOnKill: number;
  speed: number;
  magnet: number;
  xpMult: number;
  waterImmune: boolean;
  /** Frost aura radius in px around the hero (Frost Walker). */
  frost: number;
  nightVision: number;
  haste: number;
}

export function baseMods(): Mods {
  return {
    dmg: 1,
    projDmg: 1,
    cd: 1,
    area: 1,
    duration: 1,
    projSpeed: 1,
    projCount: 0,
    pierce: 0,
    knock: 1,
    burnChance: 0,
    flame: 0,
    thorns: 0,
    lootMult: 1,
    luck: 0,
    regen: 0.4,
    armor: 0,
    maxHpBonus: 0,
    dmgTaken: 1,
    healOnKill: 0,
    speed: 1,
    magnet: 1,
    xpMult: 1,
    waterImmune: false,
    frost: 0,
    nightVision: 0,
    haste: 0,
  };
}

export type PassiveId =
  | 'sharpness'
  | 'knockback'
  | 'fire_aspect'
  | 'looting'
  | 'sweeping_edge'
  | 'power'
  | 'multishot'
  | 'piercing'
  | 'quick_charge'
  | 'flame'
  | 'infinity'
  | 'thorns'
  | 'protection'
  | 'depth_strider'
  | 'frost_walker'
  | 'mending'
  | 'speed'
  | 'strength'
  | 'regeneration'
  | 'resistance'
  | 'haste'
  | 'absorption'
  | 'luck'
  | 'night_vision';

export interface PassiveDef {
  id: PassiveId;
  name: string;
  kind: 'enchantment' | 'potion';
  icon: IconName;
  blurb: (level: number) => string;
  apply: (level: number, m: Mods) => void;
}

export const MAX_PASSIVE_LEVEL = 5;
export const MAX_WEAPONS = 4;
export const MAX_PASSIVES = 4;

const pct = (v: number): string => `${Math.round(v * 100)}%`;

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  sharpness: {
    id: 'sharpness',
    name: 'Sharpness',
    kind: 'enchantment',
    icon: 'sword',
    blurb: (l) => `+${pct(0.1 * l)} damage.`,
    apply: (l, m) => void (m.dmg += 0.1 * l),
  },
  knockback: {
    id: 'knockback',
    name: 'Knockback',
    kind: 'enchantment',
    icon: 'arrow_up',
    blurb: (l) => `+${pct(0.25 * l)} knockback.`,
    apply: (l, m) => void (m.knock += 0.25 * l),
  },
  fire_aspect: {
    id: 'fire_aspect',
    name: 'Fire Aspect',
    kind: 'enchantment',
    icon: 'flame',
    blurb: (l) => `${pct(0.12 * l)} chance to ignite on melee hits.`,
    apply: (l, m) => void (m.burnChance += 0.12 * l),
  },
  looting: {
    id: 'looting',
    name: 'Looting',
    kind: 'enchantment',
    icon: 'emerald',
    blurb: (l) => `+${pct(0.15 * l)} emeralds and drops.`,
    apply: (l, m) => void (m.lootMult += 0.15 * l),
  },
  sweeping_edge: {
    id: 'sweeping_edge',
    name: 'Sweeping Edge',
    kind: 'enchantment',
    icon: 'sweep',
    blurb: (l) => `+${pct(0.08 * l)} attack area.`,
    apply: (l, m) => void (m.area += 0.08 * l),
  },
  power: {
    id: 'power',
    name: 'Power',
    kind: 'enchantment',
    icon: 'arrow',
    blurb: (l) => `+${pct(0.1 * l)} projectile damage.`,
    apply: (l, m) => void (m.projDmg += 0.1 * l),
  },
  multishot: {
    id: 'multishot',
    name: 'Multishot',
    kind: 'enchantment',
    icon: 'bow',
    blurb: (l) =>
      l >= 5 ? '+2 projectiles.' : l >= 3 ? '+1 projectile.' : '+1 projectile at level 3.',
    apply: (l, m) => void (m.projCount += (l >= 3 ? 1 : 0) + (l >= 5 ? 1 : 0)),
  },
  piercing: {
    id: 'piercing',
    name: 'Piercing',
    kind: 'enchantment',
    icon: 'trident',
    blurb: (l) => `Projectiles pierce ${Math.floor((l + 1) / 2)} more.`,
    apply: (l, m) => void (m.pierce += Math.floor((l + 1) / 2)),
  },
  quick_charge: {
    id: 'quick_charge',
    name: 'Quick Charge',
    kind: 'enchantment',
    icon: 'clock',
    blurb: (l) => `-${pct(0.08 * l)} cooldowns.`,
    apply: (l, m) => void (m.cd -= 0.08 * l),
  },
  flame: {
    id: 'flame',
    name: 'Flame',
    kind: 'enchantment',
    icon: 'campfire',
    blurb: (l) => `${pct(0.2 * l)} chance for projectiles to ignite.`,
    apply: (l, m) => void (m.flame += 0.2 * l),
  },
  infinity: {
    id: 'infinity',
    name: 'Infinity',
    kind: 'enchantment',
    icon: 'star',
    blurb: (l) => `+${pct(0.15 * l)} duration of pools and effects.`,
    apply: (l, m) => void (m.duration += 0.15 * l),
  },
  thorns: {
    id: 'thorns',
    name: 'Thorns',
    kind: 'enchantment',
    icon: 'thorns',
    blurb: (l) => `Reflect ${pct(0.3 * l)} of contact damage.`,
    apply: (l, m) => void (m.thorns += 0.3 * l),
  },
  protection: {
    id: 'protection',
    name: 'Protection',
    kind: 'enchantment',
    icon: 'shield',
    blurb: (l) => `+${l * 3} armor.`,
    apply: (l, m) => void (m.armor += 3 * l),
  },
  depth_strider: {
    id: 'depth_strider',
    name: 'Depth Strider',
    kind: 'enchantment',
    icon: 'droplet',
    blurb: () => 'Water does not slow you; +3% speed per level.',
    apply: (l, m) => {
      m.waterImmune = true;
      m.speed += 0.03 * l;
    },
  },
  frost_walker: {
    id: 'frost_walker',
    name: 'Frost Walker',
    kind: 'enchantment',
    icon: 'snowflake',
    blurb: (l) => `Enemies near you are slowed (${12 + 6 * l} px aura).`,
    apply: (l, m) => void (m.frost = 12 + 6 * l),
  },
  mending: {
    id: 'mending',
    name: 'Mending',
    kind: 'enchantment',
    icon: 'cross',
    blurb: (l) => `Heal ${(0.5 * l).toFixed(1)} HP per kill.`,
    apply: (l, m) => void (m.healOnKill += 0.5 * l),
  },
  speed: {
    id: 'speed',
    name: 'Speed',
    kind: 'potion',
    icon: 'boots',
    blurb: (l) => `+${pct(0.06 * l)} move speed.`,
    apply: (l, m) => void (m.speed += 0.06 * l),
  },
  strength: {
    id: 'strength',
    name: 'Strength',
    kind: 'potion',
    icon: 'potion',
    blurb: (l) => `+${pct(0.12 * l)} damage.`,
    apply: (l, m) => void (m.dmg += 0.12 * l),
  },
  regeneration: {
    id: 'regeneration',
    name: 'Regeneration',
    kind: 'potion',
    icon: 'heart',
    blurb: (l) => `Regenerate ${(0.35 * l).toFixed(2)} HP per second.`,
    apply: (l, m) => void (m.regen += 0.35 * l),
  },
  resistance: {
    id: 'resistance',
    name: 'Resistance',
    kind: 'potion',
    icon: 'helmet',
    blurb: (l) => `-${pct(0.06 * l)} damage taken.`,
    apply: (l, m) => void (m.dmgTaken -= 0.06 * l),
  },
  haste: {
    id: 'haste',
    name: 'Haste',
    kind: 'potion',
    icon: 'feather',
    blurb: (l) => `-${pct(0.05 * l)} cooldowns, +2% speed.`,
    apply: (l, m) => {
      m.cd -= 0.05 * l;
      m.haste += l;
      m.speed += 0.02 * l;
    },
  },
  absorption: {
    id: 'absorption',
    name: 'Absorption',
    kind: 'potion',
    icon: 'apple_gold',
    blurb: (l) => `+${10 * l} max HP.`,
    apply: (l, m) => void (m.maxHpBonus += 10 * l),
  },
  luck: {
    id: 'luck',
    name: 'Luck',
    kind: 'potion',
    icon: 'clover',
    blurb: (l) => `+${pct(0.04 * l)} luck (rarer cards and drops).`,
    apply: (l, m) => void (m.luck += 0.04 * l),
  },
  night_vision: {
    id: 'night_vision',
    name: 'Night Vision',
    kind: 'potion',
    icon: 'eye',
    blurb: (l) => `Nights are ${pct(0.2 * l)} brighter.`,
    apply: (l, m) => void (m.nightVision += 0.2 * l),
  },
};

export const PASSIVE_IDS = Object.keys(PASSIVES) as PassiveId[];
