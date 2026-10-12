/** Permanent upgrades bought with Emeralds (BRIEF section 12.1). Per hero, plus two account-wide ones. */
import type { IconName } from '../ui/icons';
import type { Mods } from './upgrades';

export interface MetaUpgrade {
  id: string;
  name: string;
  icon: IconName;
  /** Number of ranks. */
  max: number;
  /** Cost of the first rank; later ranks grow linearly. */
  base: number;
  /** Account-wide (stored under the `account` pseudo-hero) instead of per hero. */
  account?: boolean;
  /** One-line effect text for a given rank (1-based). */
  text: (rank: number) => string;
}

export const ACCOUNT_KEY = 'account';

export const META_UPGRADES: MetaUpgrade[] = [
  {
    id: 'vitality',
    name: 'Vitality',
    icon: 'heart',
    max: 8,
    base: 60,
    text: (r) => `+${r * 8} max HP`,
  },
  {
    id: 'strength',
    name: 'Strength',
    icon: 'sword',
    max: 8,
    base: 80,
    text: (r) => `+${r * 4}% damage`,
  },
  {
    id: 'stride',
    name: 'Stride',
    icon: 'boots',
    max: 5,
    base: 70,
    text: (r) => `+${r * 2}% speed`,
  },
  {
    id: 'reflexes',
    name: 'Reflexes',
    icon: 'clock',
    max: 8,
    base: 90,
    text: (r) => `-${r * 2}% cooldowns`,
  },
  {
    id: 'chainmail',
    name: 'Chainmail Training',
    icon: 'helmet',
    max: 5,
    base: 100,
    text: (r) => `+${r} armor`,
  },
  {
    id: 'mending',
    name: 'Mending',
    icon: 'book',
    max: 8,
    base: 70,
    text: (r) => `+${(r * 0.1).toFixed(1)} HP/s regeneration`,
  },
  {
    id: 'magnet',
    name: 'Magnet',
    icon: 'magnet',
    max: 6,
    base: 50,
    text: (r) => `+${r * 8}% pickup radius`,
  },
  {
    id: 'wisdom',
    name: 'Wisdom',
    icon: 'xp_orb',
    max: 8,
    base: 70,
    text: (r) => `+${r * 4}% XP`,
  },
  {
    id: 'looting',
    name: 'Looting',
    icon: 'emerald',
    max: 10,
    base: 60,
    text: (r) => `+${r * 4}% Emeralds`,
  },
  {
    id: 'repertoire',
    name: 'Repertoire',
    icon: 'bow',
    max: 1,
    base: 600,
    text: () => 'Start each run with a second weapon',
  },
  {
    id: 'reroll',
    name: 'Reroll',
    icon: 'arrow_up',
    max: 3,
    base: 250,
    text: (r) => `+${r} reroll${r > 1 ? 's' : ''} per run`,
  },
  {
    id: 'leadership',
    name: 'Leadership',
    icon: 'star',
    max: 1,
    base: 900,
    account: true,
    text: () => 'Unlock a second ally slot (all heroes)',
  },
  {
    id: 'kennel',
    name: 'Kennel',
    icon: 'foot',
    max: 5,
    base: 150,
    account: true,
    text: (r) => `Pet buffs +${r * 10}% (all heroes)`,
  },
];

export const META_BY_ID = new Map(META_UPGRADES.map((u) => [u.id, u]));

/** Emeralds needed to buy rank `owned + 1` (owned = ranks already bought). */
export function upgradeCost(u: MetaUpgrade, owned: number): number {
  return Math.round(u.base * (1 + owned * 0.7));
}

/** Add the rank effects of per-hero upgrades into `m` (account upgrades are handled by the caller). */
export function applyUpgradeMods(ranks: Record<string, number>, m: Mods): void {
  const r = (id: string): number => ranks[id] ?? 0;
  m.maxHpBonus += r('vitality') * 8;
  m.dmg *= 1 + r('strength') * 0.04;
  m.speed *= 1 + r('stride') * 0.02;
  m.cd *= 1 - r('reflexes') * 0.02;
  m.armor += r('chainmail');
  m.regen += r('mending') * 0.1;
  m.magnet *= 1 + r('magnet') * 0.08;
  m.xpMult += r('wisdom') * 0.04;
  m.lootMult *= 1 + r('looting') * 0.04;
}
