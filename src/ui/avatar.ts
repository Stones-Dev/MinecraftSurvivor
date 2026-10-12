/** Hero avatars for the profile and the leaderboard: a framed portrait, full body when it fits, otherwise head and shoulders. */
import type { Atlas } from '../core/atlas';
import { heroById } from '../data/companions';
import type { Rect } from './panel';
import { companionFrame } from './widgets';

/** Draw hero `heroId` inside the box `r` (frame included). `border` is the frame colour. */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  heroId: string,
  r: Rect,
  t = 0,
  border = '#101014',
  bg = '#23232b',
): void {
  ctx.fillStyle = border;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = bg;
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  const def = heroById(heroId);
  const key = companionFrame(atlas, def, t);
  const size = key ? atlas.frameSize(key) : null;
  if (!key || !size) return;
  const ix = r.x + 1;
  const iy = r.y + 1;
  const iw = r.w - 2;
  const ih = r.h - 2;
  const cx = ix + Math.floor(iw / 2);
  if (ih >= size.h) {
    // Whole hero, standing on the bottom edge, as large as an integer scale allows.
    const k = Math.max(1, Math.min(Math.floor(ih / size.h), Math.floor(iw / size.w) || 1));
    atlas.draw(ctx, key, cx, iy + ih - Math.floor((ih - size.h * k) / 2), false, k);
    return;
  }
  // Head and shoulders: the top of the sprite, clipped to the box.
  ctx.save();
  ctx.beginPath();
  ctx.rect(ix, iy, iw, ih);
  ctx.clip();
  // The sprites have big heads: skip the top rows of hair so the face is in the box.
  atlas.draw(ctx, key, cx, iy + size.h - 4, false, 1);
  ctx.restore();
}
