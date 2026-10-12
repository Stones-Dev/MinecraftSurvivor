/** Vertical scrolling for canvas lists: offset state, wheel/keys, scrollbar drawing and clipping. */
import type { Rect } from './panel';

export class Scroller {
  offset = 0;
  private maxOffset = 0;

  /** Tell the scroller how tall the content is and how much of it is visible; clamps the offset. */
  fit(contentH: number, viewH: number): void {
    this.maxOffset = Math.max(0, Math.ceil(contentH - viewH));
    this.offset = Math.max(0, Math.min(this.maxOffset, this.offset));
  }

  get scrollable(): boolean {
    return this.maxOffset > 0;
  }

  by(px: number): void {
    this.offset = Math.max(0, Math.min(this.maxOffset, Math.round(this.offset + px)));
  }

  /** Keep the span [top, top + h) (content coordinates) inside the view. */
  reveal(top: number, h: number, viewH: number): void {
    if (top < this.offset) this.offset = Math.max(0, Math.floor(top));
    else if (top + h > this.offset + viewH) {
      this.offset = Math.min(this.maxOffset, Math.ceil(top + h - viewH));
    }
  }

  reset(): void {
    this.offset = 0;
  }

  /** Scrollbar thumb geometry inside `track` (null when nothing scrolls). */
  thumb(track: Rect): Rect | null {
    if (this.maxOffset <= 0) return null;
    const total = this.maxOffset + track.h;
    const h = Math.max(8, Math.round((track.h * track.h) / total));
    const y = track.y + Math.round(((track.h - h) * this.offset) / this.maxOffset);
    return { x: track.x, y, w: track.w, h };
  }

  /** Click on the track: page up above the thumb, page down below it. Returns true when handled. */
  clickTrack(track: Rect, y: number): boolean {
    const t = this.thumb(track);
    if (!t) return false;
    this.by(y < t.y ? -track.h : y >= t.y + t.h ? track.h : 0);
    return true;
  }

  drawBar(ctx: CanvasRenderingContext2D, track: Rect): void {
    const t = this.thumb(track);
    if (!t) return;
    ctx.fillStyle = '#0a0a0e';
    ctx.fillRect(track.x, track.y, track.w, track.h);
    ctx.fillStyle = '#6b6b73';
    ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.fillStyle = '#a9a9b4';
    ctx.fillRect(t.x, t.y, t.w, 1);
  }
}

/** Run `draw` with the canvas clipped to `r`. */
export function withClip(ctx: CanvasRenderingContext2D, r: Rect, draw: () => void): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  draw();
  ctx.restore();
}
