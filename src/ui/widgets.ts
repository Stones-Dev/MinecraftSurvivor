/**
 * Shared widgets for the hub screens: button lists with hover, keyboard / gamepad focus and tooltips,
 * gamepad menu navigation, toasts, resource pills, screen headers and companion / hero drawing.
 */
import { cb } from '../core/accessibility';
import { frameAt } from '../core/animator';
import type { Atlas } from '../core/atlas';
import type { View } from '../core/canvas';
import { RARITY_COLOR, type CompanionDef } from '../data/companions';
import { keyToNav, spatialFocus, stickDir, type FocusRect, type NavEvent } from './hubModel';
import type { IconName } from './icons';
import { drawIcon } from './icons';
import {
  drawBackdrop,
  drawButton,
  drawFocusRing,
  drawPanel,
  drawSlot,
  drawText,
  drawTooltip,
  fitText,
  inRect,
  textWidth,
  tooltipLines,
  UI,
  type ButtonStyle,
  type Rect,
} from './panel';

export interface BtnOpts extends ButtonStyle {
  /** Text shown while the button is hovered or focused (icon-only buttons default to their label). */
  tooltip?: string;
  /** Stable identity for focus tracking when two buttons share a label. */
  key?: string;
  /** Draws the button instead of the standard look (cards, chips); hover / focus ring still apply. */
  custom?: (ctx: CanvasRenderingContext2D, r: Rect, state: BtnState) => void;
}

export interface BtnState {
  hover: boolean;
  focused: boolean;
  pressed: boolean;
}

export interface Btn {
  rect: Rect;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  opts: BtnOpts;
  id: string;
}

const PRESS_MS = 130;

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Hover tracking, keyboard / gamepad focus and click dispatch for a rebuilt-every-frame list of buttons. */
export class Buttons {
  private list: Btn[] = [];
  private mx = -1;
  private my = -1;
  private focusId: string | null = null;
  /** True once the last input came from the keyboard or a pad (the focus ring shows instead of hover). */
  private kbd = false;
  private pressedId: string | null = null;
  private pressedAt = 0;
  private seen = new Map<string, number>();

  begin(): void {
    this.list = [];
    this.seen.clear();
  }

  add(rect: Rect, label: string, onClick: () => void, disabled = false, opts: BtnOpts = {}): void {
    const base = opts.key ?? label;
    const n = this.seen.get(base) ?? 0;
    this.seen.set(base, n + 1);
    this.list.push({ rect, label, onClick, disabled, opts, id: `${base}#${n}` });
  }

  /** Buttons added this frame (read only). */
  get items(): readonly Btn[] {
    return this.list;
  }

  private hovered(): Btn | undefined {
    if (this.kbd) return undefined;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if (b && inRect(b.rect, this.mx, this.my)) return b;
    }
    return undefined;
  }

  private focused(): Btn | undefined {
    if (!this.kbd) return undefined;
    return this.list.find((b) => b.id === this.focusId && !b.disabled);
  }

  draw(view: View): void {
    const hov = this.hovered();
    const foc = this.focused();
    const tick = nowMs() / 1000;
    for (const b of this.list) {
      const pressed = b.id === this.pressedId && nowMs() - this.pressedAt < PRESS_MS;
      if (b.opts.custom) {
        b.opts.custom(view.ctx, b.rect, { hover: b === hov, focused: b === foc, pressed });
        if (b === foc) drawFocusRing(view.ctx, b.rect, tick);
        continue;
      }
      drawButton(view.ctx, b.rect, b.label, b === hov, b.disabled, {
        ...b.opts,
        pressed,
        focused: b === foc,
        tick,
      });
    }
    this.drawTip(view, hov ?? foc);
  }

  private drawTip(view: View, b: Btn | undefined): void {
    if (!b) return;
    const text = b.opts.tooltip ?? (b.opts.iconOnly ? b.label : '');
    if (!text) return;
    const lines = tooltipLines(text);
    // Anchor to the pointer when it is over the button, else to the button's corner (keyboard focus).
    const ax = b === this.hovered() ? this.mx : b.rect.x + b.rect.w - 6;
    const ay = b === this.hovered() ? this.my : b.rect.y + b.rect.h - 4;
    drawTooltip(view.ctx, lines, ax, ay, view.width, view.height);
  }

  move(x: number, y: number): void {
    if (x !== this.mx || y !== this.my) this.kbd = false;
    this.mx = x;
    this.my = y;
  }

  /** Is the point over any button (enabled or not)? Used to stop clicks falling through to the screen. */
  over(x: number, y: number): boolean {
    return this.list.some((b) => inRect(b.rect, x, y));
  }

  /** Returns true when a button handled the click. */
  click(x: number, y: number): boolean {
    this.mx = x;
    this.my = y;
    this.kbd = false;
    for (const b of this.list) {
      if (!b.disabled && inRect(b.rect, x, y)) {
        this.flash(b);
        b.onClick();
        return true;
      }
    }
    return false;
  }

  private flash(b: Btn): void {
    this.pressedId = b.id;
    this.pressedAt = nowMs();
  }

  private focusRects(): FocusRect[] {
    return this.list.map((b) => ({ ...b.rect, enabled: !b.disabled }));
  }

  private currentIndex(): number {
    return this.list.findIndex((b) => b.id === this.focusId);
  }

  /** Give keyboard focus to the first enabled button (or the one with this label / key). */
  focusOn(key?: string): void {
    this.kbd = true;
    const hit = key ? this.list.find((b) => b.id.startsWith(`${key}#`) && !b.disabled) : undefined;
    this.focusId = (hit ?? this.list.find((b) => !b.disabled))?.id ?? null;
  }

  /** Move the focus ring in a direction; returns true when it moved (or appeared). */
  nav(dir: 'up' | 'down' | 'left' | 'right'): boolean {
    if (this.list.length === 0) return false;
    const cur = this.currentIndex();
    if (!this.kbd || cur < 0 || this.list[cur]?.disabled) {
      this.focusOn();
      return true;
    }
    const next = spatialFocus(this.focusRects(), cur, dir);
    if (next === cur) return false;
    this.focusId = this.list[next]?.id ?? this.focusId;
    return true;
  }

  /** Activate the focused button; returns true when one fired. */
  activate(): boolean {
    const b = this.focused();
    if (!b) return false;
    this.flash(b);
    b.onClick();
    return true;
  }

  /** Is the focus ring currently shown (keyboard or pad was the last input)? */
  get keyboardActive(): boolean {
    return this.kbd;
  }

  /**
   * Navigation events as button actions: arrows move the focus ring, OK presses it. Returns true when the
   * event was consumed ('back', 'prev' and 'next' are left to the screen).
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
        if (!this.kbd) {
          this.focusOn();
          return true;
        }
        return this.activate();
      default:
        return false;
    }
  }

  /** Keyboard code as a navigation event (see `handleNav`). */
  handleKey(code: string): boolean {
    const ev = keyToNav(code);
    return ev ? this.handleNav(ev) : false;
  }
}

// ---------------------------------------------------------------------------------------------------
// Gamepad menu navigation.

const PAD_REPEAT_FIRST = 0.38;
const PAD_REPEAT = 0.12;

interface PadLike {
  axes: readonly number[];
  buttons: readonly { pressed: boolean }[];
}

/**
 * Turns a gamepad (standard mapping) into menu navigation events: d-pad / left stick (with key repeat),
 * A / Start = ok, B = back, bumpers = prev / next. Poll once per update; it never touches the game input.
 */
export class PadNav {
  private down = new Set<string>();
  private timers = new Map<string, number>();

  private pad(): PadLike | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    for (const g of navigator.getGamepads()) if (g) return g;
    return null;
  }

  poll(dt: number): NavEvent[] {
    const pad = this.pad();
    const out: NavEvent[] = [];
    if (!pad) {
      this.down.clear();
      this.timers.clear();
      return out;
    }
    const b = (i: number): boolean => pad.buttons[i]?.pressed === true;
    const held = new Set<string>();
    const stick = stickDir(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    if (b(12) || stick === 'up') held.add('up');
    if (b(13) || stick === 'down') held.add('down');
    if (b(14) || stick === 'left') held.add('left');
    if (b(15) || stick === 'right') held.add('right');
    for (const d of ['up', 'down', 'left', 'right'] as const) {
      if (!held.has(d)) {
        this.timers.delete(d);
        continue;
      }
      const t = this.timers.get(d);
      if (t === undefined) {
        out.push(d);
        this.timers.set(d, PAD_REPEAT_FIRST);
      } else if (t - dt <= 0) {
        out.push(d);
        this.timers.set(d, PAD_REPEAT);
      } else {
        this.timers.set(d, t - dt);
      }
    }
    const edges: [number, NavEvent][] = [
      [0, 'ok'],
      [9, 'ok'],
      [1, 'back'],
      [4, 'prev'],
      [5, 'next'],
    ];
    const nowDown = new Set<string>();
    for (const [i, ev] of edges) {
      if (!b(i)) continue;
      nowDown.add(`b${i}`);
      if (!this.down.has(`b${i}`)) out.push(ev);
    }
    this.down = nowDown;
    return out;
  }
}

// ---------------------------------------------------------------------------------------------------
// Resource pills and headers.

/** A dark slot with an icon and a value ("[emerald] 1840"); returns its rect (for tooltips). */
export function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  icon: IconName,
  text: string,
  color: string = UI.green,
  minW = 0,
): Rect {
  const w = Math.max(minW, 12 + 4 + textWidth(text) + 5);
  const r = { x, y, w, h: 14 };
  drawSlot(ctx, r);
  drawIcon(ctx, icon, x + 2, y + 1);
  drawText(ctx, text, x + 16, y + 10, color);
  return r;
}

/** Draw `r` right-aligned so its right edge is at `right`: returns the pill's rect. */
export function drawPillRight(
  ctx: CanvasRenderingContext2D,
  right: number,
  y: number,
  icon: IconName,
  text: string,
  color: string = UI.green,
): Rect {
  const w = 12 + 4 + textWidth(text) + 5;
  return drawPill(ctx, right - w, y, icon, text, color);
}

/** Screen header: dim dirt backdrop, an oak plank strip with the title, optional subtitle under it. */
export function drawTitle(view: View, title: string, sub?: string): void {
  const { ctx, width, height } = view;
  drawBackdrop(ctx, width, height);
  drawPanel(ctx, { x: -1, y: -1, w: width + 2, h: 21 }, false, null, 'oak');
  drawText(ctx, title, Math.floor(width / 2), 14, '#fff', 'center');
  if (sub) drawText(ctx, fitText(sub, width - 12), Math.floor(width / 2), 30, UI.dim, 'center');
}

// ---------------------------------------------------------------------------------------------------
// Companions and heroes.

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

export interface ActorPose {
  /** Walking animation instead of idle. */
  walking: boolean;
  /** Direction of travel: 1 right, -1 left (idle actors keep the last one). */
  dir: 1 | -1;
}

const IDLE_POSE: ActorPose = { walking: false, dir: 1 };

/** Frame and mirror flag of an actor (hero, pet or ally) for this pose; null when it has no art. */
function actorFrame(
  atlas: Atlas,
  def: CompanionDef,
  t: number,
  pose: ActorPose,
): { key: string; flip: boolean; procedural: boolean } | null {
  if (!pose.walking) {
    const key = companionFrame(atlas, def, t);
    if (!key) return null;
    const left = def.kind === 'hero' && def.faceLeft === true;
    return { key, flip: left ? pose.dir > 0 : pose.dir < 0, procedural: false };
  }
  const walkId = `${def.sprite}.walk`;
  if (def.kind === 'hero' && def.render === 'hero') {
    // The layered hero sheets have no walk frames: the idle pose gets a procedural leg shuffle.
    const key = companionFrame(atlas, def, t);
    return key ? { key, flip: pose.dir < 0, procedural: true } : null;
  }
  if (!atlas.hasAnim(walkId)) {
    const key = companionFrame(atlas, def, t);
    return key ? { key, flip: pose.dir < 0, procedural: false } : null;
  }
  const frames = atlas.anim(walkId).frames;
  if (def.sprite.startsWith('npc.')) {
    // Villager sets: rows of four frames (down, up, side); the side row (8-11) faces left.
    const step = Math.floor(t * 7) & 3;
    const key = frames.length >= 12 ? frames[8 + step] : frames[step % frames.length];
    return key ? { key, flip: pose.dir > 0, procedural: false } : null;
  }
  const key = frameAt(atlas.anim(walkId), t);
  const left = def.kind === 'hero' && def.faceLeft === true;
  return { key, flip: left ? pose.dir > 0 : pose.dir < 0, procedural: false };
}

/**
 * Draw a hero, pet or ally with its feet at (x, y): idle or walking, mirrored to its direction, tinted when
 * the definition asks for it. `scale` grows it from the feet; `fit` (px) caps the drawn height so big
 * sprites (golems, horses) stay inside their box.
 */
export function drawActor(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  def: CompanionDef,
  x: number,
  y: number,
  t: number,
  scale = 1,
  alpha = 1,
  fit = 0,
  pose: ActorPose = IDLE_POSE,
): void {
  const frame = actorFrame(atlas, def, t, pose);
  if (!frame) return;
  const { key, flip, procedural } = frame;
  const size = fit > 0 ? atlas.frameSize(key) : null;
  const k = size ? Math.min(scale, fit / Math.max(size.w * 0.8, size.h)) : scale;
  const bob = def.kind === 'pet' && def.hover ? -4 - Math.round(Math.sin(t * 3) * 1.5) * k : 0;
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (procedural) {
    const stage = Math.floor(t * 8) & 3;
    const legDx = stage === 1 ? 1 : stage === 3 ? -1 : 0;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(k, k);
    atlas.drawWalk(ctx, key, 0, 0, flip, legDx, stage & 1);
    ctx.restore();
  } else if (def.kind === 'hero' && def.tint) {
    atlas.drawTinted(ctx, key, x, y + bob, flip, k, def.tint);
  } else {
    atlas.draw(ctx, key, x, y + bob, flip, k);
  }
  ctx.globalAlpha = 1;
}

/** Draw a companion with its feet at (x, y); `scale` grows it from the feet. Idle pose. */
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
  drawActor(ctx, atlas, def, x, y, t, scale, alpha, fit);
}

/** Black cut-out of a companion (locked entries). */
export function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  def: CompanionDef,
  x: number,
  y: number,
  scale = 1,
): void {
  const key = companionFrame(atlas, def, 0);
  if (!key) return;
  atlas.drawTinted(ctx, key, x, y, false, scale, 'rgba(8,8,14,0.96)');
}

/** Draw a companion centred on `cx` with its feet at `feetY`, shrunk to fit a boxW x boxH box. */
export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  def: CompanionDef,
  cx: number,
  feetY: number,
  t: number,
  boxW: number,
  boxH: number,
  maxScale = 1,
  alpha = 1,
  locked = false,
): void {
  // Size comes from the sprite's own first frame, so any new companion fits its box automatically.
  const key = companionFrame(atlas, def, 0);
  const size = key ? atlas.frameSize(key) : null;
  const scale = size ? Math.max(0.25, Math.min(maxScale, boxW / size.w, boxH / size.h)) : maxScale;
  if (locked) drawSilhouette(ctx, atlas, def, cx, feetY, scale);
  else drawCompanion(ctx, atlas, def, cx, feetY, t, scale, alpha);
}

/** Rarity-coloured badge text. */
export function drawRarity(
  ctx: CanvasRenderingContext2D,
  def: CompanionDef,
  x: number,
  y: number,
  align: CanvasTextAlign = 'left',
): void {
  drawText(ctx, def.rarity.toUpperCase(), x, y, cb(RARITY_COLOR[def.rarity]), align);
}
