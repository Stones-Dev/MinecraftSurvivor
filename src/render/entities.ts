/** Drawing of combat entities: enemies, hero, pickups, projectiles, mines, pools, orbiters, effects, telegraphs. */
import { cb, reduceFlash } from '../core/accessibility';
import { frameAt } from '../core/animator';
import type { Atlas } from '../core/atlas';
import { feetShift } from '../core/feet';
import { heroById, type HeroDef } from '../data/companions';
import { ARMOR_IDS, SWORD_IDS } from '../data/tiers';
import type { Ally, PetState } from '../entities/ally';
import type { EnemyDef } from '../data/enemies';
import type { Enemy } from '../entities/enemy';
import type { Fx } from '../entities/fx';
import type { Pickup } from '../entities/pickup';
import type { Player } from '../entities/player';
import type { Projectile } from '../entities/projectile';
import type { Mine, Orbiter, RunState, Telegraph, Zone } from '../game';
import { AURA_RADIUS } from '../systems/allies';
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
  // Reduce flashing: no hit flash, and the fuse blink drops from 8 Hz to a slow 2 Hz.
  const blink = e.state === 'fuse' && Math.floor(e.animT * (reduceFlash() ? 2 : 8)) % 2 === 0;
  if ((e.hurtT > 0 && !reduceFlash()) || blink) key += '@flash';
  if (e.dying) ctx.globalAlpha = Math.max(0, 1 - e.deathT / 0.6);
  const x = e.rx - camX;
  const y = e.ry - camY;
  const sc = e.def.scale ?? 1;
  atlas.draw(ctx, key, x, y, e.def.faceLeft ? e.facing > 0 : e.facing < 0, sc);
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

/** Sword swing length (weapons/sword.ts sets `swingT` to this). */
const SWING_TIME = 0.33;
/** Animation names tried for a sprite hero's attack (sword swing), in order. */
const ATTACK_ANIMS = ['attack', 'firing', 'throw', 'magic', 'ram'] as const;
const DEATH_ANIMS = ['death'] as const;
const WALK_ANIMS = ['walk'] as const;
const IDLE_ANIMS = ['idle', 'walk'] as const;
/** Armor tier colours for the ring under sprite heroes (they keep their look; the ring shows the tier). */
const ARMOR_RING = [
  '#f2f2f2',
  '#b07a48',
  '#a8aeb8',
  '#e8e8f0',
  '#ffd84a',
  '#6fe0e0',
  '#6a5a6e',
  '#c08bff',
];
const spriteAnimCache = new Map<string, Record<string, string | null>>();

/** First animation `<base>.<name>` that exists among `names`, memoised per base and slot. */
export function spriteHeroAnim(
  atlas: Atlas,
  base: string,
  slot: string,
  names: readonly string[],
): string | null {
  let m = spriteAnimCache.get(base);
  if (!m) {
    m = {};
    spriteAnimCache.set(base, m);
  }
  const hit = m[slot];
  if (hit !== undefined) return hit;
  let found: string | null = null;
  for (const n of names) {
    if (atlas.hasAnim(`${base}.${n}`)) {
      found = `${base}.${n}`;
      break;
    }
  }
  m[slot] = found;
  return found;
}

/** Frame of a one-shot animation at `progress` 0..1, spread evenly over its first `limit` frames. */
function frameAtProgress(
  frames: readonly string[],
  progress: number,
  limit = frames.length,
): string | undefined {
  const n = Math.max(1, Math.min(frames.length, limit));
  return frames[Math.max(0, Math.min(n - 1, Math.floor(progress * n)))];
}

/** Flat ellipse of pixels (the tier ring under sprite heroes). */
function pixelEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  const steps = Math.max(12, Math.floor(rx * 3));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1);
  }
}

/** Villager-style 4-direction rows (down 0-3, up 4-7, side 8-11): base frame index and mirror for a direction. */
function npcRow(dx: number, dy: number): { base: number; flip: boolean } {
  const vertical = Math.abs(dy) > Math.abs(dx);
  npcOut.base = vertical ? (dy > 0 ? 0 : 4) : 8;
  npcOut.flip = !vertical && dx > 0;
  return npcOut;
}
const npcOut = { base: 0, flip: false };

/**
 * A hero drawn from a mob / NPC sprite set: death, cast, attack (sword swings), walk (frames follow the
 * distance walked) or idle. NPC sets pick their row from the last move direction; side-view mobs mirror with
 * the hero's facing. Returns the drawn sprite height (for the overlays above it).
 */
export function drawSpriteHero(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  run: RunState,
  def: HeroDef,
  x: number,
  y: number,
): number {
  const p: Player = run.player;
  const base = def.sprite;
  const npc = base.startsWith('npc.');
  const sc = def.scale ?? 1;
  let key: string | undefined;
  const castId =
    p.castT > 0 ? spriteHeroAnim(atlas, base, 'cast', def.castAnims ?? ATTACK_ANIMS) : null;
  const attackId = p.swingT > 0 ? spriteHeroAnim(atlas, base, 'attack', ATTACK_ANIMS) : null;
  // A melee swing faces the attack; walking, idling and casting follow the body facing (the movement).
  const face = attackId && !castId && !p.dead ? p.attackFacing : p.facing;
  let flip = def.faceLeft ? face > 0 : face < 0;
  let alpha = 1;
  const row = npc ? npcRow(p.moveDX, p.moveDY) : null;
  if (row) flip = row.flip;
  if (p.dead) {
    const deathId = spriteHeroAnim(atlas, base, 'death', DEATH_ANIMS);
    if (deathId) {
      key = frameAt(atlas.anim(deathId), run.deadT);
      alpha = Math.max(0.35, 1 - run.deadT * 0.5);
    } else alpha = Math.max(0, 0.7 - run.deadT * 0.6);
  } else if (castId) {
    key = frameAtProgress(
      atlas.anim(castId).frames,
      1 - p.castT / Math.max(0.01, p.castDur),
      def.castFrames,
    );
  } else if (attackId) {
    key = frameAtProgress(atlas.anim(attackId).frames, 1 - p.swingT / SWING_TIME, def.attackFrames);
  } else if (p.moving) {
    const walkId = spriteHeroAnim(atlas, base, 'walk', WALK_ANIMS);
    if (walkId) {
      const frames = atlas.anim(walkId).frames;
      const step = Math.floor(p.walkPhase);
      key =
        row && frames.length >= 12 ? frames[row.base + (step & 3)] : frames[step % frames.length];
    }
  }
  if (key === undefined) {
    const idleId = spriteHeroAnim(atlas, base, 'idle', IDLE_ANIMS);
    if (!idleId) return 0;
    const anim = atlas.anim(idleId);
    key = row && anim.frames.length >= 12 ? anim.frames[row.base] : frameAt(anim, run.time);
    if (key === undefined) return 0;
  }
  // Tier ring at the feet: marks the hero among look-alike mobs and shows the armor tier.
  if (!p.dead) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = ARMOR_RING[run.armorTier] ?? '#f2f2f2';
    pixelEllipse(ctx, x, y + 1, 8 * sc, 3 * sc);
  }
  if (p.iframes > 0 && !p.dead && (reduceFlash() || Math.floor(run.time * 20) % 2 === 0))
    alpha *= 0.65;
  ctx.globalAlpha = alpha;
  if (p.hurtT > 0 && !reduceFlash()) atlas.draw(ctx, `${key}@flash`, x, y, flip, sc);
  else if (def.tint) atlas.drawTinted(ctx, key, x, y, flip, sc, def.tint);
  else atlas.draw(ctx, key, x, y, flip, sc);
  ctx.globalAlpha = 1;
  return (atlas.frameSize(key)?.h ?? 32) * sc;
}

const DECOY_TINT = 'rgba(176,150,255,0.45)';

/** Decoys (Illusioner): translucent violet copies of the hero (flickering as they fade), drawn under him. */
function drawDecoys(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  run: RunState,
  def: HeroDef,
  camX: number,
  camY: number,
): void {
  const fake = `${def.sprite}_fake`;
  const base = def.render === 'sprite' ? (atlas.hasAnim(`${fake}.idle`) ? fake : def.sprite) : '';
  const id = base ? spriteHeroAnim(atlas, base, 'idle', IDLE_ANIMS) : null;
  for (let i = 0; i < run.decoys.length; i++) {
    const d = run.decoys[i];
    if (!d) continue;
    const left = d.dur - d.t;
    ctx.globalAlpha = left < 1 && Math.floor(run.time * 12) % 2 === 0 ? 0.3 : 0.8;
    const x = d.x - camX;
    const y = d.y - camY;
    if (id)
      atlas.drawTinted(
        ctx,
        frameAt(atlas.anim(id), run.time + i * 0.37),
        x,
        y,
        def.faceLeft ? d.facing > 0 : d.facing < 0,
        def.scale ?? 1,
        DECOY_TINT,
      );
    else {
      ctx.fillStyle = '#9a7bff';
      pixelRing(ctx, x, y - 10, 7, 0, Math.PI * 2, 1);
    }
  }
  ctx.globalAlpha = 1;
}

export function drawHero(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  run: RunState,
  camX: number,
  camY: number,
): void {
  const p: Player = run.player;
  const def = heroById(run.loadout.hero);
  projQuality = run.quality;
  if (run.decoys.length > 0) drawDecoys(ctx, atlas, run, def, camX, camY);
  const armor = ARMOR_IDS[run.armorTier] ?? 'none';
  const sword = SWORD_IDS[run.swordTier] ?? 'wood';
  const x = p.rx - camX;
  const y = p.ry - camY;
  let height = 30;
  if (def.render === 'sprite') height = drawSpriteHero(ctx, atlas, run, def, x, y);
  else drawLayeredHero(ctx, atlas, run, def.hero, armor, sword, x, y);
  if (run.heroBuff && run.time < run.heroBuff.until && !p.dead) {
    // Gold Rush: gold flecks spiralling up the hero.
    ctx.fillStyle = '#ffd84a';
    for (let i = 0; i < 4; i++) {
      const a = run.time * 5 + i * 1.6;
      const h = (run.time * 30 + i * 9) % height;
      ctx.fillRect(Math.round(x + Math.cos(a) * 8), Math.round(y - h), 1, 2);
    }
  }
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
    const sy = def.render === 'sprite' ? Math.max(20, Math.round(height * 0.6)) : 20;
    drawIcon(ctx, 'shield', Math.round(x + p.facing * 9 - 6), Math.round(y - sy));
  }
}

/** Steve / Alex / Rana: the layered hero sheets, swapped by armor and sword tier. */
function drawLayeredHero(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  run: RunState,
  name: string,
  armor: string,
  sword: string,
  x: number,
  y: number,
): void {
  const p: Player = run.player;
  const swinging = p.swingT > 0 && !p.dead;
  const id = `hero.${name}.${armor}.sword_${sword}.${swinging ? 'swing' : 'idle'}`;
  const walking = p.moving && !p.dead;
  // The walk bob and leg shuffle keep going during a swing; the swing clock is the swing's own.
  const t = swinging ? SWING_TIME - p.swingT : run.time * (walking ? 1.5 : 1);
  const idleAnim = atlas.anim(`hero.${name}.none.sword_wood.idle`);
  const anim = atlas.hasAnim(id) ? atlas.anim(id) : idleAnim;
  let key = frameAt(anim, t);
  // The swing frames are anchored differently from the idle ones (feet 2-6 px higher, a little sideways):
  // shift them so the feet stay where the idle feet are.
  let offX = 0;
  let offY = 0;
  if (swinging) {
    const idleId = `hero.${name}.${armor}.sword_${sword}.idle`;
    const ref = atlas.hasAnim(idleId) ? atlas.anim(idleId).frames[0] : idleAnim.frames[0];
    const shift = feetShift(ref ? atlas.feetOf(ref) : null, atlas.feetOf(key));
    offX = shift.dx;
    offY = shift.dy;
  }
  if (p.hurtT > 0 && !reduceFlash()) key += '@flash';
  if (p.dead) ctx.globalAlpha = 0.5;
  else if (p.iframes > 0 && (reduceFlash() || Math.floor(run.time * 20) % 2 === 0))
    ctx.globalAlpha = 0.65;
  // A swing faces the attack, the rest of the body follows the movement.
  const flip = (swinging ? p.attackFacing : p.facing) < 0;
  if (walking) {
    // Distance-driven walk cycle: the legs shuffle +1, 0, -1, 0 px and the body rises on the passing step.
    const stage = Math.floor(p.walkPhase) & 3;
    const legDx = stage === 1 ? 1 : stage === 3 ? -1 : 0;
    atlas.drawWalk(ctx, key, x, y, flip, legDx, stage & 1, undefined, offX, offY);
  } else atlas.draw(ctx, key, x, y, flip, 1, offX, offY);
  ctx.globalAlpha = 1;
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

/** Quality tier of the run, remembered from `drawHero` (drawn every frame) for callers that do not pass one. */
let projQuality: 0 | 1 | 2 = 2;
/** Spin rate of boomerangs (the thrown trident), radians per second: 720 degrees. */
const BOOMERANG_SPIN = 4 * Math.PI;
const TRAIL_STEPS = [0, 4, 8] as const;

/** Soft ground shadow: a small ellipse of three translucent rows (one row on the lowest tier). */
function projShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  q: number,
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  const cx = Math.round(x);
  const cy = Math.round(y);
  ctx.fillRect(cx - half, cy, half * 2 + 1, 1);
  if (q === 0) return;
  ctx.fillRect(cx - half + 1, cy - 1, half * 2 - 1, 1);
  ctx.fillRect(cx - half + 1, cy + 1, half * 2 - 1, 1);
}

/**
 * A short faint streak behind a fast projectile (no objects, no arrays: a handful of rects, fewer on lower
 * quality tiers). `from` is the distance behind the position where it starts, `dx/dy` the unit direction.
 */
function projTrail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  from: number,
  color: string,
  q: number,
): void {
  const n = TRAIL_STEPS[q] ?? 0;
  if (n === 0) return;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = 0.3 * (1 - i / n);
    ctx.fillRect(Math.round(x - dx * (from + i)), Math.round(y - dy * (from + i)), 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** Arrow / bolt: head (bright tip, barbs), wooden shaft, feathers; `len` px from the tip back. */
function drawShaft(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  len: number,
  thick: number,
  tip: string,
  head: string,
  shaft: string,
  feather: string,
): void {
  const nx = -dy;
  const ny = dx;
  const featherAt = len - 3;
  for (let i = 0; i < len; i++) {
    const bx = x - dx * i;
    const by = y - dy * i;
    if (i < 3) {
      px(ctx, bx, by, thick, thick, i === 0 ? tip : head);
      if (i === 2) {
        // Barbs: the head reads as a small triangle.
        px(ctx, bx + nx, by + ny, 1, 1, head);
        px(ctx, bx - nx, by - ny, 1, 1, head);
      }
    } else if (i >= featherAt) {
      px(ctx, bx, by, thick, thick, feather);
      px(ctx, bx + nx * 1.5, by + ny * 1.5, 1, 1, feather);
      px(ctx, bx - nx * 1.5, by - ny * 1.5, 1, 1, feather);
    } else px(ctx, bx, by, thick, thick, shaft);
  }
}

/** The thrown trident: a shaft with a bright three-prong head; `a` is the angle of the head. */
function drawTridentSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  a: number,
  len: number,
): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  // Centre the sprite on the projectile position so a spinning trident turns around its middle.
  const hx = x + c * (len / 2);
  const hy = y + s * (len / 2);
  for (let i = 0; i < len; i++)
    px(ctx, hx - c * i, hy - s * i, 1, 1, i < 6 ? '#e8ffff' : '#8a6a3a');
  // Prongs: two outer tines and a longer middle one, with a cross-guard behind them.
  for (const o of [-2, 2]) {
    for (let k = 0; k < 4; k++)
      px(
        ctx,
        hx - c * (1 - k) - s * o,
        hy - s * (1 - k) + c * o,
        1,
        1,
        k === 3 ? '#ffffff' : '#7ff0f0',
      );
  }
  for (let k = 0; k < 3; k++)
    px(ctx, hx + c * k, hy + s * k, 1, 1, k === 2 ? '#ffffff' : '#9ff8f8');
  for (const o of [-2, -1, 0, 1, 2])
    px(ctx, hx - c * 4 - s * o, hy - s * 4 + c * o, 1, 1, '#5fc8c8');
}

/** Projectiles are drawn lifted off the ground with a small shadow; lobbed ones follow an arc. */
export function drawProjectile(
  ctx: CanvasRenderingContext2D,
  pr: Projectile,
  camX: number,
  camY: number,
  heroX: number,
  heroY: number,
  quality: 0 | 1 | 2 = projQuality,
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
  const long = pr.style === 'arrow' || pr.style === 'bolt' || pr.style === 'trident';
  // The ground shadow stays on the ground (a lobbed shot shrinks it as it rises).
  projShadow(ctx, x, y + 8, long ? 3 : 1 + (lift > 8 ? 0 : 1), quality);
  y -= lift;
  switch (pr.style) {
    case 'arrow':
    case 'bolt': {
      const bolt = pr.style === 'bolt';
      const f = pr.friendly;
      const n = bolt ? 12 : 14;
      drawShaft(
        ctx,
        x,
        y,
        dx,
        dy,
        n,
        bolt ? 2 : 1,
        f ? '#ffffff' : '#ffb0b0',
        f ? '#c9ccd6' : '#e05a5a',
        bolt ? '#5a4a3a' : '#9a7440',
        f ? '#f4f4f4' : '#c04848',
      );
      projTrail(ctx, x, y, dx, dy, n, f ? '#ffffff' : '#ff8a8a', quality);
      if (pr.burn > 0) px(ctx, x - dx * 3, y - dy * 3 - 2, 2, 2, '#ff8a1c');
      break;
    }
    case 'trident': {
      // The hero's thrown trident is a boomerang: it spins at 720 degrees per second around its middle, in both
      // directions of the flight. A hostile (drowned) trident flies point first.
      const a = pr.boomerang ? pr.life * BOOMERANG_SPIN : Math.atan2(dy, dx);
      drawTridentSprite(ctx, x, y, a, 18);
      projTrail(ctx, x, y, dx, dy, pr.boomerang ? 4 : 18, '#8ff4f4', quality);
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
    case 'seed':
      px(ctx, x - 1, y - 1, 3, 2, '#1c1c14');
      px(ctx, x - 1, y - 1, 1, 1, '#5a5a40');
      break;
    case 'soul':
      px(ctx, x - 2, y - 2, 5, 5, 'rgba(70,220,230,0.45)');
      px(ctx, x - 1, y - 1, 3, 3, '#5ff0f0');
      px(ctx, x - dx * 4, y - dy * 4, 2, 2, 'rgba(95,240,240,0.5)');
      px(ctx, x, y, 1, 1, '#e8ffff');
      break;
  }
}

export function drawMine(ctx: CanvasRenderingContext2D, m: Mine, camX: number, camY: number): void {
  const flash = m.fuse < 0.5 && Math.floor(m.fuse * (reduceFlash() ? 2 : 12)) % 2 === 0;
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
  } else if (f.kind === 'anvil') {
    // Falls from 70 px above the target, accelerating, and lands as the fx ends.
    const ax = Math.round(x);
    const ay = Math.round(y - 70 * (1 - k * k));
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(
      ax - 6 + Math.round(3 * (1 - k)),
      Math.round(y) - 1,
      12 - Math.round(6 * (1 - k)),
      2,
    );
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(ax - 8, ay - 13, 16, 5);
    ctx.fillRect(ax - 3, ay - 8, 6, 4);
    ctx.fillRect(ax - 6, ay - 4, 12, 4);
    ctx.fillStyle = '#5a5a66';
    ctx.fillRect(ax - 7, ay - 12, 14, 3);
    ctx.fillRect(ax - 2, ay - 8, 4, 4);
    ctx.fillRect(ax - 5, ay - 3, 10, 2);
    ctx.fillStyle = '#8a8a96';
    ctx.fillRect(ax - 7, ay - 12, 14, 1);
  } else if (f.kind === 'bolt') {
    ctx.globalAlpha = k < 0.5 ? 1 : 1 - (k - 0.5) * 2;
    // `a0 === 1` draws a single thin line in `color` (fishing lines); otherwise a two-tone lightning bolt.
    const line = f.a0 === 1;
    for (const pass of line ? [1] : [0, 1]) {
      ctx.fillStyle = line ? f.color : pass === 0 ? '#ffe27a' : '#ffffff';
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

/** Width in px of a line telegraph's strip. */
export const TELEGRAPH_STRIP = 6;

/**
 * Steady alpha for a telegraph: a slow pulse (under 1 Hz, +-15%) unless flashing is reduced, which keeps it flat.
 * `age` is the seconds since the telegraph started.
 */
export function telegraphPulse(age: number, reduced: boolean): number {
  return reduced ? 1 : 1 + 0.15 * Math.sin(age * 5);
}

/**
 * Attack telegraphs: a line is a 6 px wide translucent strip with a brighter edge, a circle a translucent disc whose
 * fill grows toward the edge as the charge timer runs out. Hostile ones are red, an ally's blue; both go through
 * the colour-blind remap. The pulse is slow and absent with "reduce flashing" (never a strobe).
 */
export function drawTelegraph(
  ctx: CanvasRenderingContext2D,
  t: Telegraph,
  camX: number,
  camY: number,
): void {
  const k = Math.max(0, Math.min(1, t.t / t.dur));
  const pulse = telegraphPulse(t.t, reduceFlash());
  const hex = t.friendly ? '#7dd0ff' : '#ff3b3b';
  const prev = ctx.globalAlpha;
  ctx.fillStyle = cb(hex);
  ctx.strokeStyle = cb(hex);
  if (t.kind === 'line') {
    const dx = t.x2 - t.x;
    const dy = t.y2 - t.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const half = TELEGRAPH_STRIP / 2;
    const x0 = t.x - camX;
    const y0 = t.y - camY;
    const reach = len + 40; // the shot keeps going past the aim point
    const nx = -uy * half;
    const ny = ux * half;
    const x1 = x0 + ux * reach;
    const y1 = y0 + uy * reach;
    ctx.beginPath();
    ctx.moveTo(x0 + nx, y0 + ny);
    ctx.lineTo(x1 + nx, y1 + ny);
    ctx.lineTo(x1 - nx, y1 - ny);
    ctx.lineTo(x0 - nx, y0 - ny);
    ctx.closePath();
    ctx.globalAlpha = Math.min(0.5, (0.25 + 0.1 * k) * pulse);
    ctx.fill();
    // Brighter edges.
    ctx.globalAlpha = Math.min(0.9, (0.55 + 0.25 * k) * pulse);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + nx, y0 + ny);
    ctx.lineTo(x1 + nx, y1 + ny);
    ctx.moveTo(x0 - nx, y0 - ny);
    ctx.lineTo(x1 - nx, y1 - ny);
    ctx.stroke();
  } else {
    const cx = t.x - camX;
    const cy = t.y - camY;
    ctx.globalAlpha = 0.12 * pulse;
    ctx.beginPath();
    ctx.arc(cx, cy, t.r, 0, Math.PI * 2);
    ctx.fill();
    // The charge: a brighter disc that grows to the edge as the timer runs out.
    ctx.globalAlpha = Math.min(0.5, (0.2 + 0.2 * k) * pulse);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0.5, t.r * k), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.min(0.9, 0.6 * pulse + 0.2 * k);
    pixelRing(ctx, cx, cy, t.r, 0, Math.PI * 2, 1);
  }
  ctx.globalAlpha = prev;
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
function companionAnim(
  atlas: Atlas,
  sprite: string,
  moving: boolean,
  hover = false,
): string | null {
  const order = hover
    ? ['flying', 'swim', 'idle', 'walk', 'jump']
    : moving
      ? ['walk', 'flying', 'jump', 'swim', 'idle']
      : ['idle', 'walk', 'flying', 'jump', 'swim'];
  for (const a of order) if (atlas.hasAnim(`${sprite}.${a}`)) return `${sprite}.${a}`;
  return null;
}

/** Animal-sheet sprites (`pet.*`) face left; ally and hero sheets face right. */
function companionFlip(sprite: string, facing: number): boolean {
  return sprite.startsWith('pet.') ? facing > 0 : facing < 0;
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
  const role = a.def.role;
  // Ground marks drawn under the ally: the Shepherd's wool decoy and the Furnace Golem's heat.
  if (role === 'shepherd' && a.decoy.t > 0 && !a.downed) {
    const dx = Math.round(a.decoy.x - camX);
    const dy = Math.round(a.decoy.y - camY);
    if (a.decoy.t > 1 || Math.floor(time * 8) % 2 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(dx - 6, dy - 1, 12, 3);
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(dx - 5, dy - 9, 10, 9);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(dx - 5, dy - 9, 10, 2);
      ctx.fillStyle = '#c8c8d0';
      ctx.fillRect(dx - 5, dy - 2, 10, 2);
      ctx.fillRect(dx - 2, dy - 6, 2, 2);
    }
  }
  if (role === 'furnace_golem' && !a.downed) {
    ctx.fillStyle = `rgba(255,120,30,${(0.1 + 0.05 * Math.sin(time * 6)).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(a.rx - camX, a.ry - camY + 2, AURA_RADIUS, AURA_RADIUS * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // The Goat lowers its horns while winding up and charging.
  const ram = role === 'goat' && a.phase > 0 && atlas.hasAnim(`${a.def.sprite}.ram`);
  const id = ram ? `${a.def.sprite}.ram` : companionAnim(atlas, a.def.sprite, a.moving);
  if (!id) return;
  const anim = atlas.anim(id);
  const x = a.rx - camX;
  const y = a.ry - camY + 4;
  const sc = a.def.scale ?? 1;
  if (a.downed) ctx.globalAlpha = 0.35 + 0.1 * Math.sin(time * 6);
  let key: string | undefined;
  if (a.def.sprite.startsWith('npc.') && id.endsWith('.walk')) {
    const f = Math.floor(time * 6) % 4;
    const vertical = Math.abs(a.dy) > Math.abs(a.dx);
    const base = vertical ? (a.dy > 0 ? 0 : 4) : 8;
    key = anim.frames[base + (a.moving ? f : 0)] ?? anim.frames[0];
    if (key) atlas.draw(ctx, key, x, y, !vertical && a.dx > 0, sc);
  } else {
    key = frameAt(anim, time + a.slot);
    atlas.draw(ctx, key, x, y, companionFlip(a.def.sprite, a.facing), sc);
  }
  ctx.globalAlpha = 1;
  // Health bar just above the head (tall golems included).
  const h = key ? Math.min(64, Math.max(18, (atlas.frameSize(key)?.h ?? 18) * sc)) : 18;
  if (!a.downed && a.hp < a.maxHp) {
    const w = 14;
    ctx.fillStyle = '#101014';
    ctx.fillRect(Math.round(x - w / 2) - 1, Math.round(y - h) - 4, w + 2, 4);
    ctx.fillStyle = '#4ac04a';
    ctx.fillRect(Math.round(x - w / 2), Math.round(y - h) - 3, Math.round((w * a.hp) / a.maxHp), 2);
  }
  if (a.hurtT > 0) {
    ctx.fillStyle = 'rgba(255,60,60,0.25)';
    ctx.fillRect(Math.round(x) - 6, Math.round(y) - 14, 12, 14);
  }
}

/** The pet: flies/hops/walks after the hero, mirrored by its facing; hovering pets bob in the air. */
export function drawPet(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  p: PetState,
  camX: number,
  camY: number,
  time: number,
): void {
  const hover = p.def.hover === true;
  const id = companionAnim(atlas, p.def.sprite, p.moving, hover);
  if (!id) return;
  const flying = hover || id.endsWith('.flying') || p.def.id === 'parrot' || p.def.id === 'bee';
  const bob = flying ? Math.sin(time * 5 + p.t) * 2 - 6 : 0;
  const x = p.rx - camX;
  const y = p.ry - camY + 4;
  if (flying) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(Math.round(x) - 4, Math.round(y) - 1, 8, 2);
  }
  atlas.draw(
    ctx,
    frameAt(atlas.anim(id), time),
    x,
    y + bob,
    companionFlip(p.def.sprite, p.facing),
    p.def.scale ?? 1,
  );
}
