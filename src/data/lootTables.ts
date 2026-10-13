/**
 * Loot tables of world structures (v1.4). Pure data and pure rolls: `rollLoot` returns *symbolic* drops
 * (emeralds, an item, an upgrade...) and systems/structureInteract.ts applies them to the run, so tests can
 * check what a chest holds without a RunState.
 *
 * The roll of a chest is seeded from the world seed and the chest's prop id (`chestRng`), so the same chest
 * of the same world always holds the same loot, whoever opens it and whenever.
 */
import { Rng } from '../core/rng';
import type { ItemId } from './items';

export type LootDrop =
  | { kind: 'emeralds'; n: number }
  | { kind: 'spawnEgg'; n: number }
  | { kind: 'rareSpawnEgg'; n: number }
  | { kind: 'item'; id: ItemId }
  /** Instant heal, as a share of max HP (the second golden apple of the village chest, eaten on the spot). */
  | { kind: 'heal'; frac: number }
  /** Iron-tier sword or armor, or +1 level of an owned weapon when both are already iron or better. */
  | { kind: 'ironUpgrade' }
  /** Free enchantment choices (the "enchanted book"): `run.bonusOffers += n`. */
  | { kind: 'enchantBook'; n: number };

export type LootTableId =
  'village_chest' | 'pyramid_chest_0' | 'pyramid_chest_1' | 'pyramid_chest_2' | 'pyramid_chest_3';

/** Rolls: inclusive-ish integer range helper. */
function between(rng: Rng, lo: number, hi: number): number {
  return lo + rng.int(hi - lo + 1);
}

const ROLLS: Record<LootTableId, (rng: Rng) => LootDrop[]> = {
  // 30-60 emeralds, 2 golden apples (one kept as the run's item, one eaten), a guaranteed Spawn Egg and
  // one iron-tier upgrade.
  village_chest: (rng) => [
    { kind: 'emeralds', n: between(rng, 30, 60) },
    { kind: 'item', id: 'golden_apple' },
    { kind: 'heal', frac: 0.5 },
    { kind: 'spawnEgg', n: 1 },
    { kind: 'ironUpgrade' },
  ],
  // The four temple chests add up to 105-170 emeralds, an enchanted book (a free enchantment choice), a
  // Totem of Undying, a "diamond" (Rare Spawn Egg) and a random good item.
  pyramid_chest_0: (rng) => [
    { kind: 'emeralds', n: between(rng, 30, 45) },
    { kind: 'enchantBook', n: 1 },
  ],
  pyramid_chest_1: (rng) => [
    { kind: 'emeralds', n: between(rng, 25, 40) },
    { kind: 'item', id: 'totem' },
  ],
  pyramid_chest_2: (rng) => {
    const out: LootDrop[] = [
      { kind: 'emeralds', n: between(rng, 25, 40) },
      { kind: 'rareSpawnEgg', n: 1 },
    ];
    if (rng.chance(0.4)) out.push({ kind: 'spawnEgg', n: 1 });
    return out;
  },
  pyramid_chest_3: (rng) => {
    const out: LootDrop[] = [
      { kind: 'emeralds', n: between(rng, 25, 45) },
      {
        kind: 'item',
        id: rng.pick(['golden_apple', 'enchanted_apple', 'elytra', 'ender_pearl'] as const),
      },
    ];
    if (rng.chance(0.35)) out.push({ kind: 'enchantBook', n: 1 });
    return out;
  },
};

export const LOOT_TABLE_IDS = Object.keys(ROLLS) as LootTableId[];

export function rollLoot(table: LootTableId, rng: Rng): LootDrop[] {
  return ROLLS[table](rng);
}

/** Which table a structure chest uses: the village chest, or the temple chest of its index (0-3). */
export function chestTable(kind: 'chest_village' | 'chest_pyramid', index: number): LootTableId {
  if (kind === 'chest_village') return 'village_chest';
  return `pyramid_chest_${((index % 4) + 4) % 4}` as LootTableId;
}

/** Index of a structure chest from its prop id (`s:<key>:<n>`), for `chestTable`. */
export function chestIndexFromId(id: string): number {
  const n = Number(id.slice(id.lastIndexOf(':') + 1));
  return Number.isFinite(n) ? n : 0;
}

function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Deterministic roll stream of one chest. */
export function chestRng(worldSeed: number, propId: string): Rng {
  return new Rng((hashString(propId) ^ Math.imul(worldSeed | 0, 0x9e3779b1)) >>> 0);
}

/** What the iron upgrade does for a given hero state (pure; the system applies the result). */
export type IronResult =
  | { kind: 'sword'; tier: number }
  | { kind: 'armor'; tier: number }
  | { kind: 'weapon'; index: number }
  | { kind: 'emeralds'; n: number };

/** Tier indices of the iron sword (SWORD_IDS) and iron armor (ARMOR_IDS). */
export const IRON_SWORD_TIER = 2;
export const IRON_ARMOR_TIER = 3;

export function resolveIronUpgrade(
  state: {
    swordTier: number;
    armorTier: number;
    weapons: readonly { level: number }[];
    maxWeaponLevel: number;
  },
  rng: Rng,
): IronResult {
  const options: IronResult[] = [];
  if (state.swordTier < IRON_SWORD_TIER) options.push({ kind: 'sword', tier: IRON_SWORD_TIER });
  if (state.armorTier < IRON_ARMOR_TIER) options.push({ kind: 'armor', tier: IRON_ARMOR_TIER });
  if (options.length > 0) return rng.pick(options);
  const open = state.weapons
    .map((w, index) => ({ w, index }))
    .filter(({ w }) => w.level < state.maxWeaponLevel);
  if (open.length > 0) return { kind: 'weapon', index: rng.pick(open).index };
  return { kind: 'emeralds', n: 40 };
}
