/** Enemy behaviour archetypes: chaser, kiter, leaper, kamikaze (BRIEF section 9), with ground telegraphs. */
import { Enemy } from '../entities/enemy';
import { makeFx } from '../entities/fx';
import { Projectile } from '../entities/projectile';
import type { RunState } from '../game';
import { explode, hurtPlayer, killEnemy } from './combat';

const dir = { x: 0, y: 0 };
const neigh: Enemy[] = [];

const FUSE_TIME = 1.0;
const BLAST_RADIUS = 44;
const AIM_TIME = 0.7;
const LEAP_WINDUP = 0.5;
const LEAP_TIME = 0.35;

/** Move with knockback, neighbour separation and prop collision. (vx, vy) is the desired velocity. */
function step(run: RunState, e: Enemy, vx: number, vy: number, dt: number): void {
  const k = Math.exp(-9 * dt);
  e.kx *= k;
  e.ky *= k;
  let nx = e.x + (vx + e.kx) * dt;
  let ny = e.y + (vy + e.ky) * dt;
  run.hash.query(e.x, e.y, e.radius, neigh);
  for (const o of neigh) {
    if (o === e || o.dying) continue;
    const dx = e.x - o.x;
    const dy = e.y - o.y;
    const d = Math.hypot(dx, dy) || 0.01;
    const push = ((e.radius + o.radius) * 0.8 - d) / (e.radius + o.radius);
    if (push > 0) {
      nx += (dx / d) * push * 40 * dt;
      ny += (dy / d) * push * 40 * dt;
    }
  }
  const r = run.world.collide(nx, ny, e.radius, run.biome());
  e.x = r.x;
  e.y = r.y;
  if (Math.abs(vx) > 2) e.facing = vx > 0 ? 1 : -1;
}

function waterMult(run: RunState, e: Enemy): number {
  return run.world.speedFactor(e.x, e.y) < 1 ? 0.55 : 1;
}

/** Direction to walk towards the player: the BFS route when far, a straight line when close. */
function chase(run: RunState, e: Enemy, ux: number, uy: number, dist: number): void {
  if (dist > 36 && run.pathing.dir(e.x, e.y, dir)) return;
  dir.x = ux;
  dir.y = uy;
}

function contact(run: RunState, e: Enemy, dist: number): void {
  const p = run.player;
  if (dist < e.radius + p.radius + 1) hurtPlayer(run, e.dmg);
}

export function updateEnemies(run: RunState, dt: number): void {
  const p = run.player;
  for (const e of run.enemies) {
    e.animT += dt;
    e.hurtT = Math.max(0, e.hurtT - dt);
    if (e.dying) {
      e.deathT += dt;
      continue;
    }
    e.cd = Math.max(0, e.cd - dt);
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const speed = e.speed * waterMult(run, e);
    switch (e.def.archetype) {
      case 'chaser': {
        chase(run, e, ux, uy, dist);
        step(run, e, dir.x * speed, dir.y * speed, dt);
        if (!p.dead) contact(run, e, dist);
        break;
      }
      case 'kiter': {
        if (e.state === 'aim') {
          e.stateT -= dt;
          step(run, e, 0, 0, dt);
          if (e.stateT <= 0) {
            const ax = e.tx - e.x;
            const ay = e.ty - e.y;
            const len = Math.hypot(ax, ay) || 1;
            run.projectiles.push(
              new Projectile(
                e.x,
                e.y - 8,
                (ax / len) * 130,
                (ay / len) * 130,
                2,
                e.dmg,
                0,
                false,
                1.8,
              ),
            );
            e.state = 'move';
            e.cd = run.rng.ai.range(1.8, 2.6);
          }
        } else {
          if (dist > 110) {
            chase(run, e, ux, uy, dist);
            step(run, e, dir.x * speed, dir.y * speed, dt);
          } else if (dist < 75) {
            step(run, e, -ux * speed, -uy * speed, dt);
          } else {
            const s = e.id % 2 === 0 ? 1 : -1;
            step(run, e, -uy * s * speed * 0.5, ux * s * speed * 0.5, dt);
          }
          if (e.cd <= 0 && dist < 150) {
            e.state = 'aim';
            e.animT = 0;
            e.stateT = AIM_TIME;
            e.tx = p.x;
            e.ty = p.y;
            run.telegraphs.push({
              kind: 'line',
              x: e.x,
              y: e.y - 8,
              x2: e.tx,
              y2: e.ty,
              r: 0,
              t: 0,
              dur: AIM_TIME,
            });
          }
        }
        break;
      }
      case 'leaper': {
        if (e.state === 'windup') {
          e.stateT -= dt;
          step(run, e, 0, 0, dt);
          if (e.stateT <= 0) {
            e.state = 'leap';
            e.stateT = LEAP_TIME;
          }
        } else if (e.state === 'leap') {
          e.stateT -= dt;
          const lx = e.tx - e.x;
          const ly = e.ty - e.y;
          const len = Math.hypot(lx, ly) || 1;
          step(run, e, (lx / len) * 170, (ly / len) * 170, dt);
          if (!p.dead) contact(run, e, dist);
          if (e.stateT <= 0) {
            e.state = 'move';
            e.cd = run.rng.ai.range(2.5, 3.5);
          }
        } else {
          chase(run, e, ux, uy, dist);
          step(run, e, dir.x * speed, dir.y * speed, dt);
          if (!p.dead) contact(run, e, dist);
          if (e.cd <= 0 && dist < 80 && dist > 22) {
            e.state = 'windup';
            e.animT = 0;
            e.stateT = LEAP_WINDUP;
            e.tx = p.x;
            e.ty = p.y;
            run.telegraphs.push({
              kind: 'circle',
              x: e.tx,
              y: e.ty,
              x2: 0,
              y2: 0,
              r: 12,
              t: 0,
              dur: LEAP_WINDUP + LEAP_TIME,
            });
          }
        }
        break;
      }
      case 'kamikaze': {
        if (e.state === 'fuse') {
          e.stateT -= dt;
          step(run, e, 0, 0, dt);
          if (dist > 60) {
            e.state = 'move';
          } else if (e.stateT <= 0) {
            explode(run, e.x, e.y, BLAST_RADIUS, e.dmg * 0.6, e.dmg, e);
            killEnemy(run, e, false);
          }
        } else {
          chase(run, e, ux, uy, dist);
          step(run, e, dir.x * speed, dir.y * speed, dt);
          if (dist < 28 && !p.dead) {
            e.state = 'fuse';
            run.emit('hiss');
            e.stateT = FUSE_TIME;
            e.animT = 0;
            run.fx.push(
              makeFx('text', e.x, e.y - 22, 0.5, { text: '!', vy: -10, color: '#ff4d4d' }),
            );
          }
        }
        break;
      }
    }
  }
  // Drop finished corpses in place.
  let w = 0;
  for (const e of run.enemies) {
    if (!(e.dying && e.deathT > 0.6)) run.enemies[w++] = e;
  }
  run.enemies.length = w;
}
