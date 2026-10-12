/**
 * A tiny global toast queue ("Achievement unlocked", "Mission complete"). Anything can `pushToast`;
 * main.ts draws the queue over whatever screen is showing (hub, results, ...), one toast at a time.
 */
import type { View } from '../core/canvas';
import type { IconName } from './icons';
import { drawToast } from './panel';

export interface ToastItem {
  text: string;
  icon?: IconName;
  color?: string;
}

const LIFE = 3.4;
const MAX_QUEUE = 12;
const queue: ToastItem[] = [];
let age = 0;
let lastMs = -1;

export function pushToast(t: ToastItem): void {
  if (queue.length < MAX_QUEUE) queue.push(t);
}

export function toastCount(): number {
  return queue.length;
}

export function clearToasts(): void {
  queue.length = 0;
  age = 0;
  lastMs = -1;
}

/** Advance the queue by `dt` seconds and draw the current toast (call once per rendered frame). */
export function drawToasts(view: View, nowMs: number): void {
  const dt = lastMs < 0 ? 0 : Math.min(0.1, (nowMs - lastMs) / 1000);
  lastMs = nowMs;
  const cur = queue[0];
  if (!cur) {
    age = 0;
    return;
  }
  age += dt;
  if (age >= LIFE) {
    queue.shift();
    age = 0;
    return;
  }
  drawToast(view.ctx, view.width, cur.text, { age, life: LIFE, icon: cur.icon, color: cur.color });
}
