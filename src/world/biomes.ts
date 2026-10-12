import type { RGB } from '../core/pixelart';

export type BiomeId = 'plains' | 'dark_forest';

export interface Biome {
  id: BiomeId;
  name: string;
  grass: readonly [RGB, RGB, RGB]; // base, light, dark
  dirt: readonly [RGB, RGB, RGB];
  sand: readonly [RGB, RGB];
  water: readonly [RGB, RGB, RGB, RGB]; // base, light, dark, foam
  leaves: readonly [RGB, RGB, RGB];
  trunk: readonly [RGB, RGB];
  /** Chance per 2x2-tile cell of a tree, and the extra chance inside groves. */
  treeBase: number;
  groveBonus: number;
  /** Noise level above which grass turns to dirt (lower = more dirt). */
  dirtThreshold: number;
}

export const BIOMES: Record<BiomeId, Biome> = {
  plains: {
    id: 'plains',
    name: 'Plains',
    grass: [
      [96, 156, 58],
      [117, 178, 72],
      [78, 134, 48],
    ],
    dirt: [
      [138, 92, 54],
      [158, 108, 66],
      [114, 74, 42],
    ],
    sand: [
      [222, 206, 140],
      [204, 186, 120],
    ],
    water: [
      [58, 112, 214],
      [88, 142, 236],
      [44, 88, 176],
      [168, 205, 255],
    ],
    leaves: [
      [76, 148, 52],
      [104, 176, 70],
      [54, 112, 40],
    ],
    trunk: [
      [112, 78, 46],
      [82, 56, 32],
    ],
    treeBase: 0.05,
    groveBonus: 0.3,
    dirtThreshold: 0.75,
  },
  dark_forest: {
    id: 'dark_forest',
    name: 'Dark Forest',
    grass: [
      [62, 104, 44],
      [78, 124, 54],
      [46, 82, 34],
    ],
    dirt: [
      [104, 76, 48],
      [124, 90, 56],
      [80, 58, 36],
    ],
    sand: [
      [190, 176, 120],
      [170, 156, 102],
    ],
    water: [
      [44, 84, 160],
      [66, 108, 186],
      [34, 64, 128],
      [130, 168, 220],
    ],
    leaves: [
      [40, 86, 38],
      [58, 112, 48],
      [28, 62, 30],
    ],
    trunk: [
      [78, 54, 34],
      [56, 38, 24],
    ],
    treeBase: 0.3,
    groveBonus: 0.3,
    dirtThreshold: 0.68,
  },
};

/** Biomes rotate in this order; Phase 3 appends Snowy Taiga and Desert. */
export const BIOME_ORDER: readonly BiomeId[] = ['plains', 'dark_forest'];
export const BIOME_PERIOD = 240; // seconds per biome
export const BIOME_FADE = 2.5; // palette crossfade seconds

export interface BiomeState {
  current: BiomeId;
  previous: BiomeId | null;
  /** 0..1, 1 once the crossfade has finished. */
  fade: number;
}

export function biomeState(t: number): BiomeState {
  const n = BIOME_ORDER.length;
  const period = Math.max(0, Math.floor(t / BIOME_PERIOD));
  const current = BIOME_ORDER[period % n] ?? 'plains';
  if (period === 0) return { current, previous: null, fade: 1 };
  const fade = Math.min(1, (t - period * BIOME_PERIOD) / BIOME_FADE);
  const previous = BIOME_ORDER[(period - 1 + n) % n] ?? null;
  return { current, previous: fade < 1 ? previous : null, fade };
}
