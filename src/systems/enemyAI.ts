/**
 * Enemy behaviour archetypes (BRIEF section 9): chaser, kiter, leaper, kamikaze, charger, summoner,
 * healer, teleporter, diver, turret. Dangerous attacks always show a ground telegraph first.
 */
import { segDist2 } from '../core/geom';
import type { ShotDef } from '../data/enemies';
import type { Enemy } from '../entities/enemy';
import { boltPoints, makeFx } from '../entities/fx';
import { Projectile } from '../entities/projectile';
import type { RunState } from '../game';
import { explode, hurtPlayer, killEnemy } from './combat';
import { updateBoss } from './bossAI';
import { tauntTarget } from './allies';
import { ignoresHero, lureTarget } from '../abilities/decoys';
import { makeEnemy } from './spawner';
import { tickStatus } from './status';

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
  if (e.def.flying) {
    const c = run.world.clampArena(nx, ny, e.radius);
    e.x = c.x;
    e.y = c.y;
  } else {
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
    const r = run.world.collide(nx, ny, e.radius);
    e.x = r.x;
    e.y = r.y;
  }
  if (Math.abs(vx) > 2) e.facing = vx > 0 ? 1 : -1;
}

function waterMult(run: RunState, e: Enemy): number {
  if (e.def.flying) return 1;
  // Drowned are at home in water; everyone else is slowed.
  if (e.def.id === 'drowned') return 1;
  return run.world.speedFactor(e.x, e.y) < 1 ? 0.55 : 1;
}

/** Direction to walk towards the player: the BFS route when far, a straight line when close. */
function chase(
  run: RunState,
  e: Enemy,
  ux: number,
  uy: number,
  dist: number,
): { x: number; y: number } {
  if (!e.def.flying && dist > 36 && run.pathing.dir(e.x, e.y, dir)) return dir;
  dir.x = ux;
  dir.y = uy;
  return dir;
}

function contact(run: RunState, e: Enemy, dist: number): void {
  const p = run.player;
  if (dist >= e.radius + p.radius + 1) return;
  const dealt = hurtPlayer(run, e.dmg, e);
  const cs = e.def.contactStatus;
  if (dealt > 0 && cs) {
    if (cs.kind === 'hunger') p.hungerT = Math.max(p.hungerT, cs.dur);
    else if (cs.kind === 'slow') p.slowT = Math.max(p.slowT, cs.dur);
    else {
      p.dotKind = cs.kind;
      p.dotT = Math.max(p.dotT, cs.dur);
      p.dotDps = Math.max(p.dotDps, cs.dps);
    }
  }
}

/** Instant line attack after a telegraph: hurts the hero if still on the line (guardian beam, fangs). */
function lineStrike(
  run: RunState,
  e: Enemy,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  dmg: number,
  color: string,
): void {
  run.fx.push(
    makeFx('bolt', 0, 0, 0.3, {
      pts: boltPoints(x1, y1, x2, y2, 3, () => run.rng.fx.float()),
      color,
    }),
  );
  const p = run.player;
  if (!p.dead && segDist2(x1, y1, x2, y2, p.x, p.y - 6) < (width + p.radius) * (width + p.radius)) {
    hurtPlayer(run, dmg, e);
  }
}

function fireShot(run: RunState, e: Enemy, shot: ShotDef): void {
  const p = run.player;
  const base = Math.atan2(e.ty - (e.y - 8), e.tx - e.x);
  const dmg = e.dmg * shot.dmgMult;
  if (shot.pool) {
    const pool = shot.pool;
    const pr = new Projectile(e.x, e.y - 8, 0, 0, 2, 0, 0, false, 5);
    pr.style = shot.style;
    pr.lobDur = 0.8;
    pr.sx = e.x;
    pr.sy = e.y - 8;
    pr.tx = e.tx;
    pr.ty = e.ty;
    pr.height = 22;
    pr.onLand = (r, q) =>
      r.zones.push({
        x: q.tx,
        y: q.ty,
        r: pool.r,
        t: 0,
        dur: pool.dur,
        dps: dmg * 2,
        tick: 0,
        kind: pool.kind,
        slowF: pool.slowF,
        friendly: false,
      });
    run.projectiles.push(pr);
    return;
  }
  if (shot.speed === 0) {
    // Beam: strikes along the locked line.
    const len = Math.min(shot.range * 1.2, Math.hypot(e.tx - e.x, e.ty - e.y) + 30);
    lineStrike(
      run,
      e,
      e.x,
      e.y - 8,
      e.x + Math.cos(base) * len,
      e.y - 8 + Math.sin(base) * len,
      5,
      dmg,
      shot.style === 'bubble' ? '#7fe8ff' : '#c9a0ff',
    );
    run.emit('hit');
    return;
  }
  for (let i = 0; i < shot.count; i++) {
    const a = base + (shot.count > 1 ? (i / (shot.count - 1) - 0.5) * shot.spread : 0);
    const pr = new Projectile(
      e.x,
      e.y - 8,
      Math.cos(a) * shot.speed,
      Math.sin(a) * shot.speed,
      2,
      dmg,
      0,
      false,
      shot.life,
    );
    pr.style = shot.style;
    pr.slowT = shot.slow ?? 0;
    if (shot.blast) pr.blast = shot.blast;
    if (shot.homing) {
      pr.homing = true;
      pr.turn = shot.homing;
    }
    run.projectiles.push(pr);
  }
  void p;
}

function beginAim(run: RunState, e: Enemy, shot: ShotDef): void {
  const p = run.player;
  e.state = 'aim';
  e.animT = 0;
  e.stateT = shot.windup;
  e.tx = p.x;
  e.ty = p.y;
  if (shot.pool) {
    run.telegraphs.push({
      kind: 'circle',
      x: e.tx,
      y: e.ty,
      x2: 0,
      y2: 0,
      r: shot.pool.r,
      t: 0,
      dur: shot.windup + 0.8,
    });
  } else {
    const len =
      shot.speed === 0
        ? Math.min(shot.range * 1.2, Math.hypot(e.tx - e.x, e.ty - e.y) + 30)
        : 40 + Math.hypot(e.tx - e.x, e.ty - e.y);
    const a = Math.atan2(e.ty - e.y, e.tx - e.x);
    run.telegraphs.push({
      kind: 'line',
      x: e.x,
      y: e.y - 8,
      x2: e.x + Math.cos(a) * len,
      y2: e.y - 8 + Math.sin(a) * len,
      r: 0,
      t: 0,
      dur: shot.windup,
    });
  }
}

/** Ranged behaviour shared by kiters, healers, summoners and turrets. */
function shooter(
  run: RunState,
  e: Enemy,
  dt: number,
  ux: number,
  uy: number,
  dist: number,
  speed: number,
  mode: 'kite' | 'turret',
): void {
  const shot = e.def.shot;
  if (!shot) return;
  if (e.state === 'aim') {
    e.stateT -= dt;
    step(run, e, 0, 0, dt);
    if (e.stateT <= 0) {
      fireShot(run, e, shot);
      e.state = 'move';
      e.cd = run.rng.ai.range(shot.cd[0], shot.cd[1]);
    }
    return;
  }
  if (mode === 'turret') {
    if (speed > 0 && dist > shot.range * 0.8) {
      chase(run, e, ux, uy, dist);
      step(run, e, dir.x * speed, dir.y * speed, dt);
    } else {
      step(run, e, 0, 0, dt);
    }
  } else if (dist > shot.range * 0.95) {
    chase(run, e, ux, uy, dist);
    step(run, e, dir.x * speed, dir.y * speed, dt);
  } else if (dist < shot.range * 0.55) {
    step(run, e, -ux * speed, -uy * speed, dt);
  } else {
    const s = e.id % 2 === 0 ? 1 : -1;
    step(run, e, -uy * s * speed * 0.5, ux * s * speed * 0.5, dt);
  }
  if (e.cd <= 0 && dist < shot.range * 1.15 && !run.player.dead) beginAim(run, e, shot);
}

function healPulse(run: RunState, e: Enemy): void {
  const h = e.def.heal;
  if (!h) return;
  const mates: Enemy[] = [];
  run.hash.query(e.x, e.y, h.radius, mates);
  for (const m of mates) {
    if (m === e || m.dying || m.hp >= m.maxHp) continue;
    m.hp = Math.min(m.maxHp, m.hp + m.maxHp * h.pct);
    run.fx.push(makeFx('text', m.x, m.y - 18, 0.6, { text: '+', vy: -14, color: '#6dff8a' }));
  }
}

const TOOLS = { step, chase, contact, lineStrike };

export function updateEnemies(run: RunState, dt: number): void {
  const p = run.player;
  for (const e of run.enemies) {
    e.animT += dt;
    e.hurtT = Math.max(0, e.hurtT - dt);
    e.angry = Math.max(0, e.angry - dt);
    if (e.dying) {
      e.deathT += dt;
      continue;
    }
    tickStatus(run, e, dt);
    if (e.dying) continue;
    e.cd = Math.max(0, e.cd - dt);
    e.cd2 = Math.max(0, e.cd2 - dt);
    if (e.stunT > 0) {
      step(run, e, 0, 0, dt);
      continue;
    }
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const speed =
      e.speed * waterMult(run, e) * (e.slowT > 0 ? e.slowF : 1) * (e.angry > 0 ? 1.5 : 1);
    const def = e.def;
    if (def.trail && e.state === 'move' && run.zones.length < 90) {
      e.trailT -= dt;
      if (e.trailT <= 0) {
        e.trailT = 0.7;
        run.zones.push({
          x: e.x,
          y: e.y,
          r: 9,
          t: 0,
          dur: 2.5,
          dps: 4,
          tick: 0,
          kind: 'burn',
          slowF: 1,
          friendly: false,
        });
      }
    }
    switch (def.archetype) {
      case 'chaser': {
        // Decoys and hero-neutral wandering (abilities/decoys.ts) win, then an Iron Golem's taunt (4 tiles).
        const lure = lureTarget(run, e);
        const bait = lure ?? (run.allies.length > 0 ? tauntTarget(run, e) : null);
        if (bait) {
          const bx = bait.x - e.x;
          const by = bait.y - e.y;
          const bd = Math.hypot(bx, by) || 1;
          // A lure is walked to in a straight line (the BFS route leads to the hero).
          chase(run, e, bx / bd, by / bd, lure ? 0 : bd);
        } else chase(run, e, ux, uy, dist);
        step(run, e, dir.x * speed, dir.y * speed, dt);
        if (!p.dead && !ignoresHero(run, e)) contact(run, e, dist);
        break;
      }
      case 'kiter':
        shooter(run, e, dt, ux, uy, dist, speed, 'kite');
        break;
      case 'turret':
        shooter(run, e, dt, ux, uy, dist, speed, 'turret');
        break;
      case 'healer': {
        shooter(run, e, dt, ux, uy, dist, speed, 'kite');
        if (e.cd2 <= 0 && def.heal) {
          healPulse(run, e);
          e.cd2 = def.heal.cd;
        }
        break;
      }
      case 'summoner': {
        if (e.state === 'cast') {
          e.stateT -= dt;
          step(run, e, 0, 0, dt);
          if (e.stateT <= 0) {
            const s = def.summon;
            if (s) {
              for (let i = 0; i < s.count; i++) {
                const a = (i / s.count) * Math.PI * 2 + run.rng.ai.range(0, 1);
                const v = makeEnemy(
                  run,
                  s.id,
                  e.x + Math.cos(a) * 14,
                  e.y + Math.sin(a) * 10,
                  false,
                );
                if (v) {
                  v.summonerId = e.id;
                  run.enemies.push(v);
                }
              }
            }
            e.state = 'move';
            e.cd2 = def.summon?.cd ?? 8;
          }
        } else {
          shooter(run, e, dt, ux, uy, dist, speed, 'kite');
          const s = def.summon;
          if (e.state === 'move' && s && e.cd2 <= 0 && !p.dead) {
            const alive = run.enemies.filter((o) => o.summonerId === e.id && !o.dying).length;
            if (alive < s.max) {
              e.state = 'cast';
              e.animT = 0;
              e.stateT = 0.9;
              run.telegraphs.push({
                kind: 'circle',
                x: e.x,
                y: e.y,
                x2: 0,
                y2: 0,
                r: 16,
                t: 0,
                dur: 0.9,
              });
            } else {
              e.cd2 = 1;
            }
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
      case 'charger': {
        const c = def.charge;
        if (!c) break;
        if (e.state === 'windup') {
          e.stateT -= dt;
          step(run, e, 0, 0, dt);
          if (e.stateT <= 0) {
            e.state = 'leap';
            e.animT = 0;
            e.stateT = c.dash;
          }
        } else if (e.state === 'leap') {
          e.stateT -= dt;
          const lx = e.tx - e.x;
          const ly = e.ty - e.y;
          const len = Math.hypot(lx, ly) || 1;
          step(run, e, (lx / len) * speed * c.speed, (ly / len) * speed * c.speed, dt);
          if (!p.dead) contact(run, e, dist);
          if (e.stateT <= 0) {
            e.state = 'rest';
            e.stateT = c.rest;
          }
        } else if (e.state === 'rest') {
          e.stateT -= dt;
          step(run, e, 0, 0, dt);
          if (e.stateT <= 0) {
            e.state = 'move';
            e.cd = run.rng.ai.range(1.5, 3);
          }
        } else {
          chase(run, e, ux, uy, dist);
          step(run, e, dir.x * speed, dir.y * speed, dt);
          if (!p.dead) contact(run, e, dist);
          if (e.cd <= 0 && dist < c.range && dist > 40 && !p.dead) {
            e.state = 'windup';
            e.animT = 0;
            e.stateT = c.windup;
            const len = Math.min(c.range + 40, dist + 60);
            e.tx = e.x + ux * len;
            e.ty = e.y + uy * len;
            run.telegraphs.push({
              kind: 'line',
              x: e.x,
              y: e.y - 6,
              x2: e.tx,
              y2: e.ty - 6,
              r: 0,
              t: 0,
              dur: c.windup,
            });
          }
        }
        break;
      }
      case 'teleporter': {
        if (e.state === 'blink') {
          e.stateT -= dt;
          step(run, e, 0, 0, dt);
          if (e.stateT <= 0) {
            run.fx.push(makeFx('ring', e.x, e.y - 10, 0.3, { r: 14, color: '#b06bff' }));
            const r = run.world.collide(e.tx, e.ty, e.radius);
            e.x = r.x;
            e.y = r.y;
            e.prevX = e.prevY = Number.NaN;
            run.fx.push(makeFx('ring', e.x, e.y - 10, 0.3, { r: 14, color: '#b06bff' }));
            e.state = 'move';
            e.cd2 = run.rng.ai.range(def.blink?.cd[0] ?? 3.5, def.blink?.cd[1] ?? 5);
          }
        } else {
          chase(run, e, ux, uy, dist);
          step(run, e, dir.x * speed, dir.y * speed, dt);
          if (!p.dead) contact(run, e, dist);
          if (e.cd2 <= 0 && dist > 70 && def.blink && !p.dead) {
            const a = run.rng.ai.range(0, Math.PI * 2);
            e.tx = p.x + Math.cos(a) * 34;
            e.ty = p.y + Math.sin(a) * 28;
            e.state = 'blink';
            e.animT = 0;
            e.stateT = def.blink.windup;
            run.telegraphs.push({
              kind: 'circle',
              x: e.tx,
              y: e.ty,
              x2: 0,
              y2: 0,
              r: 14,
              t: 0,
              dur: def.blink.windup,
            });
          }
        }
        break;
      }
      case 'diver': {
        if (e.state === 'windup') {
          e.stateT -= dt;
          step(run, e, 0, 0, dt);
          if (e.stateT <= 0) {
            e.state = 'leap';
            e.stateT = 0.45;
          }
        } else if (e.state === 'leap') {
          e.stateT -= dt;
          const lx = e.tx - e.x;
          const ly = e.ty - e.y;
          const len = Math.hypot(lx, ly) || 1;
          step(run, e, (lx / len) * 200, (ly / len) * 200, dt);
          if (!p.dead) contact(run, e, dist);
          if (e.stateT <= 0) {
            e.state = 'orbit';
            e.stateT = run.rng.ai.range(2, 3.2);
          }
        } else {
          if (e.state !== 'orbit') {
            e.state = 'orbit';
            e.stateT = run.rng.ai.range(1.5, 2.5);
          }
          e.stateT -= dt;
          e.orbit += dt * 1.2;
          const gx = p.x + Math.cos(e.orbit + e.id) * 80;
          const gy = p.y + Math.sin(e.orbit + e.id) * 60;
          const vx = gx - e.x;
          const vy = gy - e.y;
          const len = Math.hypot(vx, vy) || 1;
          step(run, e, (vx / len) * speed, (vy / len) * speed, dt);
          if (e.stateT <= 0 && !p.dead) {
            e.state = 'windup';
            e.animT = 0;
            e.stateT = 0.6;
            e.tx = p.x;
            e.ty = p.y;
            run.telegraphs.push({
              kind: 'line',
              x: e.x,
              y: e.y - 6,
              x2: e.tx + (e.tx - e.x) * 0.3,
              y2: e.ty + (e.ty - e.y) * 0.3 - 6,
              r: 0,
              t: 0,
              dur: 0.6,
            });
          }
        }
        break;
      }
      case 'boss':
        updateBoss(run, e, dt, ux, uy, dist, speed, TOOLS);
        break;
      case 'kamikaze': {
        if (e.state === 'fuse') {
          e.stateT -= dt;
          step(run, e, 0, 0, dt);
          if (dist > 60) {
            e.state = 'move';
          } else if (e.stateT <= 0) {
            explode(run, e.x, e.y, BLAST_RADIUS * (def.scale ?? 1), e.dmg * 0.6, e.dmg, e);
            killEnemy(run, e, false);
          }
        } else {
          chase(run, e, ux, uy, dist);
          step(run, e, dir.x * speed, dir.y * speed, dt);
          if (dist < 28 && !p.dead) {
            e.state = 'fuse';
            run.emit('hiss');
            e.stateT = FUSE_TIME + run.mods.fuseBonus;
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
  void AIM_TIME;
  // Drop finished corpses in place.
  let w = 0;
  for (const e of run.enemies) {
    if (!(e.dying && e.deathT > 0.6)) run.enemies[w++] = e;
  }
  run.enemies.length = w;
}
