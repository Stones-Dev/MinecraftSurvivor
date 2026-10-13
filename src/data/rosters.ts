/**
 * Per-biome enemy rosters. The mobs themselves carry a `biomes` filter (husk: desert, stray: snowy
 * taiga, ...); this module decides how each biome reweights the generic pool (a desert has few plain
 * zombies because husks replace them), when a mob may appear earlier in a biome that favours it
 * (illagers in the dark forest), and how the biome's `danger` scales spawn density and HP.
 *
 * Everything here is a pure function of (biome, minute, night, water), so the spawner, the debug crowd
 * and the tests share one definition. Plains used to have no entry (minute 0 was 100% plain zombies and the
 * first three minutes only five mob types); it now has low-weight early variants, see `plains` below.
 */
import { BIOMES, type BiomeId } from '../world/biomes';
import { ENEMIES, type EnemyDef } from './enemies';

export interface BiomeRoster {
  /** Multiplier for generic mobs (no `biomes` filter) that are not listed in `mult`. Default 1. */
  base?: number;
  /** Weight multiplier per enemy id (0 removes the mob from the biome). */
  mult?: Readonly<Record<string, number>>;
  /** First minute per enemy id in this biome, replacing the mob's own `fromMinute`. */
  from?: Readonly<Record<string, number>>;
  /**
   * Admits a mob here with this absolute weight even though it is filtered to other biomes (or has weight 0,
   * like the slime halves), e.g. a swamp rabbit hopping through the meadow. Still honours `from`, `nightOnly`
   * and `nearWater`; `mult` scales it.
   */
  add?: Readonly<Record<string, number>>;
}

export const ROSTERS: Readonly<Partial<Record<BiomeId, BiomeRoster>>> = {
  // Early variety for the starting meadow. The first version (about 16% from minute 0) still left minute 0 at
  // 84% plain zombies (BUG-20), so the extras now carry about a third of the first minute: the jungle zombie
  // (a zombie reskin) and three slime skins (plain, pink, tropical: 12 HP, 3-4 damage, they split into weaker
  // halves) from the first second, the swamp rabbit from 0:30, then the quick biters (killer bunny, plains chomper)
  // at 1:00, so the opening stays gentle while the controls are learnt. Wolves, frozen zombies and mossy skeletons
  // follow at minute 2 and an earlier silverfish pack at minute 3. The frozen zombie must not come earlier: its
  // touch slows the hero for 2.5 s, which a first-minute player cannot yet handle (a balance run with it at minute 0
  // had three smart-bot deaths before 1:40, the plain roster none). The generic pool (zombie, skeleton, spider,
  // creeper, slime) is untouched. `from` takes fractional minutes.
  plains: {
    add: {
      jungle_zombie: 2.4,
      slime_medium: 1.2,
      pink_slime_medium: 0.8,
      tropical_slime_medium: 0.8,
      zombie_rabbit: 1.0,
      killer_bunny: 1.0,
      chomper_plains: 1.3,
      angry_brown_wolf: 1.4,
      frozen_zombie: 1.0,
      mossy_skeleton: 1.0,
    },
    from: {
      jungle_zombie: 0,
      slime_medium: 0,
      pink_slime_medium: 0,
      tropical_slime_medium: 0,
      zombie_rabbit: 0.5,
      killer_bunny: 1,
      chomper_plains: 1,
      angry_brown_wolf: 2,
      frozen_zombie: 2,
      mossy_skeleton: 2,
      silverfish: 3,
    },
  },
  // Forest and Dark Forest were 77% / 70% zombies at minute 0 (BUG-20): a slow slime and a jungle cousin join at once.
  forest: {
    mult: { spider: 1.3, witch: 0.5 },
    add: { slime_medium: 1.6, jungle_zombie: 1.2 },
    from: { chomper_forest: 0, angry_brown_wolf: 1, slime_medium: 0, jungle_zombie: 0 },
  },
  dark_forest: {
    mult: {
      zombie: 0.7,
      skeleton: 1.4,
      spider: 1.2,
      slime_big: 0,
      witch: 2.5,
      pillager: 1.5,
      vindicator: 1.5,
      evoker: 1.5,
    },
    add: { slime_medium: 1.5, jungle_zombie: 1.2 },
    from: {
      witch: 3,
      pillager: 5,
      vindicator: 5,
      evoker: 7,
      chomper_dark_forest: 0,
      slime_medium: 0,
      jungle_zombie: 0,
    },
  },
  snowy_taiga: {
    mult: {
      zombie: 0.45,
      skeleton: 0.5,
      spider: 0.25,
      creeper: 0.5,
      slime_big: 0,
      cave_spider: 0.5,
      drowned: 0.4,
      magma_cube_medium: 0,
    },
  },
  desert: {
    mult: {
      zombie: 0.3,
      skeleton: 0.8,
      spider: 0.4,
      cave_spider: 0.6,
      slime_big: 0,
      drowned: 0,
      witch: 0.7,
    },
  },
  badlands: {
    mult: {
      zombie: 0.25,
      husk: 0.7,
      skeleton: 1.3,
      spider: 0.3,
      creeper: 1.2,
      slime_big: 0,
      drowned: 0,
    },
  },
  swamp: {
    mult: {
      zombie: 0.5,
      skeleton: 0.3,
      spider: 0.6,
      creeper: 0.8,
      slime_big: 3,
      cave_spider: 1.5,
      witch: 0,
      drowned: 2.5,
    },
    from: { slime_big: 1, drowned: 2, zombie_rabbit: 0, lobber_zombie: 0 },
  },
  jungle: {
    mult: {
      zombie: 0.2,
      skeleton: 0.4,
      spider: 1.6,
      cave_spider: 2,
      creeper: 1.3,
      slime_big: 0,
    },
    from: { cave_spider: 2 },
  },
  cherry_grove: {
    mult: { zombie: 0.6, skeleton: 0.5, spider: 0.4, creeper: 0.5, slime_big: 0, cave_spider: 0.3 },
  },
  // Mushroom fields: almost no regular hostiles, the island's own rams and biters make up the crowd.
  mushroom_fields: { base: 0.2, mult: { slime_big: 0 } },
};

const EMPTY: BiomeRoster = {};

/** Spawn weight of a mob in a biome at a time (0 = not in the pool). */
export function spawnWeight(
  def: EnemyDef,
  biome: BiomeId,
  minute: number,
  night: boolean,
  water: boolean,
): number {
  const r = ROSTERS[biome] ?? EMPTY;
  const added = r.add?.[def.id];
  if (def.nightOnly && !night) return 0;
  if (def.nearWater && !water) return 0;
  const from = r.from?.[def.id] ?? def.fromMinute;
  if (from > minute) return 0;
  if (added !== undefined) return added * (r.mult?.[def.id] ?? 1);
  if (def.weight <= 0) return 0;
  if (def.biomes && !def.biomes.includes(biome)) return 0;
  const m = r.mult?.[def.id] ?? (def.biomes ? 1 : (r.base ?? 1));
  return def.weight * m;
}

export interface PoolEntry {
  def: EnemyDef;
  weight: number;
}

/** The weighted spawn pool of a biome (allocates; the spawner uses `pickEnemyId` instead). */
export function spawnPool(
  biome: BiomeId,
  minute: number,
  night: boolean,
  water: boolean,
): PoolEntry[] {
  const out: PoolEntry[] = [];
  for (const def of Object.values(ENEMIES)) {
    const weight = spawnWeight(def, biome, minute, night, water);
    if (weight > 0) out.push({ def, weight });
  }
  return out;
}

/** Weighted pick without allocating: `r01` is a uniform random number in [0, 1). */
export function pickEnemyId(
  biome: BiomeId,
  minute: number,
  night: boolean,
  water: boolean,
  r01: number,
): string {
  let total = 0;
  for (const id in ENEMIES) {
    const d = ENEMIES[id];
    if (d) total += spawnWeight(d, biome, minute, night, water);
  }
  let r = r01 * total;
  for (const id in ENEMIES) {
    const d = ENEMIES[id];
    if (!d) continue;
    const w = spawnWeight(d, biome, minute, night, water);
    if (w <= 0) continue;
    r -= w;
    if (r <= 0) return id;
  }
  return 'zombie';
}

/** Spawn density multiplier of a biome (its `danger`; plains is 1). */
export function biomeDensity(biome: BiomeId): number {
  return BIOMES[biome].danger;
}

/** HP multiplier of a biome: danger moves HP by 60% of its distance from 1 (plains stays 1). */
export function biomeHpMult(biome: BiomeId): number {
  return 1 + (BIOMES[biome].danger - 1) * 0.6;
}
