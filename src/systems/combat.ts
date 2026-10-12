/** Damage, kills, projectiles and mines (BRIEF sections 4 and 9). */
import { sweepHit } from '../core/geom';
import { Enemy } from '../entities/enemy';
import { makeFx } from '../entities/fx';
import { Pickup } from '../entities/pickup';
import { makeEnemy } from './spawner';
import type { RunState } from '../game';

const SPARK_COLORS = ['#ffffff', '#ffe27a', '#ffb347'];

/** Hurt an enemy: damage, knockback away from (fromX, fromY), flash, number and sparks. */
export function damageEnemy(
  run: RunState,
  e: Enemy,
  dmg: number,
  fromX: number,
  fromY: number,
  knock: number,
): void {
  if (e.dying || dmg <= 0) return;
  e.hp -= dmg;
  e.hurtT = 0.1;
  run.emit('hit');
  const dx = e.x - fromX;
  const dy = e.y - fromY;
  const len = Math.hypot(dx, dy) || 1;
  e.kx += (dx / len) * knock;
  e.ky += (dy / len) * knock;
  run.fx.push(makeFx('text', e.x, e.y - 16, 0.55, { text: String(Math.round(dmg)), vy: -26 }));
  for (let i = 0; i < 3; i++) {
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
  if (e.hp <= 0) killEnemy(run, e, true);
}

export function killEnemy(run: RunState, e: Enemy, reward: boolean): void {
  if (e.dying) return;
  e.state = 'dying';
  e.deathT = 0;
  e.hp = 0;
  if (!reward) return;
  run.kills++;
  const xp = e.def.xp * (e.elite ? 1.6 : 1);
  run.pickups.push(new Pickup('xp', e.x, e.y, xp));
  if (run.rng.drops.chance(0.08)) run.pickups.push(new Pickup('emerald', e.x + 4, e.y + 2, 1));
  const into = e.def.splitInto;
  if (into && e.splitDepth < 2) {
    for (let i = 0; i < 2; i++) {
      const child = makeEnemy(run, into, e.x + (i === 0 ? -6 : 6), e.y, false);
      if (!child) continue;
      child.splitDepth = e.splitDepth + 1;
      child.kx = (i === 0 ? -1 : 1) * 60;
      run.enemies.push(child);
    }
  }
}

export function hurtPlayer(run: RunState, raw: number): void {
  const dealt = run.player.hurt(raw);
  if (dealt <= 0) return;
  run.emit('hurt');
  run.shake = Math.max(run.shake, 3);
  run.fx.push(
    makeFx('text', run.player.x, run.player.y - 24, 0.7, {
      text: `-${dealt}`,
      vy: -22,
      color: '#ff6b6b',
    }),
  );
}

/** Area blast: enemies take `dmg`, optionally the player too (creepers). */
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
    if (Math.hypot(p.x - x, p.y - y) < radius + p.radius) hurtPlayer(run, playerDmg);
  }
}

export function updateProjectiles(run: RunState, dt: number): void {
  const near: Enemy[] = [];
  const biome = run.biome();
  for (const p of run.projectiles) {
    p.px = p.x;
    p.py = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) p.alive = false;
    if (!p.alive) continue;
    if (p.friendly) {
      const mx = (p.px + p.x) / 2;
      const my = (p.py + p.y) / 2;
      const reach = Math.hypot(p.x - p.px, p.y - p.py) / 2 + p.radius;
      run.hash.query(mx, my, reach, near);
      for (const e of near) {
        if (e.dying || p.hits.has(e.id)) continue;
        if (!sweepHit(p.px, p.py, p.x, p.y, p.radius, e.x, e.y - 4, e.radius)) continue;
        p.hits.add(e.id);
        damageEnemy(run, e, p.dmg, p.px, p.py, 40);
        p.pierce--;
        if (p.pierce < 0) {
          p.alive = false;
          break;
        }
      }
    } else {
      if (run.world.overlapsSolid(p.x, p.y, 1, biome)) {
        p.alive = false; // trees and rocks give cover
        continue;
      }
      const pl = run.player;
      if (sweepHit(p.px, p.py, p.x, p.y, p.radius, pl.x, pl.y - 6, pl.radius)) {
        hurtPlayer(run, p.dmg);
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
