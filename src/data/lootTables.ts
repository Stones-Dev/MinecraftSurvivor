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
  | { kind: 'enchantBook'; n: number }
  /** An exotic ranged weapon card (crossbow / trident): a new weapon, else +1 level (`resolveRangedWeapon`). */
  | { kind: 'rangedWeapon' }
  /** A burst of XP orbs worth `levels` level-ups at the hero's current level. */
  | { kind: 'xpBurst'; levels: number };

export type LootTableId =
  | 'village_chest'
  | 'pyramid_chest_0'
  | 'pyramid_chest_1'
  | 'pyramid_chest_2'
  | 'pyramid_chest_3'
  | 'jungle_chest'
  | 'trial_vault'
  | 'legendary_chest';

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
  // The Jungle Temple chest: an exotic ranged weapon card, always, plus a few emeralds.
  jungle_chest: (rng) => [{ kind: 'rangedWeapon' }, { kind: 'emeralds', n: between(rng, 35, 65) }],
  // The Trial Chamber vault (one Trial Key): the best strong haul of the early game. No wind charges exist,
  // so the "consumables" are emeralds.
  trial_vault: (rng) => [
    { kind: 'emeralds', n: between(rng, 70, 110) },
    { kind: 'enchantBook', n: 1 },
    { kind: 'item', id: rng.pick(['totem', 'enchanted_apple', 'elytra'] as const) },
    { kind: 'rareSpawnEgg', n: 1 },
    { kind: 'xpBurst', levels: 1 },
    { kind: 'ironUpgrade' },
  ],
  // Hero of the Village: the legendary chest that appears in the plaza after a raid is repelled.
  legendary_chest: (rng) => [
    { kind: 'emeralds', n: between(rng, 90, 150) },
    { kind: 'enchantBook', n: 2 },
    { kind: 'item', id: rng.pick(['totem', 'enchanted_apple', 'elytra', 'ender_pearl'] as const) },
    { kind: 'rareSpawnEgg', n: 1 },
    { kind: 'spawnEgg', n: 1 },
    { kind: 'ironUpgrade' },
    { kind: 'xpBurst', levels: 1 },
  ],
};

export const LOOT_TABLE_IDS = Object.keys(ROLLS) as LootTableId[];

export function rollLoot(table: LootTableId, rng: Rng): LootDrop[] {
  return ROLLS[table](rng);
}

export type StructureChestKind =
  'chest_village' | 'chest_pyramid' | 'chest_jungle' | 'vault' | 'chest_legendary';

/** Which table a structure chest uses: the village chest, or the temple chest of its index (0-3), or a part-2 chest. */
export function chestTable(kind: StructureChestKind, index: number): LootTableId {
  switch (kind) {
    case 'chest_village':
      return 'village_chest';
    case 'chest_jungle':
      return 'jungle_chest';
    case 'vault':
      return 'trial_vault';
    case 'chest_legendary':
      return 'legendary_chest';
    default:
      return `pyramid_chest_${((index % 4) + 4) % 4}` as LootTableId;
  }
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

/** What an exotic ranged weapon card does for a given hero state (pure; the system applies the result). */
export type RangedResult =
  | { kind: 'weapon'; id: 'crossbow' | 'trident' }
  | { kind: 'upgrade'; index: number }
  | { kind: 'emeralds'; n: number };

const EXOTIC_RANGED = ['crossbow', 'trident'] as const;
/** Weapons that count as ranged when a full hero can only raise a level. */
const RANGED_IDS = ['crossbow', 'trident', 'bow'];

/**
 * The jungle chest's weapon: a crossbow or a trident the hero does not own (if a slot is free), else +1 level on
 * an owned ranged weapon (exotic ones first), else +1 level on any weapon, else emeralds.
 */
export function resolveRangedWeapon(
  state: {
    weapons: readonly { id: string; level: number }[];
    maxWeapons: number;
    maxWeaponLevel: number;
  },
  rng: Rng,
): RangedResult {
  const owned = new Set(state.weapons.map((w) => w.id));
  const fresh = EXOTIC_RANGED.filter((id) => !owned.has(id));
  if (fresh.length > 0 && state.weapons.length < state.maxWeapons)
    return { kind: 'weapon', id: rng.pick(fresh) };
  const raisable = (ids: readonly string[] | null): number[] =>
    state.weapons
      .map((w, index) => ({ w, index }))
      .filter(({ w }) => w.level < state.maxWeaponLevel && (ids === null || ids.includes(w.id)))
      .map(({ index }) => index);
  for (const ids of [EXOTIC_RANGED as readonly string[], RANGED_IDS, null]) {
    const open = raisable(ids);
    if (open.length > 0) return { kind: 'upgrade', index: rng.pick(open) };
  }
  return { kind: 'emeralds', n: 40 };
}
