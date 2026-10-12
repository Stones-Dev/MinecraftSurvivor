/**
 * Scripted boss patterns (BRIEF section 7): Raid Captain (charge + stomp), Wither (skull fan, blue
 * skull, summons, enrage dash) and Warden (sonic boom, shock rings, darkness pulses).
 */
import type { Enemy } from '../entities/enemy';
import { makeFx } from '../entities/fx';
import { Projectile, type ProjStyle } from '../entities/projectile';
import type { RunState } from '../game';
import { hurtPlayer } from './combat';
import { makeEnemy } from './spawner';

/** Movement helpers shared with the regular AI (passed in to avoid an import cycle). */
export interface AiTools {
  step(run: RunState, e: Enemy, vx: number, vy: number, dt: number): void;
  chase(run: RunState, e: Enemy, ux: number, uy: number, dist: number): { x: number; y: number };
  contact(run: RunState, e: Enemy, dist: number): void;
  lineStrike(
    run: RunState,
    e: Enemy,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    width: number,
    dmg: number,
    color: string,
  ): void;
}

function fan(
  run: RunState,
  e: Enemy,
  style: ProjStyle,
  speed: number,
  count: number,
  spread: number,
  dmg: number,
  life: number,
  extra?: (p: Projectile) => void,
): void {
  const p = run.player;
  const base = Math.atan2(p.y - 6 - (e.y - 10), p.x - e.x);
  for (let i = 0; i < count; i++) {
    const a = base + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0);
    const pr = new Projectile(
      e.x,
      e.y - 10,
      Math.cos(a) * speed,
      Math.sin(a) * speed,
      2.5,
      dmg,
      0,
      false,
      life,
    );
    pr.style = style;
    extra?.(pr);
    run.projectiles.push(pr);
  }
}

/** A circular shockwave that hurts the hero if the ring passes over them (thin band). */
function ringStrike(run: RunState, e: Enemy, x: number, y: number, r: number, dmg: number): void {
  run.fx.push(makeFx('ring', x, y, 0.4, { r, color: '#b08cff' }));
  run.shake = Math.max(run.shake, 3);
  const p = run.player;
  if (!p.dead && Math.abs(Math.hypot(p.x - x, p.y - y) - r) < 12) hurtPlayer(run, dmg, e);
}

function stomp(run: RunState, e: Enemy, r: number, dmg: number): void {
  run.fx.push(makeFx('ring', e.x, e.y, 0.4, { r, color: '#ffb347' }));
  run.shake = Math.max(run.shake, 5);
  run.emit('explode');
  const p = run.player;
  if (!p.dead && Math.hypot(p.x - e.x, p.y - e.y) < r + p.radius) hurtPlayer(run, dmg, e);
}

export function updateBoss(
  run: RunState,
  e: Enemy,
  dt: number,
  ux: number,
  uy: number,
  dist: number,
  speed: number,
  t: AiTools,
): void {
  const enraged = e.hp < e.maxHp * 0.5;
  const rate = enraged ? 1.3 : 1;
  const p = run.player;
  switch (e.def.boss) {
    case 'captain':
      captain(run, e, dt, ux, uy, dist, speed * rate, enraged, t);
      break;
    case 'wither':
      wither(run, e, dt, dist, speed * rate, enraged, rate, t);
      break;
    case 'warden':
      warden(run, e, dt, ux, uy, dist, speed, rate, t);
      break;
    default:
      break;
  }
  void p;
}

function captain(
  run: RunState,
  e: Enemy,
  dt: number,
  ux: number,
  uy: number,
  dist: number,
  speed: number,
  enraged: boolean,
  t: AiTools,
): void {
  const p = run.player;
  if (e.state === 'windup' || e.state === 'cast') {
    e.stateT -= dt;
    t.step(run, e, 0, 0, dt);
    if (e.stateT > 0) return;
    if (e.state === 'windup') {
      e.state = 'leap';
      e.stateT = 0.55;
      e.animT = 0;
    } else {
      stomp(run, e, 60, e.dmg * 0.9);
      e.state = 'move';
      e.cd = 3.2 / (enraged ? 1.3 : 1);
    }
    return;
  }
  if (e.state === 'leap') {
    e.stateT -= dt;
    const lx = e.tx - e.x;
    const ly = e.ty - e.y;
    const len = Math.hypot(lx, ly) || 1;
    t.step(run, e, (lx / len) * speed * 5.5, (ly / len) * speed * 5.5, dt);
    if (!p.dead) t.contact(run, e, dist);
    if (e.stateT <= 0 || len < 8) {
      e.state = 'rest';
      e.stateT = 0.8;
    }
    return;
  }
  if (e.state === 'rest') {
    e.stateT -= dt;
    t.step(run, e, 0, 0, dt);
    if (e.stateT <= 0) {
      e.state = 'move';
      e.cd = 3 / (enraged ? 1.3 : 1);
    }
    return;
  }
  const d = t.chase(run, e, ux, uy, dist);
  t.step(run, e, d.x * speed, d.y * speed, dt);
  if (!p.dead) t.contact(run, e, dist);
  if (enraged) {
    e.atk -= dt;
    if (e.atk <= 0 && !p.dead) {
      e.atk = 6;
      fan(run, e, 'bolt', 150, 5, 0.8, e.dmg * 0.5, 1.8);
      run.emit('bow');
    }
  }
  if (e.cd <= 0 && !p.dead) {
    e.animT = 0;
    if (dist > 100) {
      e.state = 'windup';
      e.stateT = 0.8;
      const len = Math.min(260, dist + 80);
      e.tx = e.x + ux * len;
      e.ty = e.y + uy * len;
      run.telegraphs.push({
        kind: 'line',
        x: e.x,
        y: e.y - 8,
        x2: e.tx,
        y2: e.ty - 8,
        r: 0,
        t: 0,
        dur: 0.8,
      });
    } else {
      e.state = 'cast';
      e.stateT = 1.0;
      run.telegraphs.push({ kind: 'circle', x: e.x, y: e.y, x2: 0, y2: 0, r: 60, t: 0, dur: 1.0 });
    }
  }
}

function wither(
  run: RunState,
  e: Enemy,
  dt: number,
  dist: number,
  speed: number,
  enraged: boolean,
  rate: number,
  t: AiTools,
): void {
  const p = run.player;
  if (e.state === 'windup') {
    e.stateT -= dt;
    t.step(run, e, 0, 0, dt);
    if (e.stateT <= 0) {
      e.state = 'leap';
      e.stateT = 0.45;
    }
    return;
  }
  if (e.state === 'leap') {
    e.stateT -= dt;
    const lx = e.tx - e.x;
    const ly = e.ty - e.y;
    const len = Math.hypot(lx, ly) || 1;
    t.step(run, e, (lx / len) * 300, (ly / len) * 300, dt);
    if (!p.dead) t.contact(run, e, dist);
    if (e.stateT <= 0) e.state = 'move';
    return;
  }
  // Hover on a slow circle around the hero.
  e.orbit += dt * 0.45;
  const gx = p.x + Math.cos(e.orbit) * 120;
  const gy = p.y + Math.sin(e.orbit) * 80;
  const vx = gx - e.x;
  const vy = gy - e.y;
  const len = Math.hypot(vx, vy) || 1;
  t.step(run, e, (vx / len) * speed, (vy / len) * speed, dt);
  e.atk -= dt * rate;
  e.atk2 -= dt * rate;
  e.atk3 -= dt;
  if (p.dead) return;
  if (e.atk <= 0) {
    e.atk = 3;
    e.animT = 0;
    fan(run, e, 'skull', 95, 5, 0.9, e.dmg * 0.7, 3);
    run.emit('bow');
  }
  if (e.atk2 <= 0) {
    e.atk2 = 6.5;
    fan(run, e, 'skull_blue', 75, 1, 0, e.dmg * 1.2, 5, (pr) => {
      pr.homing = true;
      pr.turn = 2.4;
      pr.slowT = 2.5;
    });
  }
  if (e.atk3 <= 0) {
    e.atk3 = 14;
    const alive = run.enemies.filter((o) => o.summonerId === e.id && !o.dying).length;
    for (let i = 0; i < 2 && alive + i < 4; i++) {
      const s = makeEnemy(run, 'wither_skeleton', e.x + (i === 0 ? -16 : 16), e.y + 10, false);
      if (s) {
        s.summonerId = e.id;
        run.enemies.push(s);
      }
    }
    run.fx.push(makeFx('ring', e.x, e.y, 0.5, { r: 30, color: '#9a9aa8' }));
  }
  if (enraged) {
    e.cd2 = Math.max(0, e.cd2);
    if (e.cd2 <= 0) {
      e.cd2 = 7;
      e.state = 'windup';
      e.stateT = 0.8;
      e.tx = p.x + (p.x - e.x) * 0.2;
      e.ty = p.y + (p.y - e.y) * 0.2;
      run.telegraphs.push({
        kind: 'line',
        x: e.x,
        y: e.y - 8,
        x2: e.tx,
        y2: e.ty - 8,
        r: 0,
        t: 0,
        dur: 0.8,
      });
    }
  }
}

function warden(
  run: RunState,
  e: Enemy,
  dt: number,
  ux: number,
  uy: number,
  dist: number,
  speed: number,
  rate: number,
  t: AiTools,
): void {
  const p = run.player;
  if (e.state === 'aim') {
    e.stateT -= dt;
    t.step(run, e, 0, 0, dt);
    if (e.stateT <= 0) {
      const a = Math.atan2(e.ty - e.y, e.tx - e.x);
      t.lineStrike(
        run,
        e,
        e.x,
        e.y - 10,
        e.x + Math.cos(a) * 300,
        e.y - 10 + Math.sin(a) * 300,
        9,
        e.dmg * 1.1,
        '#6fe0ff',
      );
      run.emit('explode');
      e.state = 'move';
      e.atk = 5 / rate;
    }
    return;
  }
  if (e.state === 'cast') {
    e.stateT -= dt;
    t.step(run, e, 0, 0, dt);
    if (e.stateT <= 0) {
      const x = e.x;
      const y = e.y;
      for (let i = 0; i < 3; i++) {
        run.later(i * 0.28, () => ringStrike(run, e, x, y, 50 + 42 * i, e.dmg * 0.6));
      }
      e.state = 'move';
      e.atk2 = 7 / rate;
    }
    return;
  }
  const d = t.chase(run, e, ux, uy, dist);
  t.step(run, e, d.x * speed, d.y * speed, dt);
  if (!p.dead) t.contact(run, e, dist);
  e.atk -= dt;
  e.atk2 -= dt;
  e.atk3 -= dt;
  if (p.dead) return;
  if (e.atk <= 0 && dist < 300) {
    e.state = 'aim';
    e.animT = 0;
    e.stateT = 1.3;
    e.tx = p.x;
    e.ty = p.y;
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    run.telegraphs.push({
      kind: 'line',
      x: e.x,
      y: e.y - 10,
      x2: e.x + Math.cos(a) * 300,
      y2: e.y - 10 + Math.sin(a) * 300,
      r: 0,
      t: 0,
      dur: 1.3,
    });
  } else if (e.atk2 <= 0 && dist < 150) {
    e.state = 'cast';
    e.animT = 0;
    e.stateT = 0.9;
    for (let i = 0; i < 3; i++) {
      run.telegraphs.push({
        kind: 'circle',
        x: e.x,
        y: e.y,
        x2: 0,
        y2: 0,
        r: 50 + 42 * i,
        t: 0,
        dur: 0.9 + i * 0.28,
      });
    }
  }
  if (e.atk3 <= 0) {
    e.atk3 = 12;
    run.darkness = 3.5;
    run.fx.push(
      makeFx('text', p.x, p.y - 36, 1.2, { text: 'Darkness...', vy: -10, color: '#8a8aa8' }),
    );
  }
}
