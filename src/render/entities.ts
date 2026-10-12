/** Drawing of combat entities: enemies, hero, pickups, projectiles, mines, pools, orbiters, effects, telegraphs. */
import { frameAt } from '../core/animator';
import type { Atlas } from '../core/atlas';
import { ARMOR_IDS, SWORD_IDS } from '../data/tiers';
import type { Enemy } from '../entities/enemy';
import type { Fx } from '../entities/fx';
import type { Pickup } from '../entities/pickup';
import type { Player } from '../entities/player';
import type { Projectile } from '../entities/projectile';
import type { Mine, Orbiter, RunState, Telegraph, Zone } from '../game';
import { drawIcon } from '../ui/icons';
import { drawText } from '../ui/panel';

/** Pick the animation for an enemy's current state and the time into it. */
function enemyAnim(atlas: Atlas, e: Enemy): { id: string; t: number } {
  const base = e.def.sprite;
  const names = e.def.anims ?? {};
  const has = (name: string): boolean => atlas.hasAnim(`${base}.${name}`);
  const pick = (...candidates: (string | undefined)[]): string => {
    for (const c of candidates) if (c && has(c)) return `${base}.${c}`;
    for (const c of ['idle', 'walk', 'summon', 'firing', 'attack'])
      if (has(c)) return `${base}.${c}`;
    return `${base}.idle`;
  };
  if (e.dying) return { id: pick('death'), t: e.deathT };
  switch (e.state) {
    case 'fuse':
      return { id: pick('explode'), t: e.animT * 0.8 };
    case 'aim':
      return { id: pick(names.aim, 'firing', 'attack'), t: e.animT };
    case 'cast':
      return { id: pick(names.cast, 'magic', 'attack'), t: e.animT };
    case 'blink':
      return { id: pick('teleport_away', 'idle'), t: e.animT };
    case 'windup':
      return { id: pick(names.windup, 'attack'), t: e.animT };
    case 'leap':
      return { id: pick(names.dash, 'attack'), t: e.animT };
    default:
      break;
  }
  if (e.def.walkAnim) return { id: pick(names.walk, 'walk'), t: e.animT };
  return { id: pick(names.idle, 'idle'), t: e.animT };
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
  const x = e.x - camX;
  const y = e.y - camY;
  atlas.draw(ctx, key, x, y, e.facing < 0);
  ctx.globalAlpha = 1;
  if (e.dying) return;
  const h = e.def.height ?? 28;
  const rx = Math.round(x);
  const ry = Math.round(y);
  if (e.freezeT > 0) {
    ctx.fillStyle = 'rgba(150,215,255,0.45)';
    ctx.fillRect(rx - 7, ry - h, 14, h);
  } else if (e.slowT > 0) {
    ctx.fillStyle = 'rgba(120,180,255,0.25)';
    ctx.fillRect(rx - 6, ry - h, 12, h);
  }
  if (e.burnT > 0) {
    const f = Math.floor(e.animT * 12) % 3;
    ctx.fillStyle = '#ff8a1c';
    ctx.fillRect(rx - 3 + f, ry - h + 2, 2, 3);
    ctx.fillStyle = '#ffe27a';
    ctx.fillRect(rx + 1 - f, ry - h + 4, 2, 2);
  }
  if (e.poisonT > 0 || e.witherT > 0) {
    ctx.fillStyle = e.witherT > 0 ? '#3a3a3a' : '#6ad04a';
    ctx.fillRect(rx - 1 + (Math.floor(e.animT * 8) % 3), ry - h - 2, 2, 2);
  }
  if (e.stunT > 0 && e.freezeT <= 0) {
    ctx.fillStyle = '#ffe27a';
    ctx.fillRect(rx - 4 + (Math.floor(e.animT * 10) % 8), ry - h - 4, 2, 2);
  }
  if (e.shield > 0) {
    ctx.strokeStyle = 'rgba(120,200,255,0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx - 8.5, ry - h + 0.5, 17, h);
  }
  if (e.elite || e.charged) {
    const cx = rx - 3;
    const cy = ry - h - 2;
    ctx.fillStyle = e.charged ? '#6ad0ff' : '#ffd84a';
    ctx.fillRect(cx, cy + 2, 7, 2);
    ctx.fillRect(cx, cy, 1, 2);
    ctx.fillRect(cx + 3, cy - 1, 1, 3);
    ctx.fillRect(cx + 6, cy, 1, 2);
  }
  if (e.boss) {
    // Boss/mini-boss health bar above the head.
    const w = e.boss === 'boss' ? 28 : 20;
    ctx.fillStyle = '#101014';
    ctx.fillRect(rx - w / 2 - 1, ry - h - 9, w + 2, 4);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(rx - w / 2, ry - h - 8, Math.max(0, Math.floor((w * e.hp) / e.maxHp)), 2);
  }
}

export function drawHero(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  run: RunState,
  camX: number,
  camY: number,
): void {
  const p: Player = run.player;
  const armor = ARMOR_IDS[run.armorTier] ?? 'none';
  const sword = SWORD_IDS[run.swordTier] ?? 'wood';
  const swinging = p.swingT > 0;
  const id = `hero.steve.${armor}.sword_${sword}.${swinging ? 'swing' : 'idle'}`;
  const t = swinging ? 0.33 - p.swingT : run.time;
  const anim = atlas.hasAnim(id) ? atlas.anim(id) : atlas.anim('hero.steve.none.sword_wood.idle');
  let key = frameAt(anim, t);
  if (p.hurtT > 0) key += '@flash';
  const bob = p.moving && !swinging ? -(Math.floor(run.time * 10) % 2) : 0;
  if (p.dead) ctx.globalAlpha = 0.5;
  else if (p.iframes > 0 && Math.floor(run.time * 20) % 2 === 0) ctx.globalAlpha = 0.65;
  const x = p.x - camX;
  const y = p.y - camY + bob;
  atlas.draw(ctx, key, x, y, p.facing < 0);
  ctx.globalAlpha = 1;
  if (armor === 'enchanted' || sword === 'enchanted') {
    // Enchantment glint: a few purple sparkles drifting over the hero.
    for (let i = 0; i < 3; i++) {
      const a = run.time * 3 + i * 2.1;
      ctx.fillStyle = i % 2 === 0 ? '#d9a6ff' : '#9b5cff';
      ctx.fillRect(
        Math.round(x + Math.cos(a) * 7),
        Math.round(y - 14 + Math.sin(a * 1.3) * 11),
        1,
        1,
      );
    }
  }
  if (run.shield.has && run.shield.ready) {
    drawIcon(ctx, 'shield', Math.round(x + p.facing * 9 - 6), Math.round(y - 20));
  }
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

function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  c: string,
): void {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Projectiles are drawn lifted off the ground with a small shadow; lobbed ones follow an arc. */
export function drawProjectile(
  ctx: CanvasRenderingContext2D,
  pr: Projectile,
  camX: number,
  camY: number,
  heroX: number,
  heroY: number,
): void {
  const x = pr.x - camX;
  let y = pr.y - camY;
  const len = Math.hypot(pr.vx, pr.vy) || 1;
  const dx = pr.vx / len;
  const dy = pr.vy / len;
  let lift = 0;
  if (pr.lobDur > 0) {
    const t = Math.min(1, pr.lobT / pr.lobDur);
    lift = Math.sin(Math.PI * t) * pr.height;
  }
  px(ctx, x - 1, y + 8, 3, 1, 'rgba(0,0,0,0.25)');
  y -= lift;
  switch (pr.style) {
    case 'arrow':
    case 'bolt': {
      const thick = pr.style === 'bolt' ? 2 : 1;
      for (let i = 0; i < 9; i++) {
        const c =
          i === 0
            ? pr.friendly
              ? '#e8e8e8'
              : '#ff8a8a'
            : i > 6
              ? pr.friendly
                ? '#f2f2f2'
                : '#b04040'
              : pr.style === 'bolt'
                ? '#5a4a3a'
                : '#8a6a3a';
        px(ctx, x - dx * i, y - dy * i, thick, thick, c);
      }
      if (pr.burn > 0) px(ctx, x - dx * 2, y - dy * 2 - 2, 2, 2, '#ff8a1c');
      break;
    }
    case 'trident': {
      const a = Math.atan2(dy, dx);
      for (let i = 0; i < 11; i++)
        px(ctx, x - Math.cos(a) * i, y - Math.sin(a) * i, 1, 1, i < 3 ? '#6fe0e0' : '#7a5a34');
      for (const o of [-2, 0, 2])
        px(
          ctx,
          x + Math.cos(a) * 2 - Math.sin(a) * o,
          y + Math.sin(a) * 2 + Math.cos(a) * o,
          1,
          1,
          '#6fe0e0',
        );
      break;
    }
    case 'snowball':
      px(ctx, x - 2, y - 1, 5, 3, '#e8f4ff');
      px(ctx, x - 1, y - 2, 3, 5, '#e8f4ff');
      px(ctx, x - 1, y - 1, 1, 1, '#ffffff');
      px(ctx, x + 1, y + 1, 1, 1, '#9fc8ee');
      break;
    case 'potion_harm':
    case 'potion_poison': {
      const c = pr.style === 'potion_harm' ? '#e0457b' : '#5fc24a';
      px(ctx, x - 2, y - 3, 5, 5, c);
      px(ctx, x - 1, y - 5, 3, 2, '#d8d8e0');
      px(ctx, x - 1, y - 2, 1, 1, '#ffffff');
      break;
    }
    case 'fireball':
      px(ctx, x - 2, y - 2, 5, 5, '#ff7a1c');
      px(ctx, x - 1, y - 1, 3, 3, '#ffe27a');
      break;
    case 'skull':
    case 'skull_blue': {
      const body = pr.style === 'skull' ? '#2a2a30' : '#46c8ff';
      px(ctx, x - 2, y - 2, 5, 5, body);
      px(ctx, x - 1, y - 1, 1, 1, '#ffffff');
      px(ctx, x + 1, y - 1, 1, 1, '#ffffff');
      break;
    }
    case 'hook': {
      const steps = 14;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        px(
          ctx,
          heroX - camX + (pr.x - heroX) * t,
          heroY - camY - 8 + (pr.y - heroY + 8) * t,
          1,
          1,
          '#d8d8d8',
        );
      }
      px(ctx, x - 1, y - 1, 3, 3, '#7a5a34');
      px(ctx, x, y, 1, 1, '#ff4d4d');
      break;
    }
    case 'spit':
      px(ctx, x - 2, y - 2, 4, 4, '#e8f0c8');
      px(ctx, x - 1, y - 1, 2, 2, '#b8d070');
      break;
    case 'bubble':
      px(ctx, x - 2, y - 2, 5, 5, 'rgba(140,220,255,0.7)');
      px(ctx, x - 1, y - 1, 1, 1, '#ffffff');
      break;
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

const ZONE_COLORS: Record<Zone['kind'], [string, string]> = {
  burn: ['rgba(255,110,20,0.38)', '#ffd84a'],
  poison: ['rgba(80,200,70,0.36)', '#c8ff90'],
  wither: ['rgba(40,30,50,0.5)', '#9a9aa8'],
  frost: ['rgba(150,210,255,0.36)', '#ffffff'],
  harm: ['rgba(220,60,110,0.36)', '#ffc0d8'],
};

/** Damage pool: a dithered pixel disc with rising sparkles. */
export function drawZone(
  ctx: CanvasRenderingContext2D,
  z: Zone,
  camX: number,
  camY: number,
  time: number,
): void {
  const [fill, spark] = ZONE_COLORS[z.kind];
  const fade = Math.min(1, (z.dur - z.t) / 0.6);
  const cx = Math.round(z.x - camX);
  const cy = Math.round(z.y - camY);
  const rx = Math.round(z.r);
  const ry = Math.max(2, Math.round(z.r * 0.72));
  ctx.globalAlpha = fade;
  ctx.fillStyle = fill;
  for (let y = -ry; y <= ry; y++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    ctx.fillRect(cx - half, cy + y, half * 2 + 1, 1);
  }
  ctx.fillStyle = spark;
  for (let i = 0; i < 4; i++) {
    const a = time * 1.5 + i * 1.7 + z.x;
    const sx = cx + Math.cos(a * 1.3) * rx * 0.7;
    const sy = cy - ((time * 14 + i * 9) % 12) + Math.sin(a) * ry * 0.5;
    ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
  }
  ctx.globalAlpha = 1;
}

export function drawOrbiter(
  ctx: CanvasRenderingContext2D,
  o: Orbiter,
  camX: number,
  camY: number,
  time: number,
): void {
  const x = Math.round(o.x - camX);
  const y = Math.round(o.y - camY);
  if (o.style === 'rod') {
    const flick = Math.floor(time * 14) % 2 === 0;
    px(ctx, x - 1, y - 3, 3, 7, '#c26a14');
    px(ctx, x, y - 3, 1, 7, '#ffd84a');
    px(ctx, x - 1, y - 4, 3, 1, flick ? '#fff3a0' : '#ff9a1c');
    px(ctx, x - 1, y + 4, 3, 1, '#ff9a1c');
  } else {
    px(ctx, x - 2, y - 2, 5, 5, '#d8d8e0');
    px(ctx, x - 1, y - 1, 3, 3, '#ffffff');
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

function pixelLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ctx.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, 1);
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
  } else if (f.kind === 'bolt') {
    ctx.globalAlpha = k < 0.5 ? 1 : 1 - (k - 0.5) * 2;
    for (const pass of [0, 1]) {
      ctx.fillStyle = pass === 0 ? '#ffe27a' : '#ffffff';
      const off = pass === 0 ? 1 : 0;
      for (let i = 0; i + 3 < f.pts.length; i += 2) {
        pixelLine(
          ctx,
          (f.pts[i] ?? 0) - camX + off,
          (f.pts[i + 1] ?? 0) - camY,
          (f.pts[i + 2] ?? 0) - camX + off,
          (f.pts[i + 3] ?? 0) - camY,
        );
      }
    }
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
