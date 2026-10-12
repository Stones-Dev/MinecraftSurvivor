/** XP, level-ups and the card offer: weapons, passives, evolutions, armor and sword tiers (BRIEF section 7). */
import { ARMOR_TIERS, SWORD_TIERS } from '../data/tiers';
import {
  MAX_PASSIVE_LEVEL,
  MAX_PASSIVES,
  MAX_WEAPONS,
  PASSIVES,
  PASSIVE_IDS,
  type PassiveId,
} from '../data/upgrades';
import type { RunState } from '../game';
import type { IconName } from '../ui/icons';
import { MAX_WEAPON_LEVEL, newWeapon, WEAPON_IDS, WEAPONS } from '../weapons';
import type { WeaponId } from '../weapons/types';
import { xpToNext } from './economy';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Card {
  kind: 'weapon' | 'passive' | 'evolve' | 'armor' | 'sword' | 'emeralds';
  id: string;
  /** Level (or tier index) after taking the card. */
  level: number;
  isNew: boolean;
  title: string;
  desc: string;
  icon: IconName;
  rarity: Rarity;
  /** Gold card: an evolution. */
  gold: boolean;
}

export const SKIP_EMERALDS = 25;

const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, rare: 28, epic: 10, legendary: 2 };
const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

function tierRarity(index: number): Rarity {
  return index <= 2 ? 'common' : index <= 4 ? 'rare' : index === 5 ? 'epic' : 'legendary';
}

/** Every card the hero could take right now. */
export function candidateCards(run: RunState): Card[] {
  const pool: Card[] = [];
  const owned = new Map(run.weapons.map((w) => [w.id, w]));
  for (const id of WEAPON_IDS) {
    const def = WEAPONS[id];
    const w = owned.get(id);
    if (!w) {
      if (run.weapons.length < MAX_WEAPONS) {
        pool.push({
          kind: 'weapon',
          id,
          level: 1,
          isNew: true,
          title: def.name,
          desc: def.levels[0]?.blurb ?? '',
          icon: def.icon,
          rarity: 'common',
          gold: false,
        });
      }
    } else if (w.level < MAX_WEAPON_LEVEL) {
      pool.push({
        kind: 'weapon',
        id,
        level: w.level + 1,
        isNew: false,
        title: `${def.name} Lv ${w.level + 1}`,
        desc: def.levels[w.level]?.blurb ?? '',
        icon: def.icon,
        rarity: w.level + 1 >= 4 ? 'rare' : 'common',
        gold: false,
      });
    }
  }
  for (const id of PASSIVE_IDS) {
    const def = PASSIVES[id];
    const level = run.passives.get(id);
    if (level === undefined) {
      if (run.passives.size < MAX_PASSIVES) {
        pool.push({
          kind: 'passive',
          id,
          level: 1,
          isNew: true,
          title: def.name,
          desc: def.blurb(1),
          icon: def.icon,
          rarity: 'common',
          gold: false,
        });
      }
    } else if (level < MAX_PASSIVE_LEVEL) {
      pool.push({
        kind: 'passive',
        id,
        level: level + 1,
        isNew: false,
        title: `${def.name} Lv ${level + 1}`,
        desc: def.blurb(level + 1),
        icon: def.icon,
        rarity: level + 1 >= 4 ? 'rare' : 'common',
        gold: false,
      });
    }
  }
  const nextArmor = ARMOR_TIERS[run.armorTier + 1];
  if (nextArmor) {
    pool.push({
      kind: 'armor',
      id: nextArmor.id,
      level: run.armorTier + 1,
      isNew: false,
      title: `${nextArmor.name} armor`,
      desc: nextArmor.blurb,
      icon: 'helmet',
      rarity: tierRarity(run.armorTier + 1),
      gold: false,
    });
  }
  const nextSword = SWORD_TIERS[run.swordTier + 1];
  if (nextSword) {
    pool.push({
      kind: 'sword',
      id: nextSword.id,
      level: run.swordTier + 1,
      isNew: false,
      title: `${nextSword.name} sword`,
      desc: nextSword.blurb,
      icon: 'sword',
      rarity: tierRarity(run.swordTier + 1),
      gold: false,
    });
  }
  return pool;
}

/** Evolution cards available now: weapon at max level, not yet evolved, with its passive owned. */
export function evolutionCards(run: RunState): Card[] {
  const out: Card[] = [];
  for (const w of run.weapons) {
    const def = WEAPONS[w.id];
    if (w.level < MAX_WEAPON_LEVEL || w.evolved) continue;
    if (!run.passives.has(def.evolution.needs)) continue;
    out.push({
      kind: 'evolve',
      id: w.id,
      level: MAX_WEAPON_LEVEL,
      isNew: false,
      title: def.evolution.name,
      desc: def.evolution.blurb,
      icon: def.evolution.icon,
      rarity: 'legendary',
      gold: true,
    });
  }
  return out;
}

export function buildOffer(run: RunState): Card[] {
  const offer: Card[] = evolutionCards(run).slice(0, 1);
  const pool = candidateCards(run);
  const luck = run.mods.luck;
  while (offer.length < run.offerSize && pool.length > 0) {
    const weights = pool.map(
      (c) => RARITY_WEIGHT[c.rarity] * (1 + luck * RARITY_RANK[c.rarity] * 4),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let r = run.rng.levelup.float() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= weights[idx] ?? 0;
      if (r <= 0) break;
    }
    const [card] = pool.splice(idx, 1);
    if (card) offer.push(card);
  }
  while (offer.length < run.offerSize) {
    offer.push({
      kind: 'emeralds',
      id: 'emeralds',
      level: 0,
      isNew: false,
      title: 'Emeralds',
      desc: `+${SKIP_EMERALDS} emeralds.`,
      icon: 'emerald',
      rarity: 'common',
      gold: false,
    });
  }
  return offer;
}

export function applyCard(run: RunState, card: Card): void {
  switch (card.kind) {
    case 'weapon': {
      const w = run.weapons.find((x) => x.id === card.id);
      if (w) w.level = card.level;
      else run.weapons.push(newWeapon(card.id as WeaponId));
      break;
    }
    case 'passive':
      run.passives.set(card.id as PassiveId, card.level);
      break;
    case 'evolve': {
      const w = run.weapons.find((x) => x.id === card.id);
      if (w) w.evolved = true;
      break;
    }
    case 'armor':
      run.armorTier = card.level;
      break;
    case 'sword':
      run.swordTier = card.level;
      break;
    case 'emeralds':
      run.emeraldsPicked += SKIP_EMERALDS;
      break;
  }
  run.recomputeStats();
}

/** Add XP and queue level-ups; the screen opens the offer when `run.offer` is set. */
export function gainXp(run: RunState, amount: number): void {
  run.xp += amount;
  while (run.xp >= xpToNext(run.level)) {
    run.xp -= xpToNext(run.level);
    run.level++;
    run.pendingLevelups++;
  }
  if (run.pendingLevelups > 0 && run.offer === null) run.offer = buildOffer(run);
}

/** Close the current offer after a pick/skip and open the next queued one, if any. */
export function finishOffer(run: RunState): void {
  run.pendingLevelups = Math.max(0, run.pendingLevelups - 1);
  run.offer = run.pendingLevelups > 0 ? buildOffer(run) : null;
}
