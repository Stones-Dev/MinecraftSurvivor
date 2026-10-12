/** Drawing of combat entities: enemies, hero, pickups, projectiles, mines, effects, telegraphs. */
import { frameAt } from '../core/animator';
import type { Atlas } from '../core/atlas';
import type { Enemy } from '../entities/enemy';
import type { Fx } from '../entities/fx';
import type { Pickup } from '../entities/pickup';
import type { Player } from '../entities/player';
import type { Projectile } from '../entities/projectile';
import type { Mine, Telegraph } from '../game';
import { drawIcon } from '../ui/icons';
import { drawText } from '../ui/panel';

/** Pick the animation for an enemy's current state and the time into it. */
function enemyAnim(atlas: Atlas, e: Enemy): { id: string; t: number } {
  const base = e.def.sprite;
  const has = (name: string): boolean => atlas.hasAnim(`${base}.${name}`);
  if (e.dying) return { id: `${base}.death`, t: e.deathT };
  if (e.state === 'fuse' && has('explode')) return { id: `${base}.explode`, t: e.animT * 0.8 };
  if (e.state === 'aim' && has('firing')) return { id: `${base}.firing`, t: e.animT };
  if ((e.state === 'windup' || e.state === 'leap') && has('attack'))
    return { id: `${base}.attack`, t: e.animT };
  if (e.def.walkAnim && has('walk')) return { id: `${base}.walk`, t: e.animT };
  return { id: `${base}.idle`, t: e.animT };
}

export function drawEnemy(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  e: Enemy,
  camX: number,
  camY: number,
): void {
  const { id, t } = enemyAnim(atlas, e);
  if (!atlas.hasAnim(id)) return;
  let key = frameAt(atlas.anim(id), t);
  const blink = e.state === 'fuse' && Math.floor(e.animT * 8) % 2 === 0;
  if (e.hurtT > 0 || blink) key += '@flash';
  if (e.dying) ctx.globalAlpha = Math.max(0, 1 - e.deathT / 0.6);
  atlas.draw(ctx, key, e.x - camX, e.y - camY, e.facing < 0);
  ctx.globalAlpha = 1;
  if (e.elite && !e.dying) {
    const x = Math.round(e.x - camX) - 3;
    const y = Math.round(e.y - camY) - 30;
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(x, y + 2, 7, 2);
    ctx.fillRect(x, y, 1, 2);
    ctx.fillRect(x + 3, y - 1, 1, 3);
    ctx.fillRect(x + 6, y, 1, 2);
  }
}

export function drawHero(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  p: Player,
  time: number,
  camX: number,
  camY: number,
): void {
  const swinging = p.swingT > 0;
  const id = swinging ? 'hero.steve.none.sword_wood.swing' : 'hero.steve.none.sword_wood.idle';
  const t = swinging ? 0.33 - p.swingT : time;
  let key = frameAt(atlas.anim(id), t);
  if (p.hurtT > 0) key += '@flash';
  const bob = p.moving && !swinging ? -(Math.floor(time * 10) % 2) : 0;
  if (p.dead) ctx.globalAlpha = 0.5;
  else if (p.iframes > 0 && Math.floor(time * 20) % 2 === 0) ctx.globalAlpha = 0.65;
  atlas.draw(ctx, key, p.x - camX, p.y - camY + bob, p.facing < 0);
  ctx.globalAlpha = 1;
}

export function drawPickup(
  ctx: CanvasRenderingContext2D,
  pk: Pickup,
  camX: number,
  camY: number,
): void {
  const x = Math.round(pk.x - camX);
  const y = Math.round(pk.y - camY) - 3;
  if (pk.kind === 'xp') {
    const bright = Math.floor(pk.age * 6) % 2 === 0;
    ctx.fillStyle = '#1b3a14';
    ctx.fillRect(x - 2, y - 1, 5, 3);
    ctx.fillRect(x - 1, y - 2, 3, 5);
    ctx.fillStyle = bright ? '#c8ff5a' : '#7ddc4a';
    ctx.fillRect(x - 1, y - 1, 3, 3);
  } else {
    ctx.fillStyle = '#0d3b22';
    ctx.fillRect(x - 3, y - 1, 7, 3);
    ctx.fillRect(x - 1, y - 3, 3, 7);
    ctx.fillStyle = '#3fe07a';
    ctx.fillRect(x - 2, y - 1, 5, 3);
    ctx.fillRect(x - 1, y - 2, 3, 5);
    ctx.fillStyle = '#c9ffd9';
    ctx.fillRect(x - 1, y - 1, 1, 1);
  }
}

export function drawProjectile(
  ctx: CanvasRenderingContext2D,
  pr: Projectile,
  camX: number,
  camY: number,
): void {
  const len = Math.hypot(pr.vx, pr.vy) || 1;
  const dx = pr.vx / len;
  const dy = pr.vy / len;
  const x = pr.x - camX;
  const y = pr.y - camY;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(Math.round(x) - 1, Math.round(y + 8), 3, 1);
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle =
      i === 0
        ? pr.friendly
          ? '#e8e8e8'
          : '#ff8a8a'
        : i > 6
          ? pr.friendly
            ? '#f2f2f2'
            : '#b04040'
          : '#8a6a3a';
    ctx.fillRect(Math.round(x - dx * i), Math.round(y - dy * i), 1, 1);
  }
}

export function drawMine(ctx: CanvasRenderingContext2D, m: Mine, camX: number, camY: number): void {
  const flash = m.fuse < 0.5 && Math.floor(m.fuse * 12) % 2 === 0;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(Math.round(m.x - camX) - 5, Math.round(m.y - camY) - 1, 10, 3);
  drawIcon(ctx, 'tnt', Math.round(m.x - camX) - 6, Math.round(m.y - camY) - 11);
  if (flash) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(Math.round(m.x - camX) - 5, Math.round(m.y - camY) - 10, 10, 9);
  }
}

function pixelRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  a0 = 0,
  a1 = Math.PI * 2,
  thick = 1,
): void {
  const steps = Math.max(12, Math.floor(r * 3));
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), thick, thick);
  }
}

export function drawFx(ctx: CanvasRenderingContext2D, f: Fx, camX: number, camY: number): void {
  const x = f.x - camX;
  const y = f.y - camY;
  const k = f.t / f.life;
  if (f.kind === 'arc') {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = f.color;
    pixelRing(ctx, x, y, f.r * (0.7 + 0.3 * k), f.a0, f.a1, 2);
    ctx.fillStyle = '#9fd0ff';
    pixelRing(ctx, x, y, f.r * (0.55 + 0.3 * k), f.a0, f.a1, 1);
    ctx.globalAlpha = 1;
  } else if (f.kind === 'ring') {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = f.color;
    pixelRing(ctx, x, y, f.r * Math.min(1, k * 1.6), 0, Math.PI * 2, 2);
    ctx.fillStyle = '#fff3c4';
    pixelRing(ctx, x, y, f.r * Math.min(1, k * 1.6) * 0.8, 0, Math.PI * 2, 1);
    ctx.globalAlpha = 1;
  } else if (f.kind === 'spark') {
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = f.color;
    ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    ctx.globalAlpha = 1;
  }
}

export function drawFxText(ctx: CanvasRenderingContext2D, f: Fx, camX: number, camY: number): void {
  if (f.kind !== 'text') return;
  ctx.globalAlpha = Math.min(1, 2 * (1 - f.t / f.life));
  drawText(ctx, f.text, f.x - camX, f.y - camY, f.color, 'center');
  ctx.globalAlpha = 1;
}

export function drawTelegraph(
  ctx: CanvasRenderingContext2D,
  t: Telegraph,
  camX: number,
  camY: number,
): void {
  const k = t.t / t.dur;
  const alpha = 0.35 + 0.35 * Math.abs(Math.sin(k * Math.PI * 4));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ff3b3b';
  if (t.kind === 'line') {
    const dx = t.x2 - t.x;
    const dy = t.y2 - t.y;
    const len = Math.hypot(dx, dy) || 1;
    for (let d = 0; d < len + 40; d += 3) {
      ctx.fillRect(
        Math.round(t.x - camX + (dx / len) * d),
        Math.round(t.y - camY + (dy / len) * d),
        1,
        1,
      );
    }
  } else {
    pixelRing(ctx, t.x - camX, t.y - camY, t.r, 0, Math.PI * 2, 1);
    pixelRing(ctx, t.x - camX, t.y - camY, t.r * k, 0, Math.PI * 2, 1);
  }
  ctx.globalAlpha = 1;
}
