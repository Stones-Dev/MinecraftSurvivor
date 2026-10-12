/**
 * The Spawner (BRIEF section 12): data-driven banners, seeded pulls (`gachaSeed` + pull index),
 * x10 guarantee of at least a Rare and a Legendary pity counter. Pure logic over a SaveData.
 */
import {
  COMPANION_BY_ID,
  COMPANIONS,
  DUPE_EMERALDS,
  DUPES_FOR_LEVEL,
  MAX_COMPANION_LEVEL,
  RARITY_ORDER,
  type CompanionRarity,
} from '../data/companions';
import { Rng } from '../core/rng';
import type { SaveData } from '../core/save';

export interface Banner {
  id: string;
  name: string;
  /** Percent per rarity; must sum to 100. */
  rates: Record<CompanionRarity, number>;
  /** Companion ids per rarity. */
  pool: Record<CompanionRarity, string[]>;
  /** A Legendary is guaranteed once this many pulls pass without one. */
  pity: number;
  /** A x10 pull contains at least one companion of this rarity or better. */
  tenGuarantee: CompanionRarity;
}

function poolFor(rarity: CompanionRarity): string[] {
  return COMPANIONS.filter((c) => c.rarity === rarity && c.id !== 'steve').map((c) => c.id);
}

export const OVERWORLD_BANNER: Banner = {
  id: 'overworld',
  name: 'Overworld Spawner',
  rates: { common: 50, uncommon: 28, rare: 15, epic: 5.5, legendary: 1.5 },
  pool: {
    common: poolFor('common'),
    uncommon: poolFor('uncommon'),
    rare: poolFor('rare'),
    epic: poolFor('epic'),
    legendary: poolFor('legendary'),
  },
  pity: 60,
  tenGuarantee: 'rare',
};

export const BANNERS: Banner[] = [OVERWORLD_BANNER];

export function bannerById(id: string): Banner {
  return BANNERS.find((b) => b.id === id) ?? OVERWORLD_BANNER;
}

export interface PullResult {
  id: string;
  rarity: CompanionRarity;
  /** 1-based pull number on this save (also the seed offset). */
  index: number;
  isNew: boolean;
  /** Level after the pull. */
  level: number;
  /** Emeralds refunded (max-level companions and hero duplicates). */
  refund: number;
  /** True when the pity counter forced this Legendary. */
  pityHit: boolean;
  /** True when the x10 guarantee upgraded this pull. */
  guaranteed: boolean;
  /** Hero duplicates: shards added. */
  shards: number;
}

/** Rarity roll from a uniform value in [0, 1). */
export function rollRarity(banner: Banner, u: number): CompanionRarity {
  let acc = 0;
  const total = RARITY_ORDER.reduce((s, r) => s + banner.rates[r], 0);
  for (const r of RARITY_ORDER) {
    acc += banner.rates[r] / total;
    if (u < acc) return r;
  }
  return 'common';
}

function rankOf(r: CompanionRarity): number {
  return RARITY_ORDER.indexOf(r);
}

/** Deterministic rng for pull number `index` of a save. */
export function pullRng(seed: number, index: number): Rng {
  let h = (seed ^ Math.imul(index, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return new Rng((h ^ (h >>> 16)) >>> 0);
}

/** Rarity at least `min`: re-weights the rates among the allowed tiers. */
function rollAtLeast(banner: Banner, min: CompanionRarity, u: number): CompanionRarity {
  const allowed = RARITY_ORDER.filter((r) => rankOf(r) >= rankOf(min));
  const total = allowed.reduce((s, r) => s + banner.rates[r], 0);
  let acc = 0;
  for (const r of allowed) {
    acc += banner.rates[r] / total;
    if (u < acc) return r;
  }
  return allowed[allowed.length - 1] ?? 'rare';
}

/** Duplicates required to reach `level` from level 1. */
export function dupesToReach(level: number): number {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += DUPES_FOR_LEVEL[l - 1] ?? 0;
  return sum;
}

type Grant = Pick<PullResult, 'isNew' | 'level' | 'refund' | 'shards'>;

function grant(save: SaveData, id: string, rarity: CompanionRarity, now: number): Grant {
  const def = COMPANION_BY_ID.get(id);
  const owned = save.owned[id];
  if (!owned) {
    save.owned[id] = { level: 1, shards: 0, obtainedAt: now };
    return { isNew: true, level: 1, refund: 0, shards: 0 };
  }
  if (def?.kind === 'hero') {
    owned.shards += 5;
    save.currencies.emeralds += 500;
    return { isNew: false, level: owned.level, refund: 500, shards: 5 };
  }
  if (owned.level >= MAX_COMPANION_LEVEL) {
    const refund = DUPE_EMERALDS[rarity];
    save.currencies.emeralds += refund;
    return { isNew: false, level: owned.level, refund, shards: 0 };
  }
  owned.shards++;
  while (owned.level < MAX_COMPANION_LEVEL && owned.shards >= dupesToReach(owned.level + 1)) {
    owned.level++;
  }
  return { isNew: false, level: owned.level, refund: 0, shards: 0 };
}

/**
 * Perform `count` pulls (1 or 10) on a banner, mutating `save` (pull counter, pity, collection,
 * currencies). The tickets must be spent by the caller.
 */
export function pull(
  save: SaveData,
  banner: Banner,
  count: number,
  now = Date.now(),
): PullResult[] {
  const results: PullResult[] = [];
  const ten = count === 10;
  for (let i = 0; i < count; i++) {
    save.pullCount++;
    const rng = pullRng(save.gachaSeed, save.pullCount);
    let pity = save.pity[banner.id] ?? 0;
    let rarity = rollRarity(banner, rng.float());
    let pityHit = false;
    let guaranteed = false;
    if (pity + 1 >= banner.pity) {
      pityHit = rarity !== 'legendary';
      rarity = 'legendary';
    } else if (
      ten &&
      i === count - 1 &&
      !results.some((r) => rankOf(r.rarity) >= rankOf(banner.tenGuarantee)) &&
      rankOf(rarity) < rankOf(banner.tenGuarantee)
    ) {
      rarity = rollAtLeast(banner, banner.tenGuarantee, rng.float());
      guaranteed = true;
    }
    pity = rarity === 'legendary' ? 0 : pity + 1;
    save.pity[banner.id] = pity;
    const ids = banner.pool[rarity];
    const id = ids[rng.int(ids.length)] ?? 'chicken';
    const g = grant(save, id, rarity, now);
    results.push({ id, rarity, index: save.pullCount, pityHit, guaranteed, ...g });
  }
  return results;
}

/** Spend tickets for a pull: x1 costs a Spawn Egg, x10 a Rare Spawn Egg. Returns null if short. */
export function spendAndPull(
  save: SaveData,
  banner: Banner,
  count: 1 | 10,
  now = Date.now(),
): PullResult[] | null {
  if (count === 1) {
    if (save.currencies.spawnEggs < 1) return null;
    save.currencies.spawnEggs--;
  } else {
    if (save.currencies.rareSpawnEggs < 1) return null;
    save.currencies.rareSpawnEggs--;
  }
  return pull(save, banner, count, now);
}
