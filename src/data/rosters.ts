/**
 * Per-biome enemy rosters. The mobs themselves carry a `biomes` filter (husk: desert, stray: snowy
 * taiga, ...); this module decides how each biome reweights the generic pool (a desert has few plain
 * zombies because husks replace them), when a mob may appear earlier in a biome that favours it
 * (illagers in the dark forest), and how the biome's `danger` scales spawn density and HP.
 *
 * Everything here is a pure function of (biome, minute, night, water), so the spawner, the debug crowd
 * and the tests share one definition. Plains has no entry: the starting meadow keeps the exact
 * pre-biome pool and curve.
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
}

export const ROSTERS: Readonly<Partial<Record<BiomeId, BiomeRoster>>> = {
  forest: { mult: { spider: 1.3, witch: 0.5 } },
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
    from: { witch: 3, pillager: 5, vindicator: 5, evoker: 7 },
  },
  snowy_taiga: {
    mult: { zombie: 0.45, skeleton: 0.5, spider: 0.25, creeper: 0.5, slime_big: 0, cave_spider: 0.5, drowned: 0.4 },
  },
  desert: {
    mult: { zombie: 0.3, skeleton: 0.8, spider: 0.4, cave_spider: 0.6, slime_big: 0, drowned: 0, witch: 0.7 },
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
    from: { slime_big: 1, drowned: 2 },
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
  if (def.weight <= 0) return 0;
  if (def.biomes && !def.biomes.includes(biome)) return 0;
  if (def.nightOnly && !night) return 0;
  if (def.nearWater && !water) return 0;
  const r = ROSTERS[biome] ?? EMPTY;
  const from = r.from?.[def.id] ?? def.fromMinute;
  if (from > minute) return 0;
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
