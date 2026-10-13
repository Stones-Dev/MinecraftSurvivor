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

/** A focus target with a stable identity (survives the per-frame rebuild of the item list). */
export interface FocusItem extends FocusRect {
  id: string;
}

/**
 * Keyboard / gamepad focus for screens that rebuild their targets every frame. It remembers the focused
 * id; when that target disappears (a claimed mission loses its button, a tab switch) the focus moves to the
 * nearest enabled target instead of vanishing.
 */
export class FocusTracker {
  /** True once the keyboard or a pad drove the last input (the ring shows instead of hover). */
  active = false;
  private id: string | null = null;
  private lastX = 0;
  private lastY = 0;

  /** Id of the focused target (null when none). */
  get focusedId(): string | null {
    return this.active ? this.id : null;
  }

  private remember(r: FocusRect): void {
    this.lastX = r.x + r.w / 2;
    this.lastY = r.y + r.h / 2;
  }

  /** Nearest enabled item to the last known focus position (the first one when nothing was focused yet). */
  private nearest(items: readonly FocusItem[]): number {
    let best = -1;
    let bestD = Infinity;
    items.forEach((r, i) => {
      if (r.enabled === false) return;
      const d = Math.hypot(r.x + r.w / 2 - this.lastX, r.y + r.h / 2 - this.lastY);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  private set(items: readonly FocusItem[], i: number): number {
    const r = items[i];
    if (!r) {
      this.id = null;
      return -1;
    }
    this.id = r.id;
    this.remember(r);
    return i;
  }

  /** Index of the focused item in `items`, re-targeting when it vanished; -1 when the ring is hidden. */
  sync(items: readonly FocusItem[]): number {
    if (!this.active) return -1;
    const i = items.findIndex((r) => r.id === this.id && r.enabled !== false);
    if (i >= 0) {
      this.remember(items[i] as FocusItem);
      return i;
    }
    return this.set(
      items,
      this.id === null ? items.findIndex((r) => r.enabled !== false) : this.nearest(items),
    );
  }

  /** Show the ring on `preferId` or else the first enabled item; returns its index (-1 when none). */
  focusFirst(items: readonly FocusItem[], preferId?: string): number {
    this.active = true;
    let i = preferId ? items.findIndex((r) => r.id === preferId && r.enabled !== false) : -1;
    if (i < 0) i = items.findIndex((r) => r.enabled !== false);
    return this.set(items, i);
  }

  /** Move the ring one step; the first press only shows it. Returns the newly focused index (-1 when none). */
  move(items: readonly FocusItem[], dir: Dir): number {
    const cur = this.sync(items);
    if (cur < 0) return this.focusFirst(items);
    return this.set(items, spatialFocus(items, cur, dir));
  }

  /** The pointer took over: hide the ring. */
  release(): void {
    this.active = false;
  }
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

/** `null` is "Random" (a biome drawn from the run seed, see `resolveStartBiome`; plains stays the most common); then every overworld biome. */
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

// ---------------------------------------------------------------------------------------------------
// Hub layout (art-resolution rectangles; pure so it can be tested at every size).

export interface UiRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HubLayout {
  tier: LayoutTier;
  margin: number;
  profile: UiRect;
  /** Slot for the daily reward banner, under the profile chip. */
  banner: UiRect;
  /** Resource pills sit on this baseline-top y and end at `pillsRight`. */
  pillsY: number;
  pillsRight: number;
  play: UiRect;
  /** Eight secondary buttons, row by row (two columns). */
  tiles: UiRect[];
  /** Hero ability card under the hero. */
  card: UiRect;
  /** Where the hero's feet stand (screen px) and how wide the hero's stage is. */
  stage: { x: number; y: number; halfW: number };
  /** Hero draw scale for the tier (integer). */
  heroScale: number;
  /** Logo in the hero's zone under the chip (large tier only). */
  logo: { cx: number; y: number; block: number } | null;
  /** Free strip under the button column (records / hints), null when too short. */
  footer: UiRect | null;
}

const LOGO_COLS = 59;

export function hubLayout(w: number, h: number): HubLayout {
  const tier = layoutTier(w, h);
  const m = 6;
  const chipW = tier === 'compact' ? 106 : tier === 'normal' ? 128 : 150;
  const chipH = tier === 'compact' ? 24 : 28;
  const profile = { x: m, y: m, w: chipW, h: chipH };
  const banner = { x: m, y: profile.y + profile.h + 3, w: chipW, h: tier === 'compact' ? 14 : 16 };
  const tileW = tier === 'compact' ? 80 : tier === 'normal' ? 94 : 124;
  const gap = tier === 'large' ? 5 : 4;
  const colW = tileW * 2 + gap;
  const colX = w - m - colW;
  const pillsY = m;
  const colY = pillsY + 14 + (tier === 'compact' ? 5 : 7);
  const playH = tier === 'compact' ? 22 : tier === 'normal' ? 26 : 36;
  const tileMax = tier === 'compact' ? 18 : tier === 'normal' ? 20 : 30;
  const rowsGap = tier === 'compact' ? 3 : tier === 'normal' ? 4 : 5;
  const free = h - m - colY - playH - gap - 3 * rowsGap;
  const tileH = Math.max(12, Math.min(tileMax, Math.floor(free / 4)));
  const play = { x: colX, y: colY, w: colW, h: playH };
  const tiles: UiRect[] = [];
  for (let i = 0; i < 8; i++) {
    tiles.push({
      x: colX + (i % 2) * (tileW + gap),
      y: play.y + play.h + gap + Math.floor(i / 2) * (tileH + rowsGap),
      w: tileW,
      h: tileH,
    });
  }
  const bottom = (tiles[7]?.y ?? 0) + tileH;
  const footerH = Math.min(tier === 'large' ? 34 : 30, h - m - bottom - 4);
  const footer = footerH >= 9 ? { x: colX, y: bottom + 4, w: colW, h: footerH } : null;
  const zoneW = colX - m - 8;
  const cardH = tier === 'compact' ? 50 : tier === 'normal' ? 68 : 66;
  const card = { x: m, y: Math.max(m, h - m - cardH), w: zoneW, h: Math.min(cardH, h - 2 * m) };
  const heroScale = tier === 'large' ? 3 : 2;
  const stage = { x: m + Math.floor(zoneW / 2), y: card.y - 13, halfW: Math.floor(zoneW / 2) };
  // The big hub logo only fits in the large tier: in the hero's zone, under the chip and the daily banner.
  const logoTop = banner.y + banner.h + 6;
  const block = Math.min(6, Math.floor((zoneW - 10) / LOGO_COLS));
  const logoH = 7 * block + Math.round(block * 0.45) + 6;
  const logo =
    tier === 'large' && block >= 4 && stage.y - 3 * 32 - 10 > logoTop + logoH
      ? { cx: m + Math.floor(zoneW / 2), y: logoTop, block }
      : null;
  return {
    tier,
    margin: m,
    profile,
    banner,
    pillsY,
    pillsRight: w - m,
    play,
    tiles,
    card,
    stage,
    heroScale,
    logo,
    footer,
  };
}

// ---------------------------------------------------------------------------------------------------
// The hero and companions strolling on the hub's grass.

export interface Walker {
  /** Offset from the stage centre in px. */
  x: number;
  dir: 1 | -1;
  walking: boolean;
}

/** Slots (px relative to the hero) where the pet and the allies like to stand. */
export const FOLLOW_SLOTS: readonly number[] = [-30, 32, 58];

/**
 * The equipped hero strolls back and forth within `range` px of the stage centre now and then; the pet and
 * allies trot after it and settle beside it. Deterministic for a seed.
 */
export class Troupe {
  readonly hero: Walker = { x: 0, dir: 1, walking: false };
  readonly followers: Walker[];
  private target = 0;
  private wait: number;
  private readonly rng: Rng;

  constructor(
    seed: number,
    private readonly range: number,
    followers: number,
  ) {
    this.rng = new Rng(seed);
    this.followers = Array.from({ length: followers }, (_, i) => ({
      x: FOLLOW_SLOTS[i] ?? 40,
      dir: 1 as 1 | -1,
      walking: false,
    }));
    this.wait = this.rng.range(2.5, 4.5);
  }

  /** Resize the group (the loadout changed). */
  setFollowers(n: number): void {
    while (this.followers.length < n) {
      this.followers.push({
        x: this.hero.x + (FOLLOW_SLOTS[this.followers.length] ?? 40),
        dir: this.hero.dir,
        walking: false,
      });
    }
    this.followers.length = n;
  }

  update(dt: number): void {
    const h = this.hero;
    if (h.walking) {
      const d = this.target - h.x;
      const step = 24 * dt;
      if (Math.abs(d) <= step) {
        h.x = this.target;
        h.walking = false;
        this.wait = this.rng.range(3, 6.5);
      } else {
        h.x += Math.sign(d) * step;
        h.dir = d > 0 ? 1 : -1;
      }
    } else {
      this.wait -= dt;
      if (this.wait <= 0) {
        // A stroll of at least 14 px, kept inside the range (followers need room on both sides).
        const lo = -this.range;
        const hi = this.range;
        let t = this.rng.range(lo, hi);
        if (Math.abs(t - h.x) < 14) t = h.x > 0 ? lo * 0.6 : hi * 0.6;
        this.target = Math.max(lo, Math.min(hi, t));
        h.walking = true;
      }
    }
    this.followers.forEach((f, i) => {
      const want = h.x + (FOLLOW_SLOTS[i] ?? 40);
      const d = want - f.x;
      const step = 32 * dt;
      if (Math.abs(d) > 4 || (f.walking && Math.abs(d) > 0.5)) {
        f.x += Math.sign(d) * Math.min(step, Math.abs(d));
        f.dir = d > 0 ? 1 : -1;
        f.walking = Math.abs(d) > 0.5;
      } else {
        f.walking = false;
        f.dir = h.dir;
      }
    });
  }
}

// ---------------------------------------------------------------------------------------------------
// Collection layout.

export interface CollectionLayout {
  tier: LayoutTier;
  tabsY: number;
  detail: UiRect;
  /** Card grid: origin, card size, spacing and how many fit per page. */
  grid: { x: number; y: number; cw: number; ch: number; gap: number; cols: number; rows: number };
  /** Cards are wide enough to carry the name under the portrait. */
  named: boolean;
  /** Top of the button row. */
  buttonsY: number;
}

export function collectionLayout(w: number, h: number): CollectionLayout {
  const tier = layoutTier(w, h);
  const m = 6;
  const top = 42;
  const bottom = h - 24;
  const detailW = tier === 'compact' ? 136 : tier === 'normal' ? 172 : 224;
  const detail = { x: w - m - detailW, y: top, w: detailW, h: Math.max(20, bottom - top) };
  const [cw, ch, gap] =
    tier === 'compact' ? [30, 34, 2] : tier === 'normal' ? [38, 46, 3] : [58, 72, 4];
  const areaW = detail.x - 4 - m;
  const cols = Math.max(1, Math.floor((areaW + gap) / (cw + gap)));
  const rows = Math.max(1, Math.floor((bottom - top + gap) / (ch + gap)));
  const gx = m + Math.max(0, Math.floor((areaW - (cols * (cw + gap) - gap)) / 2));
  return {
    tier,
    tabsY: 24,
    detail,
    grid: { x: gx, y: top, cw, ch, gap, cols, rows },
    named: tier !== 'compact',
    buttonsY: h - 20,
  };
}

// ---------------------------------------------------------------------------------------------------
// Run setup layout.

export interface SetupLayout {
  tier: LayoutTier;
  slotX: number;
  slotW: number;
  slotsY: number;
  rowH: number;
  rowGap: number;
  /** Right-hand picker: header line, candidate grid and the detail box under it. */
  picker: UiRect;
  grid: { x: number; y: number; cw: number; ch: number; gap: number; cols: number; rows: number };
  detail: UiRect;
  /** Top of the bottom bar (Back, biome selector, START). */
  barY: number;
}

export function setupLayout(w: number, h: number): SetupLayout {
  const tier = layoutTier(w, h);
  const m = 6;
  const top = 24;
  const barY = h - 20;
  const bottom = barY - 4;
  const slotW = tier === 'compact' ? 98 : tier === 'normal' ? 120 : 160;
  const rowGap = tier === 'compact' ? 2 : 3;
  const rowH = Math.max(22, Math.min(46, Math.floor((bottom - top - 3 * rowGap) / 4)));
  const px = m + slotW + 6;
  const picker = { x: px, y: top, w: w - m - px, h: bottom - top };
  const [cw, ch, gap] =
    tier === 'compact' ? [28, 32, 2] : tier === 'normal' ? [34, 40, 3] : [58, 70, 4];
  const detailH = tier === 'compact' ? 46 : tier === 'normal' ? 60 : 78;
  const gridTop = picker.y + 12;
  const gridH = picker.h - 12 - detailH - 3;
  const cols = Math.max(1, Math.floor((picker.w - 4 + gap) / (cw + gap)));
  const rows = Math.max(1, Math.floor((gridH + gap) / (ch + gap)));
  return {
    tier,
    slotX: m,
    slotW,
    slotsY: top,
    rowH,
    rowGap,
    picker,
    grid: { x: picker.x + 2, y: gridTop, cw, ch, gap, cols, rows },
    detail: { x: picker.x, y: picker.y + picker.h - detailH, w: picker.w, h: detailH },
    barY,
  };
}
