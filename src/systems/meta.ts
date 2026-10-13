/** Turns the hero, pet, allies and permanent upgrades picked in the hub into run modifiers (BRIEF sections 6, 11, 12). */
import { ACCOUNT_KEY, applyUpgradeMods } from '../data/metaUpgrades';
import { allyById, heroById, petById, type PetDef } from '../data/companions';
import { kitOf } from '../data/heroKits';
import type { Mods } from '../data/upgrades';
import type { SaveData } from '../core/save';
import { Rng } from '../core/rng';
import { OVERWORLD_BIOMES, type BiomeId } from '../world/biomes';

export interface LoadoutCompanion {
  id: string;
  level: number;
}

export interface RunLoadout {
  hero: string;
  pet: LoadoutCompanion | null;
  allies: LoadoutCompanion[];
  /** Per-hero upgrade ranks for the chosen hero. */
  upgrades: Record<string, number>;
  /** Account-wide Kennel rank (pet buffs +10% per rank). */
  kennel: number;
  /** Leadership: second ally slot. */
  leadership: boolean;
  /** Shards (duplicates) collected for the chosen hero: they raise the ability rank (see abilityRank). */
  heroShards?: number;
  /** Optional start biome picked in the run setup (the hero spawns on dry ground inside it); absent = the usual meadow. */
  startBiome?: BiomeId;
}

/** Shards per ability rank, the rank cap and the per-rank bonuses (rank 1 is the base ability). */
export const SHARDS_PER_RANK = 5;
export const MAX_ABILITY_RANK = 5;
export const RANK_POWER = 0.08;
export const RANK_COOLDOWN = 0.04;

/** Ability rank 1..5 from the hero's shards: 1 + floor(shards / 5), capped. */
export function abilityRank(shards: number): number {
  return Math.max(
    1,
    Math.min(MAX_ABILITY_RANK, 1 + Math.floor(Math.max(0, shards) / SHARDS_PER_RANK)),
  );
}

/**
 * Relative odds of each overworld biome for a "Random" start. Plains stays the single most common start
 * (30%) but is no longer certain; the harder biomes (Dark Forest, Badlands) are the rarest. Every start biome
 * sits inside the 4-6 minute sword target in the balance simulator (BAL_BIOMES), see docs/BALANCE.md.
 */
export const RANDOM_START_WEIGHTS: Readonly<Record<string, number>> = {
  plains: 30,
  forest: 14,
  cherry_grove: 8,
  snowy_taiga: 8,
  desert: 8,
  swamp: 7,
  jungle: 7,
  dark_forest: 6,
  badlands: 6,
  mushroom_fields: 6,
};

/** The random start biome of a run seed (pure; a separate hash stream, so gameplay RNG is never touched). */
export function randomStartBiome(seed: number): BiomeId {
  const rng = new Rng((seed ^ 0x51a7b10e) >>> 0);
  rng.nextU32(); // decorrelate from nearby seeds
  let total = 0;
  for (const b of OVERWORLD_BIOMES) total += RANDOM_START_WEIGHTS[b] ?? 0;
  let r = rng.float() * total;
  for (const b of OVERWORLD_BIOMES) {
    r -= RANDOM_START_WEIGHTS[b] ?? 0;
    if (r < 0) return b;
  }
  return 'plains';
}

export interface StartBiomeInput {
  /** Biome picked in the run setup (absent = "Random"). */
  picked?: BiomeId | undefined;
  /** `?biome=` debug override: always wins. */
  debugBiome?: BiomeId | undefined;
  seed: number;
  /** The very first run (tutorial) always starts in the usual meadow. */
  firstRun: boolean;
  /** Debug runs (`?debug`) keep the meadow unless `?biome=` says otherwise, so seeded reviews stay comparable. */
  debug: boolean;
}

/** Where a run starts: undefined = the usual meadow around the origin, else a biome to move the hero into. */
export function resolveStartBiome(i: StartBiomeInput): BiomeId | undefined {
  if (i.debugBiome) return i.debugBiome;
  if (i.picked) return i.picked;
  if (i.firstRun || i.debug) return undefined;
  const b = randomStartBiome(i.seed);
  return b === 'plains' ? undefined : b;
}

export function defaultLoadout(): RunLoadout {
  return {
    hero: 'steve',
    pet: null,
    allies: [],
    upgrades: {},
    kennel: 0,
    leadership: false,
    heroShards: 0,
  };
}

export function maxAllySlots(save: SaveData): number {
  return (save.upgrades[ACCOUNT_KEY]?.['leadership'] ?? 0) > 0 ? 2 : 1;
}

/** Snapshot the equipped loadout from the save, dropping anything not owned (or ally overflow). */
export function loadoutFromSave(save: SaveData): RunLoadout {
  const owned = (id: string): LoadoutCompanion | null => {
    const o = save.owned[id];
    return o ? { id, level: o.level } : null;
  };
  const hero =
    save.owned[save.loadout.hero] && heroById(save.loadout.hero).id === save.loadout.hero
      ? save.loadout.hero
      : 'steve';
  const petId = save.loadout.pet;
  const pet = petId && petById(petId) ? owned(petId) : null;
  const slots = maxAllySlots(save);
  const allies: LoadoutCompanion[] = [];
  for (const id of new Set(save.loadout.allies)) {
    const c = allyById(id) ? owned(id) : null;
    if (c && allies.length < slots) allies.push(c);
  }
  return {
    hero,
    pet,
    allies,
    upgrades: { ...(save.upgrades[hero] ?? {}) },
    kennel: save.upgrades[ACCOUNT_KEY]?.['kennel'] ?? 0,
    leadership: slots > 1,
    heroShards: save.owned[hero]?.shards ?? 0,
  };
}

/** Buff value of a pet at its level, with the Kennel bonus applied. */
export function petValue(pet: PetDef, level: number, kennel: number): number {
  const v = pet.values[Math.max(0, Math.min(4, level - 1))] ?? 0;
  return v * (1 + kennel * 0.1);
}

function applyPet(l: RunLoadout, m: Mods): void {
  const def = l.pet ? petById(l.pet.id) : undefined;
  if (!def || !l.pet) return;
  const v = petValue(def, l.pet.level, l.kennel);
  const kennelK = 1 + l.kennel * 0.1;
  switch (def.effect) {
    case 'xp':
      m.xpMult += v / 100;
      break;
    case 'emeralds':
      m.payoutMult *= 1 + v / 100;
      break;
    case 'max_hp':
      m.maxHpBonus += v;
      break;
    case 'armor':
      m.armor += v;
      break;
    case 'speed':
      m.speed *= 1 + v / 100;
      break;
    case 'cat':
      m.explosionResist += v / 100;
      m.fuseBonus += (0.5 + (l.pet.level - 1) * 0.25) * kennelK;
      break;
    case 'parrot':
      m.magnet *= 1 + v / 100;
      break;
    case 'bee':
      m.poisonChance += v / 100;
      break;
    case 'frog':
      m.slimeXp += v / 100;
      break;
    case 'fox':
      m.luck += v / 100;
      m.emeraldDrop += (0.02 + (l.pet.level - 1) * 0.01) * kennelK;
      break;
    case 'turtle':
      m.turtleShield += v;
      break;
    case 'axolotl':
      m.healWater += v / 100;
      m.regen += 0.1 * l.pet.level * kennelK;
      break;
    case 'wolf_pup':
      m.dmg *= 1 + v / 100;
      break;
    case 'panda':
      m.cd *= 1 - v / 100;
      break;
    case 'strider':
      m.lavaImmune = true;
      m.lavaSpeed += v / 100;
      break;
    case 'duck':
      m.projSpeed *= 1 + v / 100;
      break;
    case 'moobloom':
      m.regen += v;
      break;
    case 'arctic_fox':
      m.chillDmg += v / 100;
      break;
    case 'toast':
      m.lootMult += v / 100;
      break;
    case 'pufferfish':
      m.thorns += v / 100;
      break;
    case 'polar_bear':
      m.frost = Math.max(m.frost, v);
      break;
    case 'toucan':
      m.eliteXp += v / 100;
      break;
    case 'magma_cow':
      m.fireResist = Math.min(0.9, m.fireResist + v / 100);
      break;
    case 'ocelot':
      m.critChance += v / 100;
      break;
    case 'mooshroom':
      m.stewHeal = Math.max(m.stewHeal, v / 100);
      break;
    case 'piggy_bank':
      m.chestEggs += v / 100;
      break;
    case 'golden_monkey':
      m.dodge = Math.min(0.5, m.dodge + v / 100);
      break;
    case 'bat':
      m.nightBoost += v / 100;
      m.nightVision += 0.3 * kennelK;
      break;
    case 'glare':
      m.bossDmg += v / 100;
      break;
    case 'wisp':
      m.revive = Math.max(m.revive, Math.min(1, v / 100));
      break;
  }
}

/** Add everything the loadout gives to `m` (called from RunState.recomputeStats after passives). */
export function applyLoadoutMods(l: RunLoadout, m: Mods): void {
  const hero = heroById(l.hero);
  m.dmg *= hero.dmg;
  m.speed *= hero.speed;
  kitOf(hero.id).mods?.(m, l);
  const bonusRanks = abilityRank(l.heroShards ?? 0) - 1;
  m.abilityPower *= 1 + RANK_POWER * bonusRanks;
  m.abilityCd *= 1 - RANK_COOLDOWN * bonusRanks;
  applyUpgradeMods(l.upgrades, m);
  applyPet(l, m);
  if (l.allies.some((a) => allyById(a.id)?.role === 'horse')) m.speed *= 1.2;
}

/** Base max HP of a hero (before bonuses); kits may scale it (Steve: +10% from Builder's Grit). */
export function heroBaseHp(heroId: string): number {
  const hero = heroById(heroId);
  return Math.round(hero.hp * (kitOf(hero.id).hpMult ?? 1));
}
