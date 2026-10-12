/** Drawing of combat entities: enemies, hero, pickups, projectiles, mines, pools, orbiters, effects, telegraphs. */
import { frameAt } from '../core/animator';
import type { Atlas } from '../core/atlas';
import { ARMOR_IDS, SWORD_IDS } from '../data/tiers';
import type { Ally, PetState } from '../entities/ally';
import type { EnemyDef } from '../data/enemies';
import type { Enemy } from '../entities/enemy';
import type { Fx } from '../entities/fx';
import type { Pickup } from '../entities/pickup';
import type { Player } from '../entities/player';
import type { Projectile } from '../entities/projectile';
import type { Mine, Orbiter, RunState, Telegraph, Zone } from '../game';
import { propStateOf } from '../systems/interact';
import type { Npc } from '../systems/npcs';
import type { Prop } from '../world/props';
import { drawIcon } from '../ui/icons';
import { drawText } from '../ui/panel';

const animCache = new WeakMap<EnemyDef, Record<string, string>>();
const animOut = { id: '', t: 0 };

/** Resolve (and memoise per enemy type and state slot) the first available animation among the candidates. */
function resolveAnim(
  atlas: Atlas,
  e: Enemy,
  slot: string,
  c1?: string,
  c2?: string,
  c3?: string,
): string {
  let m = animCache.get(e.def);
  if (!m) {
    m = {};
    animCache.set(e.def, m);
  }
  const hit = m[slot];
  if (hit) return hit;
  const base = e.def.sprite;
  let id = `${base}.idle`;
  let found = false;
  for (const c of [c1, c2, c3]) {
    if (c && atlas.hasAnim(`${base}.${c}`)) {
      id = `${base}.${c}`;
      found = true;
      break;
    }
  }
  if (!found) {
    for (const c of ['idle', 'walk', 'summon', 'firing', 'attack']) {
      if (atlas.hasAnim(`${base}.${c}`)) {
        id = `${base}.${c}`;
        break;
      }
    }
  }
  m[slot] = id;
  return id;
}

/** Pick the animation for an enemy's current state and the time into it (returns a shared object). */
function enemyAnim(atlas: Atlas, e: Enemy): { id: string; t: number } {
  const names = e.def.anims ?? {};
  const out = animOut;
  if (e.dying) {
    out.id = resolveAnim(atlas, e, 'death', 'death');
    out.t = e.deathT;
    return out;
  }
  out.t = e.animT;
  switch (e.state) {
    case 'fuse':
      out.id = resolveAnim(atlas, e, 'fuse', 'explode');
      out.t = e.animT * 0.8;
      return out;
    case 'aim':
      out.id = resolveAnim(atlas, e, 'aim', names.aim, 'firing', 'attack');
      return out;
    case 'cast':
      out.id = resolveAnim(atlas, e, 'cast', names.cast, 'magic', 'attack');
      return out;
    case 'blink':
      out.id = resolveAnim(atlas, e, 'blink', 'teleport_away', 'idle');
      return out;
    case 'windup':
      out.id = resolveAnim(atlas, e, 'windup', names.windup, 'attack');
      return out;
    case 'leap':
      out.id = resolveAnim(atlas, e, 'leap', names.dash, 'attack');
      return out;
    default:
      break;
  }
  out.id = e.def.walkAnim
    ? resolveAnim(atlas, e, 'walk', names.walk, 'walk')
    : resolveAnim(atlas, e, 'idle', names.idle, 'idle');
  return out;
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
  const x = e.rx - camX;
  const y = e.ry - camY;
  const sc = e.def.scale ?? 1;
  atlas.draw(ctx, key, x, y, e.facing < 0, sc);
  ctx.globalAlpha = 1;
  if (e.dying) return;
  const h = (e.def.height ?? 28) * (sc > 1 ? 1 : 1);
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
  const name = run.loadout.hero;
  const id = `hero.${name}.${armor}.sword_${sword}.${swinging ? 'swing' : 'idle'}`;
  const walking = p.moving && !swinging && !p.dead;
  const t = swinging ? 0.33 - p.swingT : run.time * (walking ? 1.5 : 1);
  const anim = atlas.hasAnim(id) ? atlas.anim(id) : atlas.anim(`hero.${name}.none.sword_wood.idle`);
  let key = frameAt(anim, t);
  if (p.hurtT > 0) key += '@flash';
  if (p.dead) ctx.globalAlpha = 0.5;
  else if (p.iframes > 0 && Math.floor(run.time * 20) % 2 === 0) ctx.globalAlpha = 0.65;
  const x = p.rx - camX;
  const y = p.ry - camY;
  if (walking) {
    // Distance-driven walk cycle: the legs shuffle +1, 0, -1, 0 px and the body rises on the passing step.
    const stage = Math.floor(p.walkPhase) & 3;
    const legDx = stage === 1 ? 1 : stage === 3 ? -1 : 0;
    atlas.drawWalk(ctx, key, x, y, p.facing < 0, legDx, stage & 1);
  } else atlas.draw(ctx, key, x, y, p.facing < 0);
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
  const x = Math.round(pk.rx - camX);
  const y = Math.round(pk.ry - camY) - 3;
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
  const x = pr.rx - camX;
  let y = pr.ry - camY;
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
          heroX - camX + (pr.rx - heroX) * t,
          heroY - camY - 8 + (pr.ry - heroY + 8) * t,
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

const discCache = new Map<number, HTMLCanvasElement>();
const ZONE_INDEX: Record<Zone['kind'], number> = {
  burn: 0,
  poison: 1,
  wither: 2,
  frost: 3,
  harm: 4,
};

/** Pre-rendered ellipse for a pool (one drawImage per zone instead of a fillRect per scanline). */
function zoneDisc(kind: Zone['kind'], rx: number, ry: number, fill: string): HTMLCanvasElement {
  const key = (ZONE_INDEX[kind] * 512 + rx) * 512 + ry;
  let c = discCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = rx * 2 + 1;
  c.height = ry * 2 + 1;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = fill;
    for (let y = -ry; y <= ry; y++) {
      const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      g.fillRect(rx - half, ry + y, half * 2 + 1, 1);
    }
  }
  discCache.set(key, c);
  return c;
}

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
  ctx.drawImage(zoneDisc(z.kind, rx, ry, fill), cx - rx, cy - ry);
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

/** All floating texts in one pass; each number is one cached pre-rendered image (see ui/font.ts). */
export function drawFxTexts(
  ctx: CanvasRenderingContext2D,
  fx: readonly Fx[],
  camX: number,
  camY: number,
): void {
  for (const f of fx) {
    if (f.kind !== 'text') continue;
    const x = Math.round(f.x - camX);
    const y = Math.round(f.y - camY);
    if (x < -40 || y < -20 || x > ctx.canvas.width + 40 || y > ctx.canvas.height + 20) continue;
    ctx.globalAlpha = Math.min(1, 2 * (1 - f.t / f.life));
    drawText(ctx, f.text, x, y, f.color, 'center');
  }
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

/** NPC sprites: villagers use a 4-direction sheet (down 0-3, up 4-7, side 8-11); llamas are side-on. */
export function drawNpc(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  n: Npc,
  camX: number,
  camY: number,
  time: number,
): void {
  const id = `${n.sprite}.${n.kind === 'llama' && !n.moving ? 'idle' : 'walk'}`;
  if (!atlas.hasAnim(id)) return;
  const anim = atlas.anim(id);
  const x = n.x - camX;
  const y = n.y - camY;
  if (n.kind === 'llama') {
    atlas.draw(ctx, frameAt(anim, time + n.id), x, y, n.dx < 0);
    return;
  }
  const f = Math.floor(time * 6) % 4;
  const vertical = Math.abs(n.dy) > Math.abs(n.dx);
  const base = vertical ? (n.dy > 0 ? 0 : 4) : 8;
  const idx = base + (n.moving ? f : 0);
  const key = anim.frames[idx] ?? anim.frames[0];
  if (key) atlas.draw(ctx, key, x, y, !vertical && n.dx > 0);
}

/** Nether portal: obsidian frame with a swirling purple core. */
export function drawPortal(
  ctx: CanvasRenderingContext2D,
  portal: { x: number; y: number; left: number },
  camX: number,
  camY: number,
  time: number,
): void {
  const x = Math.round(portal.x - camX);
  const y = Math.round(portal.y - camY);
  const blink = portal.left < 8 && Math.floor(time * 6) % 2 === 0;
  if (blink) ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#14101e';
  ctx.fillRect(x - 13, y - 34, 26, 36);
  ctx.fillStyle = '#2a1f45';
  ctx.fillRect(x - 11, y - 32, 22, 32);
  for (let row = 0; row < 30; row++) {
    const phase = Math.sin(time * 3 + row * 0.5) * 3;
    ctx.fillStyle = row % 3 === 0 ? '#b06bff' : row % 3 === 1 ? '#7a3ad8' : '#5a24b0';
    ctx.fillRect(Math.round(x - 9 + phase), y - 31 + row, 18, 1);
  }
  ctx.fillStyle = '#e0c4ff';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(
      Math.round(x - 8 + ((time * 14 + i * 5) % 16)),
      Math.round(y - 4 - ((time * 18 + i * 9) % 28)),
      1,
      1,
    );
  }
  ctx.globalAlpha = 1;
}

/** Flag marking where the lost villager has to be escorted. */
export function drawRescueFlag(
  ctx: CanvasRenderingContext2D,
  m: { x: number; y: number },
  camX: number,
  camY: number,
  time: number,
): void {
  const x = Math.round(m.x - camX);
  const y = Math.round(m.y - camY);
  ctx.fillStyle = '#6b4a2a';
  ctx.fillRect(x, y - 22, 2, 22);
  ctx.fillStyle = Math.floor(time * 4) % 2 === 0 ? '#ffd84a' : '#ffb347';
  ctx.fillRect(x + 2, y - 22, 9, 6);
  ctx.fillStyle = 'rgba(255,216,74,0.35)';
  ctx.fillRect(x - 10, y - 2, 22, 3);
}

/** Small extras on props: locked-chest progress, campfire flames and ash. */
export function drawPropExtra(
  ctx: CanvasRenderingContext2D,
  run: RunState,
  p: Prop,
  camX: number,
  camY: number,
): void {
  const kind = p.kind;
  if (kind !== 'locked_chest' && kind !== 'campfire' && kind !== 'beacon') return;
  const x = Math.round(p.x - camX);
  const y = Math.round(p.y - camY);
  const st = propStateOf(run, p);
  if (p.kind === 'locked_chest' && st && st.t > 0.05) {
    const k = Math.min(1, st.t / 3.5);
    ctx.fillStyle = '#101014';
    ctx.fillRect(x - 9, y - 18, 18, 4);
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(x - 8, y - 17, Math.floor(16 * k), 2);
  } else if (p.kind === 'campfire') {
    if (st && st.hp <= 0) {
      ctx.fillStyle = 'rgba(30,24,20,0.7)';
      ctx.fillRect(x - 6, y - 10, 12, 8);
    } else {
      const f = Math.floor(run.time * 10) % 3;
      ctx.fillStyle = f === 0 ? '#ffe27a' : '#ff9a1c';
      ctx.fillRect(x - 2 + f, y - 14 - f, 3, 3);
    }
  } else if (p.kind === 'beacon') {
    ctx.fillStyle = `rgba(160,245,255,${(0.25 + 0.15 * Math.sin(run.time * 4)).toFixed(2)})`;
    ctx.fillRect(x - 2, y - 80, 4, 62);
  }
}

/** Pick the animation id for a companion sprite prefix, trying the usual action names in order. */
function companionAnim(atlas: Atlas, sprite: string, moving: boolean): string | null {
  const order = moving
    ? ['walk', 'flying', 'jump', 'swim', 'idle']
    : ['idle', 'walk', 'flying', 'jump', 'swim'];
  for (const a of order) if (atlas.hasAnim(`${sprite}.${a}`)) return `${sprite}.${a}`;
  return null;
}

/** An ally: fades when downed, flashes when hurt, villagers use their 4-direction walk rows. */
export function drawAlly(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  a: Ally,
  camX: number,
  camY: number,
  time: number,
): void {
  const id = companionAnim(atlas, a.def.sprite, a.moving);
  if (!id) return;
  const anim = atlas.anim(id);
  const x = a.rx - camX;
  const y = a.ry - camY + 4;
  if (a.downed) ctx.globalAlpha = 0.35 + 0.1 * Math.sin(time * 6);
  if (a.def.sprite.startsWith('npc.') && id.endsWith('.walk')) {
    const f = Math.floor(time * 6) % 4;
    const vertical = Math.abs(a.dy) > Math.abs(a.dx);
    const base = vertical ? (a.dy > 0 ? 0 : 4) : 8;
    const key = anim.frames[base + (a.moving ? f : 0)] ?? anim.frames[0];
    if (key) atlas.draw(ctx, key, x, y, !vertical && a.dx > 0);
  } else {
    atlas.draw(
      ctx,
      frameAt(anim, time + a.slot),
      x,
      y,
      a.facing < 0 && !a.def.sprite.startsWith('pet.'),
    );
  }
  ctx.globalAlpha = 1;
  if (!a.downed && a.hp < a.maxHp) {
    const w = 14;
    ctx.fillStyle = '#101014';
    ctx.fillRect(Math.round(x - w / 2) - 1, Math.round(y) - 22, w + 2, 4);
    ctx.fillStyle = '#4ac04a';
    ctx.fillRect(Math.round(x - w / 2), Math.round(y) - 21, Math.round((w * a.hp) / a.maxHp), 2);
  }
  if (a.hurtT > 0) {
    ctx.fillStyle = 'rgba(255,60,60,0.25)';
    ctx.fillRect(Math.round(x) - 6, Math.round(y) - 14, 12, 14);
  }
}

/** The pet: flies/hops/walks after the hero, mirrored by its facing. */
export function drawPet(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  p: PetState,
  camX: number,
  camY: number,
  time: number,
): void {
  const id = companionAnim(atlas, p.def.sprite, p.moving);
  if (!id) return;
  const flying = id.endsWith('.flying') || p.def.id === 'parrot' || p.def.id === 'bee';
  const bob = flying ? Math.sin(time * 5 + p.t) * 2 - 6 : 0;
  atlas.draw(ctx, frameAt(atlas.anim(id), time), p.rx - camX, p.ry - camY + 4 + bob, p.facing < 0);
}
