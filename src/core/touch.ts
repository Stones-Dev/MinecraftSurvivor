/**
 * Touch controls: a floating virtual joystick on the left side of the screen and on-screen buttons for the hero
 * ability, the item and pause. Pure pointer logic (testable without a DOM) plus `attach` to hook a canvas.
 * Coordinates are art pixels.
 */
import { coarsePointer, textScale, touchEnabled } from './accessibility';
import { stickAim } from './aim';
import { noteInputDevice, type InputSource } from './input';

export interface TouchButton {
  id: 'ability' | 'item' | 'pause';
  x: number;
  y: number;
  /** Drawn radius in art px. */
  r: number;
  /** Radius of the area that reacts to a finger, in art px (never below 22 CSS px, see MIN_TOUCH_CSS). */
  hit: number;
  label: string;
}

/** Smallest touch target edge in CSS px (WCAG 2.5.5 / platform guidance is 44). */
export const MIN_TOUCH_CSS = 44;
/** Extra reach around a drawn button, in art px. */
const HIT_SLOP = 4;
/** The art canvas is shown at an integer zoom (2 on phones and small windows, 3 on large ones). */
const DEFAULT_ZOOM = 2;

const STICK_RADIUS = 30;
const DEADZONE = 0.18;
/** Where the aim stick (manual aim) takes over: the right 40% of the view, the left 60% belongs to the move stick. */
export const AIM_ZONE = 0.6;
/** Drag distance (art px) before the aim stick gives a direction. */
const AIM_DRAG_MIN = 10;

export class TouchInput implements InputSource {
  /** Whether touch controls are being used (set on the first touch, or forced by the setting). */
  active = false;
  /** Setting: 'auto' shows the controls after the first touch, 'on' always, 'off' never. */
  mode: 'auto' | 'on' | 'off' = 'auto';
  /** The device's primary pointer is coarse (a phone or tablet): 'auto' shows the controls right away. */
  coarse = false;
  private stickId: number | null = null;
  /** Manual aim is on (set each step by the run screen): a touch in the right part of the view drags an aim stick. */
  aimEnabled = false;
  private aimId: number | null = null;
  private aimOX = 0;
  private aimOY = 0;
  private aimCX = 0;
  private aimCY = 0;
  private originX = 0;
  private originY = 0;
  private curX = 0;
  private curY = 0;
  private readonly held = new Map<number, TouchButton['id']>();
  private readonly pressed = new Set<TouchButton['id']>();
  /** How many modal screens (level-up cards, pause, ...) cover the run; the stick and buttons are off while > 0. */
  private modals = 0;
  private width = 426;
  private height = 240;
  /** Canvas zoom (CSS px per art px), learnt from the view; sizes the buttons to a finger. */
  private zoom = DEFAULT_ZOOM;

  /**
   * Layout of the buttons for a view size. Every button reacts to a finger within at least 44 CSS px
   * (`zoom` converts from art px). Pause sits in the right column under the kill / emerald counters, away from
   * the left half where the floating stick starts and clear of the minimap and the ability / item buttons;
   * on views too short for that it moves to the top row left of the counters.
   */
  buttons(width = this.width, height = this.height, zoom = this.zoom): TouchButton[] {
    const minHit = MIN_TOUCH_CSS / 2 / zoom;
    const reach = (r: number): number => Math.max(r + HIT_SLOP, minHit);
    const pr = Math.max(9, Math.ceil(minHit));
    const ph = reach(pr);
    const big = textScale() === 2;
    // Right column: from just under the counters (and the golden-apple timer) down to above the ability button.
    const colTop = (big ? 70 : 54) + ph;
    const colBottom = height - 82 - 2 - ph;
    const pause =
      colTop <= colBottom
        ? { x: width - 24, y: colTop }
        : { x: width - (big ? 66 : 58) - ph, y: 7 + ph };
    return [
      { id: 'ability', x: width - 30, y: height - 64, r: 14, hit: reach(14), label: 'Q' },
      { id: 'item', x: width - 62, y: height - 30, r: 13, hit: reach(13), label: '' },
      { id: 'pause', x: pause.x, y: pause.y, r: pr, hit: ph, label: '' },
    ];
  }

  /** Is (x, y) on one of the on-screen buttons (so other tap targets must ignore it)? */
  buttonAt(x: number, y: number, width = this.width, height = this.height): boolean {
    return this.buttons(width, height).some((b) => Math.hypot(x - b.x, y - b.y) <= b.hit);
  }

  get enabled(): boolean {
    return touchEnabled(this.mode, this.coarse, this.active);
  }

  /** Is a modal screen covering the run (the stick and the buttons ignore touches)? */
  get suspended(): boolean {
    return this.modals > 0;
  }

  /**
   * A modal screen opened over the run (call from its `enter`). Drops a running drag and any held button, so a
   * finger resting on a card cannot steer the hero, and ignores new touches on the stick and buttons until
   * every `suspend` has been matched by a `resume` (its `exit`).
   */
  suspend(): void {
    this.modals++;
    this.stickId = null;
    this.aimId = null;
    this.held.clear();
  }

  /** The matching modal screen closed. */
  resume(): void {
    this.modals = Math.max(0, this.modals - 1);
  }

  /** Apply the Settings > Accessibility choice ('auto' = coarse pointer or first touch). */
  setMode(mode: 'auto' | 'on' | 'off', coarse = coarsePointer()): void {
    this.mode = mode;
    this.coarse = coarse;
  }

  /** A pointer went down at (x, y) in art px of a width x height view. Returns true when the touch was taken. */
  pointerDown(
    id: number,
    x: number,
    y: number,
    width: number,
    height: number,
    zoom = this.zoom,
  ): boolean {
    this.width = width;
    this.height = height;
    this.zoom = zoom;
    if (this.mode === 'off') return false;
    this.active = true;
    noteInputDevice('touch');
    // Under a modal the touch belongs to the modal's own buttons (main.ts routes it to the screen on top).
    if (this.modals > 0) return false;
    for (const b of this.buttons(width, height)) {
      if (Math.hypot(x - b.x, y - b.y) <= b.hit) {
        this.held.set(id, b.id);
        this.pressed.add(b.id);
        return true;
      }
    }
    if (this.stickId === null && x < width * 0.6) {
      this.stickId = id;
      this.originX = this.curX = x;
      this.originY = this.curY = y;
      return true;
    }
    // Manual aim: a touch on the right side (clear of every button, which are checked above) is the aim stick.
    if (this.aimEnabled && this.aimId === null && x >= width * AIM_ZONE) {
      this.aimId = id;
      this.aimOX = this.aimCX = x;
      this.aimOY = this.aimCY = y;
      return true;
    }
    return false;
  }

  pointerMove(id: number, x: number, y: number): void {
    if (id === this.aimId) {
      this.aimCX = x;
      this.aimCY = y;
      // Like the move stick, the origin follows a long drag so reversing the aim is instant.
      const dx = x - this.aimOX;
      const dy = y - this.aimOY;
      const d = Math.hypot(dx, dy);
      if (d > STICK_RADIUS * 1.6) {
        const k = (d - STICK_RADIUS * 1.6) / d;
        this.aimOX += dx * k;
        this.aimOY += dy * k;
      }
      return;
    }
    if (id !== this.stickId) return;
    this.curX = x;
    this.curY = y;
    // The stick follows the finger when it is dragged beyond its radius, so reversing direction is instant.
    const dx = x - this.originX;
    const dy = y - this.originY;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS * 1.6) {
      const k = (d - STICK_RADIUS * 1.6) / d;
      this.originX += dx * k;
      this.originY += dy * k;
    }
  }

  pointerUp(id: number): void {
    if (id === this.stickId) this.stickId = null;
    if (id === this.aimId) this.aimId = null;
    this.held.delete(id);
  }

  moveVector(): { x: number; y: number } {
    if (this.stickId === null) return { x: 0, y: 0 };
    const dx = this.curX - this.originX;
    const dy = this.curY - this.originY;
    const d = Math.hypot(dx, dy);
    const m = Math.min(1, d / STICK_RADIUS);
    if (m < DEADZONE) return { x: 0, y: 0 };
    const scale = (m - DEADZONE) / (1 - DEADZONE) / d;
    return { x: dx * scale, y: dy * scale };
  }

  /** Unit aim direction of the aim stick while it is dragged past AIM_DRAG_MIN, else null. */
  aimVector(): { x: number; y: number } | null {
    if (this.aimId === null) return null;
    const dx = this.aimCX - this.aimOX;
    const dy = this.aimCY - this.aimOY;
    return Math.hypot(dx, dy) < AIM_DRAG_MIN ? null : stickAim(dx, dy, 0);
  }

  /** Stick origin and thumb position for drawing, or null when idle. */
  stick(): { ox: number; oy: number; tx: number; ty: number; radius: number } | null {
    if (this.stickId === null) return null;
    const dx = this.curX - this.originX;
    const dy = this.curY - this.originY;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, STICK_RADIUS / d);
    return {
      ox: this.originX,
      oy: this.originY,
      tx: this.originX + dx * k,
      ty: this.originY + dy * k,
      radius: STICK_RADIUS,
    };
  }

  isHeld(id: TouchButton['id']): boolean {
    for (const v of this.held.values()) if (v === id) return true;
    return false;
  }

  pausePressed(): boolean {
    return this.pressed.has('pause');
  }
  confirmPressed(): boolean {
    return false;
  }
  cancelPressed(): boolean {
    return false;
  }
  activePressed(): boolean {
    return this.pressed.has('item');
  }
  abilityPressed(): boolean {
    return this.pressed.has('ability');
  }
  endStep(): void {
    this.pressed.clear();
  }

  /** Hook pointer events on the canvas; `toArt` converts client coordinates to art px and `size` gives the view size. */
  attach(
    canvas: HTMLCanvasElement,
    toArt: (e: PointerEvent) => { x: number; y: number },
    size: () => { width: number; height: number; zoom?: number },
  ): void {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      const { x, y } = toArt(e);
      const s = size();
      this.pointerDown(e.pointerId, x, y, s.width, s.height, s.zoom);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') return;
      const { x, y } = toArt(e);
      this.pointerMove(e.pointerId, x, y);
    });
    const up = (e: PointerEvent): void => this.pointerUp(e.pointerId);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  /** Draw the joystick and buttons (call from the run screen when `enabled`). */
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, zoom = this.zoom): void {
    if (!this.enabled) return;
    this.width = width;
    this.height = height;
    this.zoom = zoom;
    ctx.save();
    ctx.globalAlpha = 0.5;
    const st = this.stick();
    if (st) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.18;
      ring(ctx, st.ox, st.oy, st.radius);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#d8e8ff';
      disc(ctx, st.tx, st.ty, 9);
    } else {
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = '#ffffff';
      ring(ctx, 54, height - 54, STICK_RADIUS);
    }
    if (this.aimId !== null) {
      // The aim stick is orange so it reads as a second stick next to the white move stick.
      const dx = this.aimCX - this.aimOX;
      const dy = this.aimCY - this.aimOY;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, STICK_RADIUS / d);
      ctx.fillStyle = '#ffb061';
      ctx.globalAlpha = 0.2;
      ring(ctx, this.aimOX, this.aimOY, STICK_RADIUS);
      ctx.globalAlpha = 0.55;
      disc(ctx, this.aimOX + dx * k, this.aimOY + dy * k, 9);
    }
    for (const b of this.buttons(width, height)) {
      ctx.globalAlpha = this.isHeld(b.id) ? 0.8 : 0.38;
      ctx.fillStyle = b.id === 'ability' ? '#6ad0ff' : b.id === 'item' ? '#ffe27a' : '#cfcfd8';
      disc(ctx, b.x, b.y, b.r);
      if (b.id === 'pause') {
        // Pause glyph: two bars.
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#101014';
        const h = Math.max(6, Math.round(b.r * 0.8));
        ctx.fillRect(Math.round(b.x) - 3, Math.round(b.y) - Math.floor(h / 2), 2, h);
        ctx.fillRect(Math.round(b.x) + 1, Math.round(b.y) - Math.floor(h / 2), 2, h);
      }
    }
    ctx.restore();
  }
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(Math.round(x) - half, Math.round(y) + dy, half * 2 + 1, 1);
  }
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    const inner = Math.abs(dy) < r - 2 ? Math.floor(Math.sqrt((r - 2) * (r - 2) - dy * dy)) : -1;
    if (inner < 0) ctx.fillRect(Math.round(x) - half, Math.round(y) + dy, half * 2 + 1, 1);
    else {
      ctx.fillRect(Math.round(x) - half, Math.round(y) + dy, half - inner, 1);
      ctx.fillRect(Math.round(x) + inner + 1, Math.round(y) + dy, half - inner, 1);
    }
  }
}
