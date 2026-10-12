/**
 * Pure (DOM-free) logic behind the hub and the menu screens: player level and rank, mission badge hint,
 * splash texts, layout tiers, keyboard / gamepad navigation and the start-biome selector. Kept apart from the
 * drawing code so it can be unit tested.
 */
import type { SaveData } from '../core/save';
import { Rng } from '../core/rng';
import { OVERWORLD_BIOMES, type BiomeId } from '../world/biomes';

// ---------------------------------------------------------------------------------------------------
// Player level and rank (derived from the save's stats; nothing is stored).

export type PlayerStats = Pick<
  SaveData['stats'],
  'kills' | 'runs' | 'wins' | 'playSeconds' | 'bosses' | 'minis'
>;

export const MAX_PLAYER_LEVEL = 99;

/** Experience points of a profile: kills, bosses, runs and time played all count. */
export function playerXp(s: PlayerStats): number {
  return Math.floor(
    s.kills +
      s.bosses * 150 +
      s.minis * 40 +
      s.runs * 30 +
      s.wins * 400 +
      Math.floor(s.playSeconds / 60) * 2,
  );
}

/** Total XP needed to reach `level` (level 1 needs 0). */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return 60 * (l - 1) * l;
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level and the size of the level (for a progress bar). */
  into: number;
  span: number;
  /** 0..1 progress to the next level (1 at the cap). */
  frac: number;
}

export function levelInfo(xp: number): LevelInfo {
  const total = Math.max(0, Math.floor(xp));
  let level = 1;
  while (level < MAX_PLAYER_LEVEL && total >= xpForLevel(level + 1)) level++;
  if (level >= MAX_PLAYER_LEVEL) return { level, into: 1, span: 1, frac: 1 };
  const base = xpForLevel(level);
  const span = xpForLevel(level + 1) - base;
  const into = total - base;
  return { level, into, span, frac: Math.max(0, Math.min(1, into / span)) };
}

export interface RankDef {
  name: string;
  /** First player level of the rank. */
  from: number;
  color: string;
}

/** Minecraft-material ranks, lowest first. */
export const RANKS: readonly RankDef[] = [
  { name: 'Wood', from: 1, color: '#b8864a' },
  { name: 'Stone', from: 5, color: '#a8a8b4' },
  { name: 'Iron', from: 10, color: '#e0e0ec' },
  { name: 'Gold', from: 17, color: '#ffd84a' },
  { name: 'Diamond', from: 25, color: '#5fe8e0' },
  { name: 'Netherite', from: 35, color: '#c08bff' },
];

export function rankOf(level: number): RankDef {
  let r: RankDef = RANKS[0] as RankDef;
  for (const k of RANKS) if (level >= k.from) r = k;
  return r;
}

// ---------------------------------------------------------------------------------------------------
// Missions badge.

/**
 * How many mission entries look worth a visit (started and not claimed yet), shown as the red "!" on the
 * hub's Missions button. TODO(meta agent): replace with the real "completed and claimable" count once the
 * mission definitions (targets) exist; progress > 0 is only a hint until then.
 */
export function missionsClaimable(data: SaveData): number {
  const all = [...data.missions.daily, ...data.missions.weekly];
  return all.filter((m) => !m.claimed && m.progress > 0).length;
}

// ---------------------------------------------------------------------------------------------------
// Splash texts (title screen).

export const SPLASHES: readonly string[] = [
  'Also try Creepers!',
  'Now with 11 heroes!',
  'Punch trees responsibly!',
  'Sssssurvive!',
  'Gotta spawn them all!',
  'Mind the Warden!',
  'Emeralds are forever!',
  'Night falls at minute 2!',
  'Cow-abunga!',
  'Pigs can not fly... yet!',
  'Bullet heaven, block hell!',
  'Never dig straight down!',
  'Sheep happens!',
  'Hold my pickaxe!',
  'One more run!',
  'Wolves approve!',
  'TNT is a lifestyle!',
  'Do not look at the Enderman!',
  'Better with a pet!',
  'Spawn eggs not included!',
  'Zombies hate this one trick!',
  'Powered by pixels!',
  'Crafted with blocks!',
  'Rana jumps higher!',
  'Alex never misses!',
  'Beware the thunder!',
  'Villagers say hrmm!',
  'Now 100% cuboid!',
  'Free hugs from Creepers!',
  'Diamonds? Maybe later.',
];

/** A splash for this seed (the title screen seeds it from the clock). */
export function pickSplash(seed: number): string {
  return new Rng(seed).pick(SPLASHES);
}

// ---------------------------------------------------------------------------------------------------
// Layout tiers.

export type LayoutTier = 'compact' | 'normal' | 'large';

/** Art-resolution tiers: 320x180 is compact, ~426x240 normal, 560x320 and up large. */
export function layoutTier(width: number, height: number): LayoutTier {
  if (width < 400 || height < 220) return 'compact';
  if (width >= 560 && height >= 320) return 'large';
  return 'normal';
}

// ---------------------------------------------------------------------------------------------------
// Navigation (keyboard and gamepad share the same events).

export type NavEvent = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'prev' | 'next';

/** Keyboard code to navigation event; null for keys that mean nothing to menus. */
export function keyToNav(code: string): NavEvent | null {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      return 'up';
    case 'ArrowDown':
    case 'KeyS':
      return 'down';
    case 'ArrowLeft':
    case 'KeyA':
      return 'left';
    case 'ArrowRight':
    case 'KeyD':
      return 'right';
    case 'Enter':
    case 'Space':
    case 'NumpadEnter':
      return 'ok';
    case 'Escape':
    case 'Backspace':
      return 'back';
    case 'KeyQ':
    case 'PageUp':
      return 'prev';
    case 'KeyE':
    case 'PageDown':
    case 'Tab':
      return 'next';
    default:
      return null;
  }
}

/** Direction of a stick deflection (dominant axis, past the threshold), else null. */
export function stickDir(
  x: number,
  y: number,
  threshold = 0.6,
): 'up' | 'down' | 'left' | 'right' | null {
  if (Math.max(Math.abs(x), Math.abs(y)) < threshold) return null;
  if (Math.abs(x) >= Math.abs(y)) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'up' : 'down';
}

export interface FocusRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Disabled entries are skipped (default enabled). */
  enabled?: boolean;
}

type Dir = 'up' | 'down' | 'left' | 'right';

/**
 * Index of the rect to focus when moving `dir` from `cur`: the nearest enabled rect that lies that way
 * (perpendicular drift is penalised), wrapping to the far side when nothing lies ahead. Returns `cur` when
 * there is nothing else to focus.
 */
export function spatialFocus(rects: readonly FocusRect[], cur: number, dir: Dir): number {
  const from = rects[cur];
  if (!from) return rects.findIndex((r) => r.enabled !== false);
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'right' || dir === 'down' ? 1 : -1;
  let best = -1;
  let bestCost = Infinity;
  let wrap = -1;
  let wrapCost = Infinity;
  rects.forEach((r, i) => {
    if (i === cur || r.enabled === false) return;
    const dx = r.x + r.w / 2 - cx;
    const dy = r.y + r.h / 2 - cy;
    const along = (horizontal ? dx : dy) * sign;
    const across = Math.abs(horizontal ? dy : dx);
    if (along > 0.5) {
      // Rows (or columns) away are only reachable once nothing sits in line with the current one.
      const cost = along + across * 2.5;
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    } else {
      // Wrap candidate: closest in line, then furthest on the opposite side.
      const cost = across * 4 + along;
      if (cost < wrapCost) {
        wrapCost = cost;
        wrap = i;
      }
    }
  });
  if (best >= 0) return best;
  return wrap >= 0 ? wrap : cur;
}

/** Move inside a `cols`-wide grid of `count` cells; stays put at the edges (the last row may be short). */
export function gridMove(index: number, dir: Dir, cols: number, count: number): number {
  if (count <= 0) return 0;
  const c = Math.max(1, cols);
  const i = Math.max(0, Math.min(count - 1, index));
  switch (dir) {
    case 'left':
      return i % c === 0 ? i : i - 1;
    case 'right':
      return i % c === c - 1 || i + 1 >= count ? i : i + 1;
    case 'up':
      return i - c >= 0 ? i - c : i;
    case 'down': {
      if (i + c < count) return i + c;
      // A short last row: drop onto its last cell if the column is below the current row.
      const lastRowStart = Math.floor((count - 1) / c) * c;
      return Math.floor(i / c) * c < lastRowStart ? count - 1 : i;
    }
  }
}

/** Number of pages for `count` items at `perPage` per page (at least 1). */
export function pageCount(count: number, perPage: number): number {
  return Math.max(1, Math.ceil(count / Math.max(1, perPage)));
}

/** Page containing `index`. */
export function pageOf(index: number, perPage: number): number {
  return Math.floor(Math.max(0, index) / Math.max(1, perPage));
}

/** Cycle `i` by `d` inside 0..n-1. */
export function wrapIndex(i: number, d: number, n: number): number {
  return n <= 0 ? 0 : (((i + d) % n) + n) % n;
}

// ---------------------------------------------------------------------------------------------------
// Start biome selector (run setup).

/** `null` is "Random" (the usual spawn meadow); then every overworld biome. */
export const START_BIOME_OPTIONS: readonly (BiomeId | null)[] = [null, ...OVERWORLD_BIOMES];

export function cycleStartBiome(cur: BiomeId | null, dir: number): BiomeId | null {
  const i = Math.max(0, START_BIOME_OPTIONS.indexOf(cur));
  return START_BIOME_OPTIONS[wrapIndex(i, dir, START_BIOME_OPTIONS.length)] ?? null;
}

// ---------------------------------------------------------------------------------------------------
// Toasts.

/** Opacity of a toast `age` seconds into a `life` second display (quick fade in, slow fade out). */
export function toastAlpha(age: number, life: number): number {
  if (age < 0 || age >= life) return 0;
  return Math.max(0, Math.min(1, age / 0.18, (life - age) / 0.45));
}

/** Slide-in offset in px (starts above its slot, settles in 0.2 s). */
export function toastSlide(age: number, distance = 10): number {
  const k = Math.max(0, Math.min(1, age / 0.2));
  return Math.round((1 - k * k) * -distance);
}
