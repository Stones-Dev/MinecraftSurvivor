/**
 * The Ender Dragon's moves (hooked from systems/bossAI.ts like the other bosses). Three phases:
 *
 * 1. (100-80% HP) flies an ellipse over the island and spits slow ballistic fireballs that leave Dragon's
 *    Breath pools. Melee cannot reach it while it flies.
 * 2. (80-40%) roars, then dives along a 60 px lane that is telegraphed (steady, colour-blind remapped) for
 *    1.8 s, hitting for 1.25x its damage and shoving the hero 120 px (a shield parry staggers it instead).
 * 3. (40-0%, or every crystal gone) alternates 10 s perched on the bedrock fountain (ranged hits deflect,
 *    melee lands, head hits crit, a tail sweep covers the half circle behind it) with 8 s of flight.
 *
 * Every attack announces itself with a telegraph first; numbers are multiples of the dragon's scaled damage.
 */
import {
  CRUISE_SPEED,
  DIVE_KNOCK,
  DIVE_SPEED,
  DIVE_TELEGRAPH,
  DIVE_WIDTH,
  FLY_TIME,
  PERCH_TIME,
  diveLine,
  orbitOmega,
  orbitPoint,
  orbitTheta,
  phaseFor,
  type DragonPhase,
} from '../entities/bossDragon';
import type { Enemy } from '../entities/enemy';
import { makeFx } from '../entities/fx';
import { Projectile } from '../entities/projectile';
import type { RunState } from '../game';
import { explode, hurtPlayer } from './combat';
import { END_ISLAND_PX, PERCH_SPOT, knockHero } from './endDimension';

const ROAR_TIME = 1.4;
const STUN_SHIELD = 2.5;
const TAKEOFF_TIME = 0.8;
const SPIT_LOB = 1.15;
const POOL_R = 40;
const POOL_LIFE = 6;
const MAX_POOLS = 40;
const SWEEP_R = 78;
const SWEEP_WARN = 1.0;
const SLAM_R = 56;

function clampIsland(x: number, y: number, margin = 24): { x: number; y: number } {
  const lim = END_ISLAND_PX - margin;
  const d = Math.hypot(x, y);
  return d > lim ? { x: (x / d) * lim, y: (y / d) * lim } : { x, y };
}

function moveTo(e: Enemy, tx: number, ty: number, speed: number, dt: number): void {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.01) return;
  const step = Math.min(d, speed * dt);
  e.x += (dx / d) * step;
  e.y += (dy / d) * step;
  if (Math.abs(dx) > 6) e.facing = dx > 0 ? 1 : -1;
}

/** Fly the ellipse: the orbit parameter advances at the cruise speed and the dragon follows its point. */
function orbit(e: Enemy, run: RunState, dt: number, speedMult = 1): void {
  const b = run.end.brain;
  b.theta += orbitOmega(b.theta, CRUISE_SPEED * speedMult) * dt;
  const t = orbitPoint(b.theta);
  const d = Math.hypot(t.x - e.x, t.y - e.y);
  // Far from the ellipse (after a dive, a stun, a perch): catch up fast, then settle onto it.
  if (d > 40) moveTo(e, t.x, t.y, 260, dt);
  else {
    const k = Math.min(1, 7 * dt);
    const nx = e.x + (t.x - e.x) * k;
    if (Math.abs(nx - e.x) > 0.05) e.facing = nx > e.x ? 1 : -1;
    e.x = nx;
    e.y += (t.y - e.y) * k;
  }
}

function setMode(run: RunState, mode: typeof run.end.brain.mode, t = 0): void {
  const b = run.end.brain;
  // Leaving a dive early (stun, parry, a new phase) takes its lane off the ground.
  if (b.lane && mode !== 'dive' && mode !== 'telegraph') {
    b.lane.t = b.lane.dur;
    b.lane = null;
  }
  b.mode = mode;
  b.t = t;
}

/** Lob a fireball at the hero: a telegraphed landing disc, a ballistic flight, a blast and a lingering pool. */
function spit(run: RunState, e: Enemy): void {
  const p = run.player;
  const b = run.end.brain;
  const lead = clampIsland(p.x + p.vx * 0.5, p.y + p.vy * 0.5, 30);
  const tx = lead.x;
  const ty = lead.y;
  const sx = e.x + e.facing * 32;
  const sy = e.y - 34;
  const dmg = e.dmg * 0.6;
  b.mouthT = 0.6;
  run.telegraphs.push({
    kind: 'circle',
    x: tx,
    y: ty,
    x2: 0,
    y2: 0,
    r: POOL_R,
    t: 0,
    dur: SPIT_LOB,
  });
  const pr = new Projectile(sx, sy, 0, 0, 3, 0, 0, false, SPIT_LOB + 1);
  pr.style = 'fireball';
  pr.lobDur = SPIT_LOB;
  pr.sx = sx;
  pr.sy = sy;
  pr.tx = tx;
  pr.ty = ty;
  pr.height = 46;
  pr.onLand = (r, q) => {
    explode(r, q.tx, q.ty, 28, 0, dmg, null);
    if (r.zones.length < MAX_POOLS) {
      r.zones.push({
        x: q.tx,
        y: q.ty,
        r: POOL_R,
        t: 0,
        dur: POOL_LIFE,
        dps: dmg,
        tick: 0,
        kind: 'harm',
        slowF: 1,
        friendly: false,
      });
    }
  };
  run.projectiles.push(pr);
  run.emit('bow');
}

function onPhase(run: RunState, e: Enemy, phase: DragonPhase): void {
  const b = run.end.brain;
  b.phase = phase;
  if (b.mode === 'dying') return;
  if (phase === 2) {
    run.announce('The Ender Dragon roars!', '#df7cff', 3);
    run.emit('boss');
    run.shake = Math.max(run.shake, 5);
    run.fx.push(makeFx('ring', e.x, e.y - 20, 0.7, { r: 70, color: '#df7cff' }));
    if (b.mode === 'orbit') setMode(run, 'roar', ROAR_TIME);
    b.diveCd = 3;
  } else if (phase === 3) {
    run.announce('The dragon is wounded!', '#ff9af0', 3);
    run.emit('boss');
    run.shake = Math.max(run.shake, 5);
    // Whatever it was doing, it comes down to the fountain (a stun or a roar finishes first).
    if (b.mode === 'orbit' || b.mode === 'roar' || b.mode === 'telegraph' || b.mode === 'dive')
      beginLanding(run, e);
  }
}

function beginLanding(run: RunState, e: Enemy): void {
  const b = run.end.brain;
  const d = Math.hypot(PERCH_SPOT.x - e.x, PERCH_SPOT.y - e.y);
  const T = Math.max(1.1, Math.min(2.6, d / 200));
  setMode(run, 'landing', T);
  b.fromX = e.x;
  b.fromY = e.y;
  b.total = T;
  run.telegraphs.push({
    kind: 'circle',
    x: 0,
    y: 0,
    x2: 0,
    y2: 0,
    r: SLAM_R,
    t: 0,
    dur: T,
    steady: true,
  });
}

function beginDive(run: RunState, e: Enemy): void {
  const p = run.player;
  const b = run.end.brain;
  // A lane through where the hero stands now, along a random heading (turned inward near the rim).
  const a = run.rng.ai.range(0, Math.PI * 2);
  const L = diveLine(p.x, p.y, a, END_ISLAND_PX);
  b.dive = { sx: L.sx, sy: L.sy, ux: L.ux, uy: L.uy, ex: L.ex, ey: L.ey, hit: false };
  b.fromX = e.x;
  b.fromY = e.y;
  b.total = DIVE_TELEGRAPH;
  setMode(run, 'telegraph', DIVE_TELEGRAPH);
  // The lane stays on the ground for the whole dive: the warning and the danger are the same strip.
  const lane = {
    kind: 'line' as const,
    x: L.sx,
    y: L.sy,
    x2: L.ex,
    y2: L.ey,
    r: 0,
    t: 0,
    dur: DIVE_TELEGRAPH + Math.hypot(L.ex - L.sx, L.ey - L.sy) / DIVE_SPEED + 0.2,
    w: DIVE_WIDTH,
    steady: true,
  };
  run.telegraphs.push(lane);
  b.lane = lane;
  run.emit('boss');
  b.mouthT = DIVE_TELEGRAPH;
}

/** The hero is in the dragon's path: damage and knockback, or a parry that grounds the dragon. */
function diveHit(run: RunState, e: Enemy): void {
  const p = run.player;
  const b = run.end.brain;
  b.dive.hit = true;
  const sh = run.shield;
  const parry = sh.has && sh.ready && p.iframes <= 0;
  const dealt = hurtPlayer(run, e.dmg * 1.25, e);
  if (parry) {
    run.fx.push(makeFx('ring', p.x, p.y - 10, 0.5, { r: 36, color: '#9fd0ff' }));
    run.fx.push(
      makeFx('text', e.x, e.y - 60, 1.2, { text: 'PARRIED!', vy: -16, color: '#9fd0ff' }),
    );
    run.shake = Math.max(run.shake, 5);
    setMode(run, 'stunned', STUN_SHIELD);
    b.stunnedBy = 'shield';
    return;
  }
  if (dealt > 0) {
    knockHero(run, b.dive.ux, b.dive.uy, DIVE_KNOCK);
    // A beat of invulnerability after the shove so a hero landing next to a pool is not chain-hit.
    p.iframes = Math.max(p.iframes, 0.9);
  }
}

function tailSweep(run: RunState, e: Enemy): void {
  const b = run.end.brain;
  const behind = b.face + Math.PI;
  const a0 = behind - Math.PI / 2;
  const a1 = behind + Math.PI / 2;
  run.telegraphs.push({
    kind: 'arc',
    x: e.x,
    y: e.y,
    x2: 0,
    y2: 0,
    r: SWEEP_R,
    t: 0,
    dur: SWEEP_WARN,
    a0,
    a1,
    steady: true,
  });
  const x = e.x;
  const y = e.y;
  const dmg = e.dmg * 0.9;
  run.later(SWEEP_WARN, () => {
    if (run.end.brain.mode === 'dying') return;
    run.fx.push(makeFx('arc', x, y - 10, 0.3, { a0, a1, r: SWEEP_R, color: '#df7cff' }));
    run.shake = Math.max(run.shake, 3);
    run.emit('explode');
    const p = run.player;
    const dx = p.x - x;
    const dy = p.y - y;
    const d = Math.hypot(dx, dy);
    if (p.dead || d > SWEEP_R + p.radius) return;
    // In the half plane behind the head: cos of the angle to the "behind" axis is positive.
    if (Math.cos(behind) * dx + Math.sin(behind) * dy <= 0) return;
    if (hurtPlayer(run, dmg, e) > 0) {
      knockHero(run, dx / (d || 1), dy / (d || 1), 70);
      p.iframes = Math.max(p.iframes, 0.7);
    }
  });
}

function slam(run: RunState, e: Enemy): void {
  const p = run.player;
  run.fx.push(makeFx('ring', 0, 0, 0.5, { r: SLAM_R, color: '#df7cff' }));
  run.fx.push(makeFx('ring', 0, 0, 0.8, { r: SLAM_R * 1.5, color: '#9a6ad0' }));
  run.shake = Math.max(run.shake, 6);
  run.emit('explode');
  const d = Math.hypot(p.x, p.y);
  if (!p.dead && d < SLAM_R + p.radius) {
    if (hurtPlayer(run, e.dmg, e) > 0) {
      const ux = d > 1 ? p.x / d : 0;
      const uy = d > 1 ? p.y / d : 1;
      knockHero(run, ux, uy, 80);
    }
  }
}

/** The dragon's step (called through bossAI for `boss: 'dragon'`). */
export function updateDragon(run: RunState, e: Enemy, dt: number): void {
  const end = run.end;
  const b = end.brain;
  const p = run.player;
  e.kx = 0;
  e.ky = 0;
  b.gateMsgT = Math.max(0, b.gateMsgT - dt);
  b.mouthT = Math.max(0, b.mouthT - dt);
  b.wingT += dt;
  if (b.mode === 'dying') return;
  const phase = phaseFor(e.hp / e.maxHp, end.crystalsAlive(), b.phase);
  if (phase !== b.phase) onPhase(run, e, phase);
  const hasHero = !p.dead;

  switch (b.mode) {
    case 'orbit': {
      orbit(e, run, dt);
      if (!hasHero) break;
      b.spitT -= dt;
      if (b.spitT <= 0) {
        spit(run, e);
        b.spitT = b.phase === 1 ? 4.5 : b.phase === 2 ? 5.5 : 4;
      }
      if (b.phase >= 2) {
        b.diveCd -= dt;
        if (b.diveCd <= 0) beginDive(run, e);
      }
      if (b.phase === 3) {
        b.halfT -= dt;
        if (b.halfT <= 0) beginLanding(run, e);
      }
      break;
    }
    case 'roar': {
      orbit(e, run, dt, 0.35);
      b.t -= dt;
      b.mouthT = 0.5;
      if (b.t <= 0) {
        setMode(run, 'orbit');
        b.diveCd = 2.5;
        b.spitT = 2;
      }
      break;
    }
    case 'telegraph': {
      b.t -= dt;
      // Glide to the lane's start while the strip is on the ground.
      const k = 1 - Math.max(0, b.t) / b.total;
      const s = k * k * (3 - 2 * k);
      const nx = b.fromX + (b.dive.sx - b.fromX) * s;
      const ny = b.fromY + (b.dive.sy - b.fromY) * s;
      if (Math.abs(nx - e.x) > 0.1) e.facing = nx > e.x ? 1 : -1;
      e.x = nx;
      e.y = ny;
      if (b.t <= 0) {
        setMode(run, 'dive', Math.hypot(b.dive.ex - b.dive.sx, b.dive.ey - b.dive.sy) / DIVE_SPEED);
        e.facing = b.dive.ux >= 0 ? 1 : -1;
        run.emit('boss');
      }
      break;
    }
    case 'dive': {
      b.t -= dt;
      e.x += b.dive.ux * DIVE_SPEED * dt;
      e.y += b.dive.uy * DIVE_SPEED * dt;
      if (!b.dive.hit && hasHero && Math.hypot(e.x - p.x, e.y - p.y) < DIVE_WIDTH / 2 + p.radius) {
        diveHit(run, e);
      }
      if (b.mode === 'dive' && b.t <= 0) {
        if (b.lane) b.lane.t = b.lane.dur;
        b.lane = null;
        b.theta = orbitTheta(e.x, e.y);
        if (b.phase === 3) {
          setMode(run, 'orbit');
          b.diveCd = 9;
        } else {
          setMode(run, 'orbit');
          b.diveCd = 7;
        }
        b.spitT = Math.max(b.spitT, 2);
      }
      break;
    }
    case 'stunned': {
      b.t -= dt;
      if (b.t <= 0) {
        b.stunnedBy = null;
        setMode(run, 'takeoff', TAKEOFF_TIME);
      }
      break;
    }
    case 'takeoff': {
      b.t -= dt;
      if (b.t <= 0) {
        b.theta = orbitTheta(e.x, e.y);
        setMode(run, 'orbit');
        if (b.phase === 3) {
          // Back to the air after a perch: eight seconds of flight before the next landing.
          b.halfT = FLY_TIME;
        }
        b.diveCd = Math.max(b.diveCd, 3);
        b.spitT = Math.max(b.spitT, 1.5);
      }
      break;
    }
    case 'landing': {
      b.t -= dt;
      const k = 1 - Math.max(0, b.t) / b.total;
      const s = k * k * (3 - 2 * k);
      const nx = b.fromX + (PERCH_SPOT.x - b.fromX) * s;
      const ny = b.fromY + (PERCH_SPOT.y - b.fromY) * s;
      if (Math.abs(nx - e.x) > 0.1) e.facing = nx > e.x ? 1 : -1;
      e.x = nx;
      e.y = ny;
      if (b.t <= 0) {
        e.x = PERCH_SPOT.x;
        e.y = PERCH_SPOT.y;
        slam(run, e);
        setMode(run, 'perch');
        b.halfT = PERCH_TIME;
        b.sweepT = 3;
        b.spitT = 2.5;
        b.face = Math.atan2(p.y - e.y, p.x - e.x);
      }
      break;
    }
    case 'perch': {
      // Slowly turn the head toward the hero: the front is the head-crit side, the back is the sweep side.
      if (hasHero) {
        let diff = Math.atan2(p.y - e.y, p.x - e.x) - b.face;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = 0.5 * dt;
        b.face += Math.max(-turn, Math.min(turn, diff));
      }
      e.facing = Math.cos(b.face) >= 0 ? 1 : -1;
      b.halfT -= dt;
      if (hasHero) {
        b.spitT -= dt;
        b.sweepT -= dt;
        if (b.sweepT <= 0) {
          tailSweep(run, e);
          b.sweepT = 4.5;
        }
        if (b.spitT <= 0 && Math.hypot(p.x - e.x, p.y - e.y) < 380) {
          spit(run, e);
          b.spitT = 3.5;
        }
      }
      if (b.halfT <= 0) setMode(run, 'takeoff', TAKEOFF_TIME + 0.4);
      break;
    }
    default:
      break;
  }
}
