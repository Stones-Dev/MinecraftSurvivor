import type { RGB } from '../core/pixelart';

export type BiomeId = 'plains' | 'dark_forest' | 'snowy_taiga' | 'desert';

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
  /** Which tree sprite the biome uses (oak/birch, dark oak, spruce) or none (desert uses cacti). */
  treeKind: 'mixed' | 'dark_oak' | 'spruce' | 'none';
  /** Chance per cell of a cactus (desert). */
  cactusBase: number;
  /** Water is frozen into slippery ice. */
  iceWater: boolean;
  /** Lava pools exist. */
  lava: boolean;
  /** Snowfall slows the hero (taiga). */
  snow: boolean;
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
    treeKind: 'mixed',
    cactusBase: 0,
    iceWater: false,
    lava: false,
    snow: false,
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
    treeKind: 'dark_oak',
    cactusBase: 0,
    iceWater: false,
    lava: false,
    snow: false,
  },
  snowy_taiga: {
    id: 'snowy_taiga',
    name: 'Snowy Taiga',
    grass: [
      [224, 234, 242],
      [244, 249, 253],
      [200, 214, 228],
    ],
    dirt: [
      [118, 98, 88],
      [140, 118, 104],
      [94, 78, 70],
    ],
    sand: [
      [198, 212, 230],
      [178, 194, 214],
    ],
    water: [
      [168, 214, 240],
      [200, 232, 250],
      [138, 188, 224],
      [240, 250, 255],
    ],
    leaves: [
      [34, 84, 56],
      [48, 104, 70],
      [24, 64, 44],
    ],
    trunk: [
      [84, 58, 36],
      [60, 40, 26],
    ],
    treeBase: 0.16,
    groveBonus: 0.3,
    dirtThreshold: 0.72,
    treeKind: 'spruce',
    cactusBase: 0,
    iceWater: true,
    lava: false,
    snow: true,
  },
  desert: {
    id: 'desert',
    name: 'Desert',
    grass: [
      [222, 198, 130],
      [236, 214, 150],
      [204, 178, 112],
    ],
    dirt: [
      [184, 110, 62],
      [200, 126, 74],
      [150, 88, 48],
    ],
    sand: [
      [240, 222, 160],
      [220, 200, 140],
    ],
    water: [
      [48, 120, 200],
      [80, 150, 226],
      [36, 96, 170],
      [160, 210, 255],
    ],
    leaves: [
      [78, 140, 60],
      [100, 164, 76],
      [56, 104, 44],
    ],
    trunk: [
      [112, 78, 46],
      [82, 56, 32],
    ],
    treeBase: 0,
    groveBonus: 0,
    dirtThreshold: 0.64,
    treeKind: 'none',
    cactusBase: 0.05,
    iceWater: false,
    lava: true,
    snow: false,
  },
};

/** Biomes rotate in this order every 4 minutes (BRIEF section 7). */
export const BIOME_ORDER: readonly BiomeId[] = ['plains', 'dark_forest', 'snowy_taiga', 'desert'];
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
