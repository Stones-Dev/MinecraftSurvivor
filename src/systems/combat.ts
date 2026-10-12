/** Damage, kills, projectiles, mines, pools and orbiters (BRIEF sections 4 and 9). */
import { sweepHit } from '../core/geom';
import type { Enemy } from '../entities/enemy';
import { makeFx } from '../entities/fx';
import { Pickup } from '../entities/pickup';
import type { Projectile } from '../entities/projectile';
import { makeEnemy } from './spawner';
import { applyStatus } from './status';
import type { RunState } from '../game';

const SPARK_COLORS = ['#ffffff', '#ffe27a', '#ffb347'];

/**
 * Hurt an enemy: damage (shield first), knockback away from (fromX, fromY), flash, number, sparks.
 * `quiet` suppresses the feedback (used for damage-over-time ticks).
 */
/** Per quality tier (low, medium, high): hit sparks per hit and the live-effect cap that gates damage numbers. */
const QUALITY_SPARKS = [0, 1, 3] as const;
const QUALITY_TEXT_CAP = [70, 150, 260] as const;

export function damageEnemy(
  run: RunState,
  e: Enemy,
  dmg: number,
  fromX: number,
  fromY: number,
  knock: number,
  quiet = false,
): void {
  if (e.dying || dmg <= 0) return;
  if (e.shield > 0) {
    const absorbed = Math.min(e.shield, dmg);
    e.shield -= absorbed;
    dmg -= absorbed;
    if (dmg <= 0) return;
  }
  e.hp -= dmg;
  if (!quiet) {
    e.hurtT = 0.1;
    run.emit('hit');
    run.hitPoints.push(e.x, e.y);
    const dx = e.x - fromX;
    const dy = e.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    const k = knock * run.mods.knock * (e.boss ? 0.2 : 1);
    e.kx += (dx / len) * k;
    e.ky += (dy / len) * k;
    if (e.def.packAggro) {
      const mates: Enemy[] = [];
      run.hash.query(e.x, e.y, 140, mates);
      for (const m of mates) if (m.def.packAggro) m.angry = 6;
    }
    if (run.fx.length < QUALITY_TEXT_CAP[run.quality]) {
      run.fx.push(makeFx('text', e.x, e.y - 16, 0.55, { text: String(Math.round(dmg)), vy: -26 }));
    }
    for (let i = 0; i < QUALITY_SPARKS[run.quality]; i++) {
      const a = run.rng.fx.range(0, Math.PI * 2);
      const sp = run.rng.fx.range(30, 70);
      run.fx.push(
        makeFx('spark', e.x, e.y - 8, 0.3, {
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          color: run.rng.fx.pick(SPARK_COLORS),
        }),
      );
    }
  }
  if (e.hp <= 0) killEnemy(run, e, true);
}

export function killEnemy(run: RunState, e: Enemy, reward: boolean): void {
  if (e.dying) return;
  e.state = 'dying';
  e.deathT = 0;
  e.hp = 0;
  if (!reward) return;
  run.kills++;
  run.onKill(e);
  const m = run.mods;
  const slimy = e.def.id.startsWith('slime') || e.def.id.startsWith('magma_cube');
  const slimeXp = slimy ? (1 + m.slimeXp) * (run.loadout.hero === 'rana' ? 2 : 1) : 1;
  const xp = e.def.xp * (e.elite ? 1.6 : 1) * (e.charged ? 5 : 1) * m.xpMult * slimeXp;
  run.pickups.push(new Pickup('xp', e.x, e.y, xp));
  if (run.rng.drops.chance(0.08 * m.lootMult + m.emeraldDrop)) {
    run.pickups.push(new Pickup('emerald', e.x + 4, e.y + 2, 1));
  }
  if (m.healOnKill > 0) run.player.heal(m.healOnKill);
  if (m.healWater > 0 && run.world.surface(run.player.x, run.player.y) === 'water') {
    run.player.heal(run.player.maxHp * m.healWater);
  }
  if (run.rng.drops.chance(m.lootMult / 400)) {
    run.spawnEggs++;
    run.emit('egg');
    run.fx.push(
      makeFx('text', e.x, e.y - 20, 1, { text: 'Spawn Egg!', vy: -14, color: '#7dff9a' }),
    );
  }
  if (e.charged) {
    run.spawnEggs++;
    run.emeraldsPicked += 150;
    run.fx.push(
      makeFx('text', e.x, e.y - 30, 1.2, { text: 'Charged! +150', vy: -14, color: '#6ad0ff' }),
    );
  }
  const into = e.def.splitInto;
  const maxSplit = run.loadout.hero === 'rana' ? 1 : 2;
  if (into && e.splitDepth < maxSplit) {
    for (let i = 0; i < 2; i++) {
      const child = makeEnemy(run, into, e.x + (i === 0 ? -6 : 6), e.y, false);
      if (!child) continue;
      child.splitDepth = e.splitDepth + 1;
      child.kx = (i === 0 ? -1 : 1) * 60;
      run.enemies.push(child);
    }
  }
}

/** Hurt the hero. `attacker` (if any) receives Thorns damage and Shield thorns. */
export function hurtPlayer(run: RunState, raw: number, attacker: Enemy | null = null): number {
  const sh = run.shield;
  if (sh.has && sh.ready && !run.player.dead && run.player.iframes <= 0) {
    sh.ready = false;
    sh.timer = sh.cd;
    run.player.iframes = 0.35;
    run.emit('hit');
    run.fx.push(
      makeFx('text', run.player.x, run.player.y - 24, 0.6, {
        text: 'BLOCK',
        vy: -18,
        color: '#9fd0ff',
      }),
    );
    if (attacker && sh.thorns > 0) {
      damageEnemy(run, attacker, sh.thorns * run.mods.dmg, run.player.x, run.player.y, 60);
    }
    return 0;
  }
  let incoming = raw * run.mods.dmgTaken;
  if (run.absorb > 0 && run.player.iframes <= 0) {
    const soak = Math.min(run.absorb, incoming);
    run.absorb -= soak;
    incoming -= soak;
    if (incoming <= 0) {
      run.player.iframes = 0.3;
      return 0;
    }
  }
  const dealt = run.player.hurt(incoming);
  if (dealt <= 0) return 0;
  run.emit('hurt');
  run.shake = Math.max(run.shake, 3);
  run.fx.push(
    makeFx('text', run.player.x, run.player.y - 24, 0.7, {
      text: `-${dealt}`,
      vy: -22,
      color: '#ff6b6b',
    }),
  );
  if (attacker && run.mods.thorns > 0) {
    damageEnemy(run, attacker, raw * run.mods.thorns + 2, run.player.x, run.player.y, 50);
  }
  run.onPlayerHurt();
  return dealt;
}

/** Area blast: enemies take `enemyDmg`, optionally the player too (creepers). */
export function explode(
  run: RunState,
  x: number,
  y: number,
  radius: number,
  enemyDmg: number,
  playerDmg: number,
  skip: Enemy | null,
): void {
  run.emit('explode');
  run.hitPoints.push(x, y);
  run.fx.push(makeFx('ring', x, y, 0.35, { r: radius, color: '#ffb347' }));
  for (let i = 0; i < 10; i++) {
    const a = run.rng.fx.range(0, Math.PI * 2);
    const sp = run.rng.fx.range(40, 110);
    run.fx.push(
      makeFx('spark', x, y, 0.45, {
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color: run.rng.fx.pick(SPARK_COLORS),
      }),
    );
  }
  run.shake = Math.max(run.shake, 4);
  const hit: Enemy[] = [];
  run.hash.query(x, y, radius, hit);
  for (const e of hit) {
    if (e !== skip) damageEnemy(run, e, enemyDmg, x, y, 140);
  }
  if (playerDmg > 0) {
    const p = run.player;
    if (Math.hypot(p.x - x, p.y - y) < radius + p.radius)
      hurtPlayer(run, playerDmg * (1 - Math.min(0.8, run.mods.explosionResist)), skip);
  }
  // Chain reaction: nearby mines light their fuses.
  for (const m of run.mines) {
    if (m.fuse > 0.15 && Math.hypot(m.x - x, m.y - y) < radius) m.fuse = 0.15;
  }
}

function applyHitStatus(p: Projectile, e: Enemy): void {
  if (p.burn > 0) applyStatus(e, 'burn', p.burn, p.burnDps);
  if (p.poison > 0) applyStatus(e, 'poison', p.poison, p.poisonDps);
  if (p.slowT > 0) applyStatus(e, 'slow', p.slowT, p.slowF);
  if (p.freeze > 0) applyStatus(e, 'freeze', p.freeze);
  if (p.stun > 0) applyStatus(e, 'stun', p.stun);
}

export function updateProjectiles(run: RunState, dt: number): void {
  const near: Enemy[] = [];
  const pl = run.player;
  for (const p of run.projectiles) {
    p.px = p.x;
    p.py = p.y;
    p.onTick?.(run, p, dt);
    if (!p.alive) continue;
    if (p.lobDur > 0) {
      p.lobT += dt;
      const t = Math.min(1, p.lobT / p.lobDur);
      p.x = p.sx + (p.tx - p.sx) * t;
      p.y = p.sy + (p.ty - p.sy) * t;
      if (t >= 1) {
        p.onLand?.(run, p);
        p.alive = false;
      }
      continue;
    }
    if (p.homing) {
      if (p.target?.dying) p.target = null;
      if (p.target || !p.friendly) {
        const tx = p.target ? p.target.x : pl.x;
        const ty = p.target ? p.target.y - 4 : pl.y;
        const want = Math.atan2(ty - p.y, tx - p.x);
        const cur = Math.atan2(p.vy, p.vx);
        let d = want - cur;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const a = cur + Math.max(-p.turn * dt, Math.min(p.turn * dt, d));
        p.vx = Math.cos(a) * p.speed;
        p.vy = Math.sin(a) * p.speed;
      }
    }
    if (p.boomerang) {
      if (p.phase === 0 && Math.hypot(p.x - p.sx, p.y - p.sy) >= p.maxDist) {
        p.phase = 1;
        p.hits.clear();
      }
      if (p.phase === 1) {
        const dx = pl.x - p.x;
        const dy = pl.y - 8 - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.vx = (dx / d) * p.speed * 1.1;
        p.vy = (dy / d) * p.speed * 1.1;
        if (d < 9) {
          p.alive = false;
          continue;
        }
      }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) {
      p.onLand?.(run, p);
      if (p.blast > 0 && !p.friendly) explode(run, p.x, p.y, p.blast, 0, p.dmg, null);
      p.alive = false;
      continue;
    }
    if (p.friendly) {
      const mx = (p.px + p.x) / 2;
      const my = (p.py + p.y) / 2;
      const reach = Math.hypot(p.x - p.px, p.y - p.py) / 2 + p.radius;
      run.hash.query(mx, my, reach, near);
      for (const e of near) {
        if (e.dying || p.hits.has(e.id)) continue;
        if (!sweepHit(p.px, p.py, p.x, p.y, p.radius, e.x, e.y - 4, e.radius)) continue;
        p.hits.add(e.id);
        damageEnemy(run, e, p.dmg, p.px, p.py, p.knock);
        applyHitStatus(p, e);
        p.onHit?.(run, p, e);
        p.pierce--;
        if (p.pierce < 0) {
          p.alive = false;
          break;
        }
      }
    } else {
      if (run.world.overlapsSolid(p.x, p.y, 1)) {
        p.alive = false; // trees and rocks give cover
        if (p.blast > 0) explode(run, p.x, p.y, p.blast, 0, p.dmg, null);
        continue;
      }
      if (sweepHit(p.px, p.py, p.x, p.y, p.radius, pl.x, pl.y - 6, pl.radius)) {
        if (run.shield.has && run.shield.ready && run.shield.reflect) {
          // Spiked Shield: block and send the projectile back.
          run.shield.ready = false;
          run.shield.timer = run.shield.cd;
          p.vx = -p.vx;
          p.vy = -p.vy;
          p.friendly = true;
          p.hits.clear();
          p.life = Math.max(p.life, 1);
          run.fx.push(
            makeFx('text', pl.x, pl.y - 24, 0.6, { text: 'REFLECT', vy: -18, color: '#9fd0ff' }),
          );
          continue;
        }
        if (p.blast > 0) explode(run, p.x, p.y, p.blast, 0, p.dmg, null);
        else hurtPlayer(run, p.dmg);
        if (p.slowT > 0) pl.slowT = Math.max(pl.slowT, p.slowT);
        p.alive = false;
      }
    }
  }
  run.projectiles = run.projectiles.filter((p) => p.alive);
}

export function updateMines(run: RunState, dt: number): void {
  for (const m of run.mines) {
    m.fuse -= dt;
    if (m.fuse <= 0) explode(run, m.x, m.y, m.area, m.dmg, 0, null);
  }
  run.mines = run.mines.filter((m) => m.fuse > 0);
}

/** Damage pools: tick every 0.5 s; friendly pools hurt enemies, hostile ones hurt the hero. */
export function updateZones(run: RunState, dt: number): void {
  const near: Enemy[] = [];
  const pl = run.player;
  for (const z of run.zones) {
    z.t += dt;
    z.tick += dt;
    if (z.tick < 0.5) continue;
    z.tick -= 0.5;
    if (z.friendly) {
      run.hash.query(z.x, z.y, z.r, near);
      for (const e of near) {
        if (e.dying) continue;
        if (z.dps > 0) damageEnemy(run, e, z.dps * 0.5, z.x, z.y, 0, true);
        if (z.kind === 'burn') applyStatus(e, 'burn', 1.5, z.dps * 0.6);
        else if (z.kind === 'poison') applyStatus(e, 'poison', 2, z.dps * 0.6);
        else if (z.kind === 'wither') applyStatus(e, 'wither', 2, z.dps * 0.6);
        if (z.slowF < 1) applyStatus(e, 'slow', 1.2, z.slowF);
      }
    } else if (!pl.dead && Math.hypot(pl.x - z.x, pl.y - z.y) < z.r + pl.radius) {
      hurtPlayer(run, z.dps * 0.5);
      if (z.slowF < 1) pl.slowT = Math.max(pl.slowT, 1.2);
    }
  }
  run.zones = run.zones.filter((z) => z.t < z.dur);
}

/** Orbiting rods: move around the hero and hit enemies they touch (per-enemy re-hit cooldown). */
export function updateOrbiters(run: RunState, dt: number): void {
  const near: Enemy[] = [];
  const p = run.player;
  for (const o of run.orbiters) {
    o.angle += o.speed * dt;
    o.x = p.x + Math.cos(o.angle) * o.radius;
    o.y = p.y - 6 + Math.sin(o.angle) * o.radius * 0.8;
    run.hash.query(o.x, o.y, o.size, near);
    for (const e of near) {
      if (e.dying) continue;
      if (run.time - (o.hitAt.get(e.id) ?? -9) < o.rehit) continue;
      o.hitAt.set(e.id, run.time);
      damageEnemy(run, e, o.dmg, o.x, o.y, o.knock);
      if (o.burn) applyStatus(e, 'burn', 2 * run.mods.duration, o.dmg * 0.4);
    }
    if (o.hitAt.size > 96) o.hitAt.clear();
  }
}
