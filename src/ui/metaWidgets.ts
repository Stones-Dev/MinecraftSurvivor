/** Shared bits of the missions, achievements and results screens: hit list, tabs, checkmark, formatting. */
import type { MissionReward } from '../data/missions';
import { drawIcon, type IconName } from './icons';
import {
  drawButton,
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
}

/** Buttons and click targets rebuilt every frame, with hover tracking and viewport clipping. */
export class HitList {
  private list: Hit[] = [];
  private mx = -1;
  private my = -1;

  begin(): void {
    this.list = [];
  }

  add(
    rect: Rect,
    label: string,
    fn: () => void,
    opts: Partial<Pick<Hit, 'disabled' | 'clip' | 'style' | 'invisible'>> = {},
  ): void {
    this.list.push({
      rect,
      label,
      fn,
      disabled: opts.disabled ?? false,
      clip: opts.clip ?? null,
      style: opts.style ?? {},
      invisible: opts.invisible ?? false,
    });
  }

  private reachable(h: Hit, x: number, y: number): boolean {
    return inRect(h.rect, x, y) && (!h.clip || inRect(h.clip, x, y));
  }

  hovered(h: Hit): boolean {
    return this.reachable(h, this.mx, this.my);
  }

  /** Draw the visible buttons (call inside the right clip for scrolled ones). */
  draw(ctx: CanvasRenderingContext2D, only?: (h: Hit) => boolean): void {
    for (const h of this.list) {
      if (h.invisible || (only && !only(h))) continue;
      drawButton(ctx, h.rect, h.label, this.hovered(h), h.disabled, h.style);
    }
  }

  move(x: number, y: number): void {
    this.mx = x;
    this.my = y;
  }

  /** Topmost enabled hit under the point is activated; returns true when something handled it. */
  click(x: number, y: number): boolean {
    this.move(x, y);
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
}

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
