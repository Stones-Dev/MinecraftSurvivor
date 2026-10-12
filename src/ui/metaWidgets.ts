/** Shared bits of the missions, achievements and results screens: hit list, tabs, checkmark, formatting. */
import type { MissionReward } from '../data/missions';
import { FocusTracker, type FocusItem, type NavEvent } from './hubModel';
import { drawIcon, type IconName } from './icons';
import {
  drawButton,
  drawFocusRing,
  drawText,
  fitText,
  inRect,
  textWidth,
  UI,
  type ButtonStyle,
  type Rect,
} from './panel';

export interface Hit {
  rect: Rect;
  label: string;
  fn: () => void;
  disabled: boolean;
  /** Clicks outside this rect (a scroll viewport) do not reach the hit. */
  clip: Rect | null;
  style: ButtonStyle;
  /** Draw nothing (the rect is only a click target, e.g. a whole card or a tab). */
  invisible: boolean;
  /** Can the keyboard / pad focus ring land on it (default: every visible hit). */
  focusable: boolean;
  /** Stable identity for focus tracking (default: the label). */
  id: string;
  /** Called when keyboard / pad navigation moves the focus here (scroll it into view, select its row). */
  onFocus: (() => void) | null;
}

type HitOpts = Partial<
  Pick<Hit, 'disabled' | 'clip' | 'style' | 'invisible' | 'focusable' | 'onFocus'>
> & {
  /** Stable identity for focus tracking when labels repeat. */
  key?: string;
};

/**
 * Buttons and click targets rebuilt every frame, with hover tracking, viewport clipping and keyboard / gamepad
 * focus (`handleNav`: arrows move a focus ring between the focusable hits, OK presses it).
 */
export class HitList {
  private list: Hit[] = [];
  private mx = -1;
  private my = -1;
  private readonly focus = new FocusTracker();
  private seen = new Map<string, number>();

  begin(): void {
    // Settle the focus on the finished frame so a vanished target hands the ring to its neighbour.
    this.focus.sync(this.items());
    this.list = [];
    this.seen.clear();
  }

  add(rect: Rect, label: string, fn: () => void, opts: HitOpts = {}): void {
    const base = opts.key ?? (label || 'hit');
    const n = this.seen.get(base) ?? 0;
    this.seen.set(base, n + 1);
    const invisible = opts.invisible ?? false;
    this.list.push({
      rect,
      label,
      fn,
      disabled: opts.disabled ?? false,
      clip: opts.clip ?? null,
      style: opts.style ?? {},
      invisible,
      focusable: opts.focusable ?? !invisible,
      id: `${base}#${n}`,
      onFocus: opts.onFocus ?? null,
    });
  }

  /** Focusable targets in insertion order (scrolled-away ones too: focusing them is how a list scrolls). */
  private targets(): Hit[] {
    return this.list.filter((h) => h.focusable);
  }

  private items(): FocusItem[] {
    return this.targets().map((h) => ({ ...h.rect, enabled: !h.disabled, id: h.id }));
  }

  private reachable(h: Hit, x: number, y: number): boolean {
    return inRect(h.rect, x, y) && (!h.clip || inRect(h.clip, x, y));
  }

  hovered(h: Hit): boolean {
    return !this.focus.active && this.reachable(h, this.mx, this.my);
  }

  /** Is the focus ring showing (the keyboard or a pad was the last input)? */
  get keyboardActive(): boolean {
    return this.focus.active;
  }

  /** Id of the focused hit (its `key`, else its label, plus `#n`), or null. */
  get focusedId(): string | null {
    return this.focus.focusedId;
  }

  /** Is the focus ring on the hit added with this key / label? */
  focusedIs(key: string): boolean {
    return this.focus.focusedId?.startsWith(`${key}#`) === true;
  }

  private focusedHit(): Hit | undefined {
    const id = this.focus.focusedId;
    return id === null ? undefined : this.list.find((h) => h.id === id && !h.disabled);
  }

  /** Draw the visible buttons (call inside the right clip for scrolled ones), then the focus ring. */
  draw(ctx: CanvasRenderingContext2D, only?: (h: Hit) => boolean): void {
    const foc = this.focusedHit();
    const tick = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
    for (const h of this.list) {
      if (only && !only(h)) continue;
      const focused = h === foc;
      if (h.invisible && !focused) continue;
      if (h.clip) {
        // Scrolled hits (and their ring) never spill out of the viewport.
        ctx.save();
        ctx.beginPath();
        ctx.rect(h.clip.x, h.clip.y, h.clip.w, h.clip.h);
        ctx.clip();
      }
      if (!h.invisible) {
        drawButton(ctx, h.rect, h.label, this.hovered(h), h.disabled, {
          ...h.style,
          focused,
          tick,
        });
      } else {
        drawFocusRing(ctx, h.clip ? inset(h.rect) : h.rect, tick);
      }
      if (h.clip) ctx.restore();
    }
  }

  move(x: number, y: number): void {
    if (x !== this.mx || y !== this.my) this.focus.release();
    this.mx = x;
    this.my = y;
  }

  /** Topmost enabled hit under the point is activated; returns true when something handled it. */
  click(x: number, y: number): boolean {
    this.mx = x;
    this.my = y;
    this.focus.release();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      if (h && this.reachable(h, x, y)) {
        if (h.disabled) return true;
        h.fn();
        return true;
      }
    }
    return false;
  }

  /** Show the ring on the first hit whose key / label starts with `key` (or the first focusable one). */
  focusOn(key?: string): void {
    const items = this.items();
    this.focus.focusFirst(items, key ? items.find((i) => i.id.startsWith(key))?.id : undefined);
    this.focusedHit()?.onFocus?.();
  }

  /** Move the ring in a direction (the first press only shows it); true when it moved or appeared. */
  nav(dir: 'up' | 'down' | 'left' | 'right'): boolean {
    const before = this.focus.focusedId;
    const items = this.items();
    if (items.length === 0) return false;
    const i = this.focus.move(items, dir);
    if (i < 0) return false;
    const after = items[i]?.id ?? null;
    if (after !== before) this.focusedHit()?.onFocus?.();
    return after !== before;
  }

  /** Press the focused hit; true when one fired. */
  activate(): boolean {
    const h = this.focusedHit();
    if (!h) return false;
    h.fn();
    return true;
  }

  /**
   * Arrows move the ring, OK presses it (the first OK only shows the ring). Returns true when the event was
   * consumed; 'back', 'prev' and 'next' are left to the screen.
   */
  handleNav(ev: NavEvent): boolean {
    switch (ev) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        this.nav(ev);
        return true;
      case 'ok':
        if (!this.focus.active) {
          this.focusOn();
          return true;
        }
        return this.activate();
      default:
        return false;
    }
  }
}

/** The rect shrunk by one pixel per side: a ring drawn around it stays inside the original bounds. */
const inset = (r: Rect): Rect => ({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 });

/** A tab strip: equal-width tabs across `area`, the active one raised and gold. Returns each tab's rect. */
export function drawTabs(
  ctx: CanvasRenderingContext2D,
  area: Rect,
  labels: readonly string[],
  active: number,
  hover: number,
  badges: readonly boolean[] = [],
): Rect[] {
  const n = labels.length;
  const gap = 2;
  const w = Math.floor((area.w - gap * (n - 1)) / n);
  const rects: Rect[] = [];
  labels.forEach((label, i) => {
    const r: Rect = { x: area.x + i * (w + gap), y: area.y, w, h: area.h };
    rects.push(r);
    const on = i === active;
    ctx.fillStyle = UI.ink;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = on ? '#4a4a58' : hover === i ? '#34343f' : '#262630';
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx.fillStyle = on ? UI.gold : '#3c3c48';
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
    if (on) {
      ctx.fillStyle = UI.gold;
      ctx.fillRect(r.x + 1, r.y + r.h - 2, r.w - 2, 1);
    }
    const text = fitText(label, r.w - 4);
    drawText(
      ctx,
      text,
      r.x + Math.floor(r.w / 2),
      r.y + Math.floor(r.h / 2) + 3,
      on ? UI.gold : UI.soft,
      'center',
    );
    if (badges[i]) {
      ctx.fillStyle = '#ff5a4a';
      ctx.fillRect(r.x + r.w - 5, r.y + 2, 3, 3);
    }
  });
  return rects;
}

/** A small pixel checkmark with its top-left at (x, y), 7x6. */
export function drawCheck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color = UI.green,
): void {
  ctx.fillStyle = color;
  const px = [
    [0, 3],
    [1, 4],
    [2, 5],
    [3, 4],
    [4, 3],
    [5, 2],
    [6, 1],
    [7, 0],
  ] as const;
  for (const [dx, dy] of px) ctx.fillRect(x + dx, y + dy, 1, 2);
}

/** 1234567 -> "1,234,567". */
export function groupDigits(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}

/** Compact count for tight spots: 1200 -> "1.2k", 15000 -> "15k", 2500000 -> "2.5M". */
export function shortNumber(n: number): string {
  const v = Math.floor(n);
  if (v < 10000) return groupDigits(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 100000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** "5h 12m", "12m", "<1m" for a reset countdown. */
export function formatCountdown(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return '<1m';
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

/** m:ss for a run clock. */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Text width helper re-exported so screens need one import for layout maths. */
export const tw = (s: string): number => textWidth(s);

/** Inline reward: [emerald] +40 [egg] +1 [star] +1 rare. Draws from (x, y) = icon top-left; returns the width used. */
export function drawRewardInline(
  ctx: CanvasRenderingContext2D,
  reward: MissionReward,
  x: number,
  y: number,
  dim = false,
): number {
  let cx = x;
  const part = (icon: IconName, text: string, color: string): void => {
    if (dim) ctx.globalAlpha = 0.5;
    drawIcon(ctx, icon, cx, y);
    drawText(ctx, text, cx + 13, y + 9, color);
    ctx.globalAlpha = 1;
    cx += 13 + textWidth(text) + 5;
  };
  if (reward.emeralds) part('emerald', `+${reward.emeralds}`, UI.green);
  if (reward.spawnEggs) part('egg', `+${reward.spawnEggs}`, UI.gold);
  if (reward.rareSpawnEggs) part('star', `+${reward.rareSpawnEggs} rare`, '#c98cff');
  return cx - x;
}

export type MedalState = 'unlocked' | 'locked' | 'hidden';

/** A round 20x20 medal (gold rim when unlocked, iron when locked); `icon` is drawn in the middle. */
export function drawMedal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  state: MedalState,
  icon: IconName,
): void {
  const R = 10;
  const span = (r: number, rad: number): [number, number] => {
    const dy = r + 0.5 - R;
    const half = Math.sqrt(Math.max(0, rad * rad - dy * dy));
    const w = Math.round(half * 2);
    return [R - Math.floor(w / 2), w];
  };
  const [rim, face, shine] =
    state === 'unlocked' ? ['#8a5d12', '#f2b630', '#ffe48a'] : ['#101014', '#34343e', '#44444f'];
  for (let r = 0; r < 2 * R; r++) {
    const [ox, ow] = span(r, R);
    ctx.fillStyle = rim;
    ctx.fillRect(x + ox, y + r, ow, 1);
    if (r >= 1 && r < 2 * R - 1) {
      const [ix, iw] = span(r, R - 1.5);
      ctx.fillStyle = face;
      ctx.fillRect(x + ix, y + r, iw, 1);
    }
  }
  ctx.fillStyle = shine;
  ctx.fillRect(x + 6, y + 2, 5, 1);
  ctx.fillRect(x + 4, y + 3, 2, 1);
  if (state === 'hidden') {
    drawText(ctx, '?', x + R, y + R + 3, '#8a8a98', 'center');
    return;
  }
  if (state === 'locked') ctx.globalAlpha = 0.4;
  drawIcon(ctx, icon, x + R - 6, y + R - 6);
  ctx.globalAlpha = 1;
}
