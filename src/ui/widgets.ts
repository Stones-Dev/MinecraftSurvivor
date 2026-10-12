/** Small shared UI helpers for hub screens: button rows with hover, back handling and companion portraits. */
import { frameAt } from '../core/animator';
import type { Atlas } from '../core/atlas';
import type { View } from '../core/canvas';
import { RARITY_COLOR, type CompanionDef } from '../data/companions';
import { drawButton, drawText, inRect, type Rect } from './panel';

export interface Btn {
  rect: Rect;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** Hover tracking and click dispatch for a rebuilt-every-frame list of buttons. */
export class Buttons {
  private list: Btn[] = [];
  private mx = -1;
  private my = -1;

  begin(): void {
    this.list = [];
  }

  add(rect: Rect, label: string, onClick: () => void, disabled = false): void {
    this.list.push({ rect, label, onClick, disabled });
  }

  draw(view: View): void {
    for (const b of this.list) {
      drawButton(view.ctx, b.rect, b.label, inRect(b.rect, this.mx, this.my), b.disabled);
    }
  }

  move(x: number, y: number): void {
    this.mx = x;
    this.my = y;
  }

  /** Returns true when a button handled the click. */
  click(x: number, y: number): boolean {
    this.mx = x;
    this.my = y;
    for (const b of this.list) {
      if (!b.disabled && inRect(b.rect, x, y)) {
        b.onClick();
        return true;
      }
    }
    return false;
  }
}

/** Idle frame key of a companion at time t, falling back to the first walk frame (villagers). */
export function companionFrame(atlas: Atlas, def: CompanionDef, t: number): string | null {
  const base = def.kind === 'hero' ? `${def.sprite}` : def.sprite;
  const tries = [`${base}.idle`, `${base}.walk`, `${base}.flying`, `${base}.jump`];
  for (const id of tries) {
    if (!atlas.hasAnim(id)) continue;
    const anim = atlas.anim(id);
    if (id.endsWith('.walk') && def.sprite.startsWith('npc.')) return anim.frames[0] ?? null;
    return frameAt(anim, t);
  }
  return null;
}

/** Draw a companion with its feet at (x, y); `scale` grows it from the feet. */
export function drawCompanion(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  def: CompanionDef,
  x: number,
  y: number,
  t: number,
  scale = 1,
  alpha = 1,
  fit = 0,
): void {
  const key = companionFrame(atlas, def, t);
  if (!key) return;
  if (alpha < 1) ctx.globalAlpha = alpha;
  // `fit` caps the drawn height (and width) in px so big sprites (golems, horses) stay inside their box.
  const size = fit > 0 ? atlas.frameSize(key) : null;
  const k = size ? Math.min(scale, fit / Math.max(size.w * 0.8, size.h)) : scale;
  atlas.draw(ctx, key, x, y, false, k);
  ctx.globalAlpha = 1;
}

/** Rarity-coloured badge text. */
export function drawRarity(
  ctx: CanvasRenderingContext2D,
  def: CompanionDef,
  x: number,
  y: number,
  align: CanvasTextAlign = 'left',
): void {
  drawText(ctx, def.rarity.toUpperCase(), x, y, RARITY_COLOR[def.rarity], align);
}

/** Title bar used by hub screens. */
export function drawTitle(view: View, title: string, sub?: string): void {
  view.ctx.fillStyle = '#16161e';
  view.ctx.fillRect(0, 0, view.width, view.height);
  drawText(view.ctx, title, view.width / 2, 16, '#ffd84a', 'center');
  if (sub) drawText(view.ctx, sub, view.width / 2, 27, '#9a9aa8', 'center');
}
