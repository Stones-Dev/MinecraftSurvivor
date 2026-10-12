/**
 * Biome data: palettes, vegetation, terrain flavour and flags. Where each biome lies in the world is
 * decided by the spatial biome map (biomeMap.ts); this file is pure data plus the legacy time rotation.
 */
import type { RGB } from '../core/pixelart';
import type { ThemeId } from '../data/music';

export type BiomeId =
  | 'plains'
  | 'forest'
  | 'dark_forest'
  | 'snowy_taiga'
  | 'desert'
  | 'swamp'
  | 'jungle'
  | 'badlands'
  | 'cherry_grove'
  | 'mushroom_fields'
  | 'nether';

/**
 * Material family of the walkable ground. DATA ONLY for now: the current painter colours every family
 * with the `grass` palette below; the block-texture painter is expected to pick a texture per family
 * (grass block top, sand, red sand, snow, mud, mycelium, podzol, netherrack).
 */
export type GroundFamily =
  'grass' | 'podzol' | 'sand' | 'red_sand' | 'snow' | 'mud' | 'mycelium' | 'netherrack';

/**
 * Screen-space ambience the biome asks for (drawn by render/ambient.ts, which also mixes in night
 * fireflies and a few extras per biome; `ambient` is the biome's main particle kind).
 */
export type Ambient =
  'none' | 'snow' | 'petals' | 'fireflies' | 'dust' | 'spores' | 'leaves' | 'pollen' | 'embers';

/** Which tree mix grows (see props.ts genProps for the sprite types each one maps to). */
export type TreeKind =
  | 'mixed' // oak with some birch
  | 'birch_mix' // forest: oak and plenty of birch
  | 'dark_oak'
  | 'spruce'
  | 'swamp' // oaks (vines later)
  | 'jungle' // big jungle trees and bushes
  | 'cherry'
  | 'none';

export interface Biome {
  id: BiomeId;
  name: string;
  ground: GroundFamily;
  ambient: Ambient;
  /** Music theme while the hero is in this biome. */
  theme: ThemeId;
  /** Relative danger (1 = baseline). Data for the spawner / director; not applied yet. */
  danger: number;
  grass: readonly [RGB, RGB, RGB]; // base, light, dark (the ground family's colours)
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
  treeKind: TreeKind;
  /** Chance per cell of a cactus (desert, badlands). */
  cactusBase: number;
  /** Extra chance per cell of a boulder (badlands, mushroom fields). */
  boulderBonus: number;
  /** Chance per decoration cell of a flower instead of tall grass (0..1 of the decoration roll). */
  flowers: number;
  /** Lake threshold offset: negative = more water (swamp), >= 1 = no lakes at all (badlands). */
  lake: number;
  /** Width of the sand bank around lakes (in lake-noise units). */
  bank: number;
  /** Small-pond noise threshold (lower = more ponds); >= 1 means none. Swamps are dotted with them. */
  puddles: number;
  /** Lava pool noise threshold (lower = more lava); >= 1 means the biome has no lava. */
  lavaLevel: number;
  /** Water is frozen into slippery ice. */
  iceWater: boolean;
  /** Lava pools exist. */
  lava: boolean;
  /** Snowfall slows the hero (taiga). */
  snow: boolean;
}

const OAK_TRUNK: readonly [RGB, RGB] = [
  [112, 78, 46],
  [82, 56, 32],
];
const LOAM: readonly [RGB, RGB, RGB] = [
  [138, 92, 54],
  [158, 108, 66],
  [114, 74, 42],
];
const BEACH: readonly [RGB, RGB] = [
  [222, 206, 140],
  [204, 186, 120],
];
const BLUE_WATER: readonly [RGB, RGB, RGB, RGB] = [
  [58, 112, 214],
  [88, 142, 236],
  [44, 88, 176],
  [168, 205, 255],
];

export const BIOMES: Record<BiomeId, Biome> = {
  plains: {
    id: 'plains',
    name: 'Plains',
    ground: 'grass',
    ambient: 'none',
    theme: 'plains',
    danger: 1,
    grass: [
      [96, 156, 58],
      [117, 178, 72],
      [78, 134, 48],
    ],
    dirt: LOAM,
    sand: BEACH,
    water: BLUE_WATER,
    leaves: [
      [76, 148, 52],
      [104, 176, 70],
      [54, 112, 40],
    ],
    trunk: OAK_TRUNK,
    treeBase: 0.05,
    groveBonus: 0.3,
    dirtThreshold: 0.75,
    treeKind: 'mixed',
    cactusBase: 0,
    boulderBonus: 0,
    flowers: 0.3,
    lake: 0,
    bank: 0.035,
    puddles: 1,
    lavaLevel: 1,
    iceWater: false,
    lava: false,
    snow: false,
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    ground: 'grass',
    ambient: 'leaves',
    theme: 'plains',
    danger: 1.05,
    grass: [
      [78, 140, 50],
      [96, 162, 62],
      [62, 116, 40],
    ],
    dirt: [
      [128, 86, 50],
      [148, 102, 62],
      [104, 68, 38],
    ],
    sand: BEACH,
    water: [
      [54, 106, 206],
      [82, 136, 230],
      [40, 82, 168],
      [160, 198, 250],
    ],
    leaves: [
      [60, 128, 42],
      [84, 154, 56],
      [42, 98, 32],
    ],
    trunk: OAK_TRUNK,
    treeBase: 0.16,
    groveBonus: 0.28,
    dirtThreshold: 0.72,
    treeKind: 'birch_mix',
    cactusBase: 0,
    boulderBonus: 0,
    flowers: 0.35,
    lake: 0.02,
    bank: 0.03,
    puddles: 1,
    lavaLevel: 1,
    iceWater: false,
    lava: false,
    snow: false,
  },
  dark_forest: {
    id: 'dark_forest',
    name: 'Dark Forest',
    ground: 'grass',
    ambient: 'leaves',
    theme: 'dark_forest',
    danger: 1.15,
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
    boulderBonus: 0,
    flowers: 0.15,
    lake: 0.03,
    bank: 0.03,
    puddles: 1,
    lavaLevel: 1,
    iceWater: false,
    lava: false,
    snow: false,
  },
  snowy_taiga: {
    id: 'snowy_taiga',
    name: 'Snowy Taiga',
    ground: 'snow',
    ambient: 'snow',
    theme: 'snowy_taiga',
    danger: 1.05,
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
    boulderBonus: 0.004,
    flowers: 0,
    lake: 0,
    bank: 0.03,
    puddles: 1,
    lavaLevel: 1,
    iceWater: true,
    lava: false,
    snow: true,
  },
  desert: {
    id: 'desert',
    name: 'Desert',
    ground: 'sand',
    ambient: 'dust',
    theme: 'desert',
    danger: 1.05,
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
    trunk: OAK_TRUNK,
    treeBase: 0,
    groveBonus: 0,
    dirtThreshold: 0.64,
    treeKind: 'none',
    cactusBase: 0.05,
    boulderBonus: 0,
    flowers: 0,
    lake: 0.08, // rare oases
    bank: 0.07,
    puddles: 1,
    lavaLevel: 0.8,
    iceWater: false,
    lava: true,
    snow: false,
  },
  swamp: {
    id: 'swamp',
    name: 'Swamp',
    ground: 'mud',
    ambient: 'fireflies',
    theme: 'swamp',
    danger: 1.1,
    grass: [
      [106, 112, 57],
      [124, 130, 68],
      [84, 90, 44],
    ],
    dirt: [
      [92, 74, 58],
      [108, 88, 68],
      [70, 56, 44],
    ],
    sand: [
      [150, 146, 122],
      [128, 124, 104],
    ],
    water: [
      [66, 98, 82],
      [88, 122, 98],
      [48, 74, 62],
      [150, 176, 146],
    ],
    leaves: [
      [74, 98, 40],
      [94, 120, 52],
      [56, 76, 30],
    ],
    trunk: [
      [96, 72, 44],
      [70, 52, 32],
    ],
    treeBase: 0.07,
    groveBonus: 0.22,
    dirtThreshold: 0.6,
    treeKind: 'swamp',
    cactusBase: 0,
    boulderBonus: 0,
    flowers: 0.12,
    lake: -0.07,
    bank: 0.015,
    puddles: 0.64,
    lavaLevel: 1,
    iceWater: false,
    lava: false,
    snow: false,
  },
  jungle: {
    id: 'jungle',
    name: 'Jungle',
    ground: 'grass',
    ambient: 'pollen',
    theme: 'jungle',
    danger: 1.1,
    grass: [
      [86, 170, 44],
      [110, 194, 58],
      [64, 138, 34],
    ],
    dirt: [
      [122, 82, 46],
      [142, 98, 58],
      [98, 64, 36],
    ],
    sand: BEACH,
    water: [
      [46, 124, 196],
      [72, 152, 222],
      [34, 98, 164],
      [150, 210, 244],
    ],
    leaves: [
      [48, 146, 36],
      [74, 176, 50],
      [32, 110, 26],
    ],
    trunk: [
      [140, 106, 62],
      [104, 78, 44],
    ],
    treeBase: 0.3,
    groveBonus: 0.32,
    dirtThreshold: 0.74,
    treeKind: 'jungle',
    cactusBase: 0,
    boulderBonus: 0,
    flowers: 0.25,
    lake: -0.03,
    bank: 0.025,
    puddles: 0.82,
    lavaLevel: 1,
    iceWater: false,
    lava: false,
    snow: false,
  },
  badlands: {
    id: 'badlands',
    name: 'Badlands',
    ground: 'red_sand',
    ambient: 'dust',
    theme: 'badlands',
    danger: 1.15,
    grass: [
      [190, 102, 50],
      [208, 124, 66],
      [162, 84, 42],
    ],
    dirt: [
      [152, 92, 66],
      [174, 114, 82],
      [122, 72, 54],
    ],
    sand: [
      [200, 112, 52],
      [176, 94, 42],
    ],
    water: [
      [52, 116, 194],
      [80, 144, 220],
      [38, 92, 164],
      [160, 206, 250],
    ],
    leaves: [
      [128, 122, 62],
      [150, 142, 78],
      [104, 98, 48],
    ],
    trunk: [
      [96, 70, 46],
      [72, 52, 34],
    ],
    treeBase: 0,
    groveBonus: 0,
    dirtThreshold: 0.6,
    treeKind: 'none',
    cactusBase: 0.025,
    boulderBonus: 0.03,
    flowers: 0,
    lake: 1, // no lakes, only lava
    bank: 0,
    puddles: 1,
    lavaLevel: 0.785,
    iceWater: false,
    lava: true,
    snow: false,
  },
  cherry_grove: {
    id: 'cherry_grove',
    name: 'Cherry Grove',
    ground: 'grass',
    ambient: 'petals',
    theme: 'cherry',
    danger: 0.9,
    grass: [
      [116, 182, 80],
      [138, 202, 96],
      [94, 156, 64],
    ],
    dirt: LOAM,
    sand: BEACH,
    water: [
      [70, 130, 230],
      [100, 160, 244],
      [52, 104, 196],
      [186, 216, 255],
    ],
    leaves: [
      [236, 162, 194],
      [250, 196, 220],
      [208, 124, 166],
    ],
    trunk: [
      [86, 52, 58],
      [62, 36, 42],
    ],
    treeBase: 0.1,
    groveBonus: 0.26,
    dirtThreshold: 0.8,
    treeKind: 'cherry',
    cactusBase: 0,
    boulderBonus: 0,
    flowers: 0.6,
    lake: -0.02,
    bank: 0.03,
    puddles: 1,
    lavaLevel: 1,
    iceWater: false,
    lava: false,
    snow: false,
  },
  mushroom_fields: {
    id: 'mushroom_fields',
    name: 'Mushroom Fields',
    ground: 'mycelium',
    ambient: 'spores',
    theme: 'mushroom',
    danger: 0.6,
    grass: [
      [122, 104, 118],
      [142, 124, 140],
      [100, 84, 98],
    ],
    dirt: [
      [112, 88, 78],
      [132, 104, 92],
      [90, 70, 62],
    ],
    sand: [
      [184, 172, 160],
      [162, 150, 140],
    ],
    water: [
      [62, 108, 202],
      [90, 138, 228],
      [46, 84, 166],
      [170, 204, 252],
    ],
    leaves: [
      [184, 46, 40],
      [214, 78, 64],
      [146, 30, 28],
    ],
    trunk: [
      [214, 206, 190],
      [184, 176, 160],
    ],
    treeBase: 0,
    groveBonus: 0,
    dirtThreshold: 0.76,
    treeKind: 'none',
    cactusBase: 0,
    boulderBonus: 0.03,
    flowers: 0.5,
    lake: -0.04,
    bank: 0.03,
    puddles: 0.8,
    lavaLevel: 1,
    iceWater: false,
    lava: false,
    snow: false,
  },
  nether: {
    id: 'nether',
    name: 'Nether',
    ground: 'netherrack',
    ambient: 'embers',
    theme: 'nether',
    danger: 1.3,
    grass: [
      [118, 44, 44],
      [140, 56, 54],
      [92, 32, 34],
    ],
    dirt: [
      [78, 30, 32],
      [96, 40, 40],
      [58, 22, 26],
    ],
    sand: [
      [96, 76, 60],
      [74, 58, 46],
    ],
    water: BLUE_WATER,
    leaves: [
      [90, 30, 30],
      [110, 40, 40],
      [70, 24, 26],
    ],
    trunk: [
      [60, 40, 40],
      [44, 28, 28],
    ],
    treeBase: 0,
    groveBonus: 0,
    dirtThreshold: 0.7,
    treeKind: 'none',
    cactusBase: 0,
    boulderBonus: 0,
    flowers: 0,
    lake: 1,
    bank: 0,
    puddles: 1,
    lavaLevel: 1,
    iceWater: false,
    lava: true,
    snow: false,
  },
};

/** Every biome id, in a fixed order (index = compact numeric id, see BIOME_INDEX). */
export const BIOME_IDS: readonly BiomeId[] = [
  'plains',
  'forest',
  'dark_forest',
  'snowy_taiga',
  'desert',
  'swamp',
  'jungle',
  'badlands',
  'cherry_grove',
  'mushroom_fields',
  'nether',
];

/** The ten overworld biomes (everything but the rift arena). */
export const OVERWORLD_BIOMES: readonly BiomeId[] = BIOME_IDS.filter((b) => b !== 'nether');

/** Compact numeric id of a biome (for typed arrays and cache keys). */
export const BIOME_INDEX = Object.fromEntries(BIOME_IDS.map((b, i) => [b, i])) as Record<
  BiomeId,
  number
>;

export function isBiomeId(v: string): v is BiomeId {
  return (BIOME_IDS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------------------------------
// Legacy time rotation (BRIEF section 7, pre-biome-map). Gameplay now reads the spatial biome map; this
// stays exported for debug tools and its unit tests.

/** Biomes rotate in this order every 4 minutes (legacy, BRIEF section 7). */
export const BIOME_ORDER: readonly BiomeId[] = ['plains', 'dark_forest', 'snowy_taiga', 'desert'];
export const BIOME_PERIOD = 240; // seconds per biome
export const BIOME_FADE = 2.5; // palette crossfade seconds

export interface BiomeState {
  current: BiomeId;
  previous: BiomeId | null;
  /** 0..1, 1 once the crossfade has finished. */
  fade: number;
}

/** Is this a biome of the legacy overworld rotation (not the rift arena)? */
export function inRotation(id: BiomeId): boolean {
  return BIOME_ORDER.includes(id);
}

/** Legacy rotation biome at time t, without allocating a state object. */
export function biomeAt(t: number): BiomeId {
  const period = Math.max(0, Math.floor(t / BIOME_PERIOD));
  return BIOME_ORDER[period % BIOME_ORDER.length] ?? 'plains';
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
