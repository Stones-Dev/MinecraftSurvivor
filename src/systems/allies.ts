/** Pets and allies in a run (BRIEF section 11). Allies fight, get hurt by contact, go downed and respawn. */
import { allyById, petById, type AllyDef } from '../data/companions';
import { Ally, PetState } from '../entities/ally';
import type { Enemy } from '../entities/enemy';
import { boltPoints, makeFx } from '../entities/fx';
import { Projectile } from '../entities/projectile';
import type { RunState } from '../game';
import { damageEnemy, killEnemy } from './combat';
import type { RunLoadout } from './meta';
import { applyStatus } from './status';

const near: Enemy[] = [];
const near2: Enemy[] = [];
const ALLY_RADIUS = 5;
const RESPAWN_TIME = 20;
/** Allies hit for this much base damage times the role multiplier and the hero's damage mods. */
const BASE_DMG = 9;
const TAUNT_RADIUS = 64;
/** Small Iron Golem taunt radius. */
const MINI_TAUNT_RADIUS = 40;
/** Shepherd wool decoy: lure radius, lifetime and recharge. */
const DECOY_LURE = 90;
const DECOY_TIME = 5;
const DECOY_CD = 12;
/** Goat ram: wind-up (telegraph), charge speed and length. */
const RAM_WINDUP = 0.6;
const RAM_SPEED = 230;
const RAM_LENGTH = 115;
/** Copper Golem lightning: radius and the delay between the warning and the strike. */
const BOLT_RADIUS = 32;
const BOLT_DELAY = 0.6;
/** Furnace Golem burning aura radius. */
export const AURA_RADIUS = 36;
/** Mooshroom stew: HP threshold and cooldown. */
const STEW_BELOW = 0.35;
const STEW_CD = 40;

export function spawnCompanions(run: RunState, loadout: RunLoadout): void {
  const p = run.player;
  run.allies = [];
  run.pet = null;
  const pet = loadout.pet ? petById(loadout.pet.id) : undefined;
  if (pet && loadout.pet) run.pet = new PetState(pet, loadout.pet.level, p.x - 20, p.y + 10);
  loadout.allies.forEach((c, i) => {
    const def = allyById(c.id);
    if (def) run.allies.push(new Ally(def, c.level, i, p.x + (i === 0 ? 26 : -26), p.y + 12));
  });
}

/** Keep companions with the hero across rift teleports. */
export function gatherCompanions(run: RunState): void {
  const p = run.player;
  for (const a of run.allies) {
    a.x = p.x + (a.slot === 0 ? 26 : -26);
    a.y = p.y + 12;
    a.prevX = Number.NaN;
    a.phase = 0;
    a.decoy.t = 0;
  }
  if (run.pet) {
    run.pet.x = p.x - 20;
    run.pet.y = p.y + 10;
    run.pet.prevX = Number.NaN;
  }
}

function moveTo(run: RunState, a: Ally, tx: number, ty: number, speed: number, dt: number): number {
  const dx = tx - a.x;
  const dy = ty - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 3) {
    a.moving = false;
    return d;
  }
  const step = Math.min(d, speed * dt);
  const next = run.world.collide(a.x + (dx / d) * step, a.y + (dy / d) * step, ALLY_RADIUS);
  a.x = next.x;
  a.y = next.y;
  a.dx = dx / d;
  a.dy = dy / d;
  if (Math.abs(dx) > 0.5) a.facing = dx > 0 ? 1 : -1;
  a.moving = true;
  return d;
}

function nearestFoe(run: RunState, x: number, y: number, range: number): Enemy | null {
  run.hash.query(x, y, range, near);
  let best: Enemy | null = null;
  let bd = Infinity;
  for (const e of near) {
    if (e.dying || e.hp <= 0) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** The living enemy within `range` of (x, y) with the most other enemies within `r` of it. */
function densestFoe(run: RunState, x: number, y: number, range: number, r: number): Enemy | null {
  run.hash.query(x, y, range, near);
  let best: Enemy | null = null;
  let bestN = 0;
  let tried = 0;
  for (const e of near) {
    if (e.dying || Math.hypot(e.x - x, e.y - y) > range) continue;
    if (++tried > 14) break;
    run.hash.query(e.x, e.y, r, near2);
    let n = 0;
    for (const o of near2) if (!o.dying && Math.hypot(o.x - e.x, o.y - e.y) <= r) n++;
    if (n > bestN) {
      bestN = n;
      best = e;
    }
  }
  return best;
}

function allyDamage(run: RunState, a: Ally): number {
  return BASE_DMG * a.def.dmg * run.mods.dmg * (1 + 0.2 * (a.level - 1));
}

function shootAt(
  run: RunState,
  a: Ally,
  ang: number,
  style: Projectile['style'],
  speed: number,
  dmgMult = 1,
  pierce = 0,
): Projectile {
  const pr = new Projectile(
    a.x,
    a.y - 6,
    Math.cos(ang) * speed,
    Math.sin(ang) * speed,
    3,
    allyDamage(run, a) * dmgMult,
    pierce,
    true,
    1.4,
  );
  pr.style = style;
  run.projectiles.push(pr);
  return pr;
}

function shoot(
  run: RunState,
  a: Ally,
  target: Enemy,
  style: Projectile['style'],
  speed: number,
  dmgMult = 1,
): Projectile {
  const pr = shootAt(run, a, Math.atan2(target.y - a.y, target.x - a.x), style, speed, dmgMult);
  a.facing = target.x >= a.x ? 1 : -1;
  return pr;
}

/** Fraction of contact damage an ally actually takes (golems are sturdy). */
function contactArmor(def: AllyDef): number {
  switch (def.role) {
    case 'iron_golem':
    case 'furnace_golem':
      return 0.5;
    case 'mini_golem':
    case 'copper_golem':
    case 'love_golem':
      return 0.6;
    default:
      return 1;
  }
}

/** Contact damage taken from enemies touching an ally. */
function takeContact(run: RunState, a: Ally, dt: number): void {
  a.contactCd -= dt;
  if (a.contactCd > 0) return;
  run.hash.query(a.x, a.y, 14, near);
  for (const e of near) {
    if (e.dying || Math.hypot(e.x - a.x, e.y - a.y) > e.radius + ALLY_RADIUS + 1) continue;
    a.hp -= e.dmg * 0.5 * contactArmor(a.def);
    a.hurtT = 0.15;
    a.contactCd = 0.7;
    if (a.hp <= 0) {
      a.hp = 0;
      a.downed = true;
      a.respawnT = RESPAWN_TIME;
      a.phase = 0;
      a.decoy.t = 0;
      run.fx.push(
        makeFx('text', a.x, a.y - 22, 1.2, { text: 'Downed', vy: -12, color: '#ff9a9a' }),
      );
      return;
    }
    return;
  }
}

/** Walk back to the anchor beside the hero when farther than `slack`. */
function follow(
  run: RunState,
  a: Ally,
  ax: number,
  ay: number,
  slack: number,
  dt: number,
  speedMult = 1,
): void {
  if (Math.hypot(ax - a.x, ay - a.y) > slack) moveTo(run, a, ax, ay, a.def.speed * speedMult, dt);
  else a.moving = false;
}

/** Chase the foe (or return to the anchor) and hit it on cooldown; returns the foe hit this step, if any. */
function melee(
  run: RunState,
  a: Ally,
  foe: Enemy | null,
  ax: number,
  ay: number,
  dt: number,
  cd: number,
  dmg: number,
  knock: number,
): Enemy | null {
  if (foe) {
    const d = moveTo(run, a, foe.x, foe.y, a.def.speed, dt);
    if (d < foe.radius + ALLY_RADIUS + 8 && a.cd <= 0) {
      a.cd = cd;
      a.atkT = 0.2;
      damageEnemy(run, foe, dmg, a.x, a.y, knock);
      return foe;
    }
  } else follow(run, a, ax, ay, 14, dt);
  return null;
}

/** Goat: pick a target, telegraph a line, then ram through everything on it. */
function goatRam(
  run: RunState,
  a: Ally,
  foe: Enemy | null,
  ax: number,
  ay: number,
  dt: number,
): void {
  if (a.phase === 1) {
    a.moving = false;
    a.phaseT -= dt;
    if (a.phaseT <= 0) {
      a.phase = 2;
      a.phaseT = RAM_LENGTH / RAM_SPEED;
      a.struck.clear();
      run.emit('swing');
    }
    return;
  }
  if (a.phase === 2) {
    a.phaseT -= dt;
    a.atkT = 0.2;
    const next = run.world.collide(
      a.x + a.chargeX * RAM_SPEED * dt,
      a.y + a.chargeY * RAM_SPEED * dt,
      ALLY_RADIUS,
    );
    a.x = next.x;
    a.y = next.y;
    a.moving = true;
    run.hash.query(a.x, a.y, 16, near);
    for (const e of near) {
      if (e.dying || a.struck.has(e.id) || Math.hypot(e.x - a.x, e.y - a.y) > e.radius + 10)
        continue;
      a.struck.add(e.id);
      damageEnemy(run, e, allyDamage(run, a) * 1.5, a.x - a.chargeX * 8, a.y - a.chargeY * 8, 220);
      applyStatus(e, 'stun', 0.4);
    }
    if (a.phaseT <= 0) {
      a.phase = 0;
      a.cd = 4;
    }
    return;
  }
  if (foe && a.cd <= 0) {
    const d = Math.hypot(foe.x - a.x, foe.y - a.y);
    if (d > 24 && d < RAM_LENGTH) {
      a.phase = 1;
      a.phaseT = RAM_WINDUP;
      a.chargeX = (foe.x - a.x) / d;
      a.chargeY = (foe.y - a.y) / d;
      a.facing = a.chargeX >= 0 ? 1 : -1;
      a.dx = a.chargeX;
      a.dy = a.chargeY;
      run.telegraphs.push({
        kind: 'line',
        x: a.x,
        y: a.y - 4,
        x2: a.x + a.chargeX * RAM_LENGTH,
        y2: a.y - 4 + a.chargeY * RAM_LENGTH,
        r: 6,
        t: 0,
        dur: RAM_WINDUP,
        friendly: true,
      });
      return;
    }
  }
  // Between rams: headbutt anything in reach, otherwise stay near the hero.
  if (foe && Math.hypot(foe.x - a.x, foe.y - a.y) < 60) {
    melee(run, a, foe, ax, ay, dt, 1, allyDamage(run, a) * 0.6, 90);
  } else follow(run, a, ax, ay, 16, dt);
}

/** Copper Golem: a warning circle, then a lightning bolt on the densest crowd near it. */
function callLightning(run: RunState, a: Ally): boolean {
  const target = densestFoe(run, a.x, a.y, 150, BOLT_RADIUS);
  if (!target) return false;
  const x = target.x;
  const y = target.y;
  const dmg = allyDamage(run, a) * 3;
  run.telegraphs.push({
    kind: 'circle',
    x,
    y,
    x2: 0,
    y2: 0,
    r: BOLT_RADIUS,
    t: 0,
    dur: BOLT_DELAY,
    friendly: true,
  });
  run.later(BOLT_DELAY, () => {
    run.fx.push(
      makeFx('bolt', 0, 0, 0.3, {
        pts: boltPoints(x, y - 110, x, y - 4, 5, () => run.rng.fx.float()),
      }),
    );
    run.fx.push(makeFx('ring', x, y, 0.35, { r: BOLT_RADIUS, color: '#bfe6ff' }));
    run.flash = Math.max(run.flash, 0.12);
    run.emit('thunder');
    run.hitPoints.push(x, y);
    run.hash.query(x, y, BOLT_RADIUS + 8, near2);
    for (const e of near2) {
      if (e.dying || Math.hypot(e.x - x, e.y - y) > BOLT_RADIUS + e.radius) continue;
      damageEnemy(run, e, dmg, x, y, 80);
      applyStatus(e, 'stun', 0.6);
    }
  });
  return true;
}

/** Fisherman: hook the farthest loose pickup near the hero and reel it in. */
function reelPickup(run: RunState, a: Ally): boolean {
  const p = run.player;
  let best = -1;
  let bd = 0;
  for (let i = 0; i < run.pickups.length; i++) {
    const pk = run.pickups[i];
    if (!pk || pk.magnet) continue;
    const d = Math.hypot(pk.x - p.x, pk.y - p.y);
    if (d < 220 && d > bd) {
      bd = d;
      best = i;
    }
  }
  const pk = run.pickups[best];
  if (!pk) return false;
  pk.magnet = true;
  run.fx.push(
    makeFx('bolt', 0, 0, 0.25, {
      pts: [a.x, a.y - 14, (a.x + pk.x) / 2, Math.min(a.y, pk.y) - 18, pk.x, pk.y],
      color: '#d8d8d8',
      a0: 1,
    }),
  );
  a.facing = pk.x >= a.x ? 1 : -1;
  a.atkT = 0.2;
  return true;
}

function runRole(run: RunState, a: Ally, dt: number, anchorX: number, anchorY: number): void {
  const p = run.player;
  const def: AllyDef = a.def;
  a.cd -= dt;
  a.cd2 -= dt;
  a.atkT = Math.max(0, a.atkT - dt);
  if (a.decoy.t > 0) a.decoy.t = Math.max(0, a.decoy.t - dt);
  const leash = 190;
  const foe = nearestFoe(run, a.x, a.y, leash);
  const foeOk = foe && Math.hypot(foe.x - p.x, foe.y - p.y) < leash + 40 ? foe : null;
  switch (def.role) {
    case 'wolf':
    case 'iron_golem': {
      if (foeOk) {
        const d = moveTo(run, a, foeOk.x, foeOk.y, def.speed, dt);
        if (d < foeOk.radius + ALLY_RADIUS + 8 && a.cd <= 0) {
          a.cd = def.role === 'wolf' ? 0.6 : 1.1;
          a.atkT = 0.2;
          damageEnemy(run, foeOk, allyDamage(run, a), a.x, a.y, def.role === 'wolf' ? 40 : 90);
          if (def.role === 'wolf') run.emit('hit');
        }
      } else follow(run, a, anchorX, anchorY, 14, dt);
      if (def.role === 'iron_golem' && a.cd2 <= 0) {
        // Slam: area damage around the golem when enemies crowd it.
        run.hash.query(a.x, a.y, 46, near);
        const hits = near.filter((e) => !e.dying && Math.hypot(e.x - a.x, e.y - a.y) < 46);
        if (hits.length > 0) {
          a.cd2 = 3;
          a.atkT = 0.3;
          run.shake = Math.max(run.shake, 3);
          run.fx.push(makeFx('ring', a.x, a.y, 0.4, { r: 46, color: '#ffe9b0' }));
          run.emit('explode');
          for (const e of hits) damageEnemy(run, e, allyDamage(run, a) * 1.8, a.x, a.y, 140);
        }
      }
      break;
    }
    case 'mini_golem':
      melee(run, a, foeOk, anchorX, anchorY, dt, 1, allyDamage(run, a), 70);
      break;
    case 'butcher': {
      const hit = melee(run, a, foeOk, anchorX, anchorY, dt, 0.9, allyDamage(run, a), 50);
      if (hit?.dying && !p.dead) {
        // The cleaver feeds the hero: kills heal 2% of max HP.
        p.heal(p.maxHp * 0.02);
        run.fx.push(makeFx('text', p.x, p.y - 26, 0.7, { text: '+', vy: -14, color: '#ff7a7a' }));
      }
      break;
    }
    case 'cat': {
      if (foeOk) {
        const d = moveTo(run, a, foeOk.x, foeOk.y, def.speed, dt);
        if (d < foeOk.radius + ALLY_RADIUS + 8 && a.cd <= 0) {
          // Quick scratches; one in four is a critical swipe.
          const crit = run.rng.ai.chance(0.25);
          a.cd = 0.4;
          a.atkT = 0.15;
          damageEnemy(run, foeOk, allyDamage(run, a) * (crit ? 2.5 : 1), a.x, a.y, 30);
        }
      } else follow(run, a, anchorX, anchorY, 14, dt);
      break;
    }
    case 'goat':
      goatRam(run, a, foeOk, anchorX, anchorY, dt);
      break;
    case 'copper_golem': {
      melee(run, a, foeOk, anchorX, anchorY, dt, 1.2, allyDamage(run, a), 60);
      if (a.cd2 <= 0) {
        // Lightning answers faster during thunderstorms.
        const struck = callLightning(run, a);
        a.cd2 = struck ? (run.storm ? 3 : 6) : 0.5;
        if (struck) a.atkT = 0.3;
      }
      break;
    }
    case 'furnace_golem': {
      melee(run, a, foeOk, anchorX, anchorY, dt, 1.1, allyDamage(run, a), 80);
      if (a.cd2 <= 0) {
        a.cd2 = 0.5;
        run.hash.query(a.x, a.y, AURA_RADIUS + 8, near);
        const dps = allyDamage(run, a) * 0.6;
        for (const e of near) {
          if (e.dying || Math.hypot(e.x - a.x, e.y - a.y) > AURA_RADIUS + e.radius) continue;
          applyStatus(e, 'burn', 2 * run.mods.duration, dps);
        }
      }
      break;
    }
    case 'snow_golem':
    case 'llama':
    case 'fletcher':
    case 'melon_golem': {
      const range = def.role === 'fletcher' ? 200 : def.role === 'melon_golem' ? 170 : 150;
      if (foe && Math.hypot(foe.x - a.x, foe.y - a.y) <= range && a.cd <= 0) {
        if (def.role === 'snow_golem') {
          a.cd = 1.4;
          const sb = shoot(run, a, foe, 'snowball', 150);
          sb.slowT = 1.5;
          sb.slowF = 0.6;
        } else if (def.role === 'llama') {
          a.cd = 1.8;
          const sp = shoot(run, a, foe, 'spit', 130, 1.2);
          sp.knock = 90;
        } else if (def.role === 'melon_golem') {
          // A fan of three seeds that pierce two enemies each.
          a.cd = 1.6;
          const ang = Math.atan2(foe.y - a.y, foe.x - a.x);
          for (let i = -1; i <= 1; i++) shootAt(run, a, ang + i * 0.22, 'seed', 190, 1, 2);
          a.facing = foe.x >= a.x ? 1 : -1;
        } else {
          a.cd = 1.2;
          shoot(run, a, foe, 'arrow', 220);
        }
        a.atkT = 0.2;
      }
      follow(run, a, anchorX, anchorY, 22, dt);
      break;
    }
    case 'soul_wizard': {
      // Cornered: blink back beside the hero.
      if (
        a.cd2 <= 0 &&
        foe &&
        Math.hypot(foe.x - a.x, foe.y - a.y) < foe.radius + ALLY_RADIUS + 4
      ) {
        a.cd2 = 3;
        run.fx.push(makeFx('ring', a.x, a.y - 8, 0.3, { r: 12, color: '#5ff0f0' }));
        a.x = anchorX;
        a.y = anchorY;
        a.prevX = Number.NaN;
        run.fx.push(makeFx('ring', a.x, a.y - 8, 0.3, { r: 12, color: '#5ff0f0' }));
      }
      if (foe && Math.hypot(foe.x - a.x, foe.y - a.y) <= 180 && a.cd <= 0) {
        a.cd = 2.2;
        a.atkT = 0.3;
        for (let i = 0; i < 3; i++) {
          const pr = shootAt(run, a, -Math.PI / 2 + (i - 1) * 0.9, 'soul', 120);
          pr.homing = true;
          pr.turn = 5;
          pr.target = foe;
          pr.life = 2.2;
        }
        a.facing = foe.x >= a.x ? 1 : -1;
      }
      follow(run, a, anchorX, anchorY, 20, dt);
      break;
    }
    case 'cleric': {
      if (a.cd <= 0) {
        a.cd = 3;
        if (p.hp < p.maxHp) {
          p.heal(p.maxHp * (0.02 + 0.005 * (a.level - 1)));
          run.fx.push(makeFx('text', p.x, p.y - 26, 0.8, { text: '+', vy: -14, color: '#ff7aa8' }));
        }
        if (p.dotKind === 'poison') p.dotT = 0;
      }
      follow(run, a, anchorX, anchorY, 18, dt);
      break;
    }
    case 'leatherworker': {
      // A leather patch: shield HP that soaks the next hits (stacks up to three patches).
      if (a.cd2 <= 0) {
        a.cd2 = 12;
        const patch = 6 + (a.level - 1);
        const cap = patch * 3;
        if (run.absorb < cap && !p.dead) {
          run.absorb = Math.min(cap, run.absorb + patch);
          a.atkT = 0.2;
          run.fx.push(
            makeFx('text', p.x, p.y - 28, 0.8, { text: 'Patched', vy: -14, color: '#c8a06a' }),
          );
        }
      }
      follow(run, a, anchorX, anchorY, 18, dt);
      break;
    }
    case 'fisherman': {
      if (a.cd <= 0) a.cd = reelPickup(run, a) ? 1.5 : 0.5;
      follow(run, a, anchorX, anchorY, 18, dt);
      break;
    }
    case 'shepherd': {
      if (a.cd2 <= 0 && a.decoy.t <= 0) {
        const bait = nearestFoe(run, p.x, p.y, 160);
        if (bait) {
          // Drop the wool between the hero and the closest threat.
          const d = Math.hypot(bait.x - p.x, bait.y - p.y) || 1;
          const at = run.world.collide(
            p.x + ((bait.x - p.x) / d) * 50,
            p.y + ((bait.y - p.y) / d) * 50,
            5,
          );
          a.decoy.x = at.x;
          a.decoy.y = at.y;
          a.decoy.t = DECOY_TIME;
          a.cd2 = DECOY_CD;
          a.atkT = 0.2;
          run.fx.push(makeFx('ring', at.x, at.y - 4, 0.3, { r: 14, color: '#f2f2f2' }));
        } else a.cd2 = 1;
      }
      follow(run, a, anchorX, anchorY, 18, dt);
      break;
    }
    case 'love_golem': {
      if (a.cd <= 0) {
        // Charm the toughest non-boss enemy nearby; every charm sends the hero a little love.
        run.hash.query(a.x, a.y, 120, near);
        let best: Enemy | null = null;
        for (const e of near) {
          if (e.dying || e.boss || Math.hypot(e.x - a.x, e.y - a.y) > 120) continue;
          if (!best || e.hp > best.hp) best = e;
        }
        if (best) {
          a.cd = 4;
          a.atkT = 0.3;
          applyStatus(best, 'stun', 2.5);
          run.fx.push(
            makeFx('text', best.x, best.y - 22, 1, { text: '<3', vy: -10, color: '#ff7ac0' }),
          );
          if (!p.dead) p.heal(1 + a.level);
        } else a.cd = 0.5;
      }
      follow(run, a, anchorX, anchorY, 18, dt);
      break;
    }
    case 'horse': {
      // Trample: while the hero is moving fast, enemies the pair runs through take damage.
      const fast = Math.hypot(p.vx, p.vy) > 55;
      if (fast && a.cd <= 0) {
        a.cd = 0.25;
        run.hash.query(p.x, p.y, 22, near);
        for (const e of near) {
          if (e.dying || Math.hypot(e.x - p.x, e.y - p.y) > e.radius + 14) continue;
          damageEnemy(run, e, allyDamage(run, a) * 2, p.x, p.y, 110, false);
        }
      }
      follow(run, a, anchorX, anchorY, 12, dt, 1.4);
      break;
    }
    default: {
      // Support villagers (weaponsmith, armorer, librarian): their effect is applied at run start.
      follow(run, a, anchorX, anchorY, 18, dt);
    }
  }
}

export function updateAllies(run: RunState, dt: number): void {
  const p = run.player;
  for (const a of run.allies) {
    a.hurtT = Math.max(0, a.hurtT - dt);
    if (a.downed) {
      a.respawnT -= dt;
      if (a.respawnT <= 0 && !p.dead) {
        a.downed = false;
        a.hp = a.maxHp * 0.5;
        a.x = p.x + (a.slot === 0 ? 20 : -20);
        a.y = p.y + 10;
        a.prevX = Number.NaN;
        run.fx.push(makeFx('ring', a.x, a.y, 0.4, { r: 16, color: '#7dff9a' }));
      }
      continue;
    }
    const side = a.slot === 0 ? 1 : -1;
    const ax = p.x + side * 26;
    const ay = p.y + 12;
    // Far behind (rift, teleport, long chase): rejoin the hero.
    if (Math.hypot(p.x - a.x, p.y - a.y) > 320) {
      a.x = ax;
      a.y = ay;
      a.prevX = Number.NaN;
      a.phase = 0;
    }
    runRole(run, a, dt, ax, ay);
    takeContact(run, a, dt);
    a.t += dt;
  }
}

export function updatePet(run: RunState, dt: number): void {
  const pet = run.pet;
  if (!pet) return;
  const p = run.player;
  pet.t += dt;
  pet.cd -= dt;
  pet.noiseCd -= dt;
  // Lazy spring toward a point behind the hero.
  const tx = p.x - p.facing * 18;
  const ty = p.y + 8;
  const ax = (tx - pet.x) * 9 - pet.vx * 4.5;
  const ay = (ty - pet.y) * 9 - pet.vy * 4.5;
  pet.vx += ax * dt;
  pet.vy += ay * dt;
  const sp = Math.hypot(pet.vx, pet.vy);
  if (sp > 110) {
    pet.vx *= 110 / sp;
    pet.vy *= 110 / sp;
  }
  pet.x += pet.vx * dt;
  pet.y += pet.vy * dt;
  pet.moving = sp > 8;
  if (Math.abs(pet.vx) > 4) pet.facing = pet.vx > 0 ? 1 : -1;
  if (Math.hypot(p.x - pet.x, p.y - pet.y) > 300) {
    pet.x = tx;
    pet.y = ty;
    pet.prevX = Number.NaN;
    pet.vx = pet.vy = 0;
  }
  const eff = pet.def.effect;
  if (eff === 'frog' && pet.cd <= 0) {
    // Eats small slimes (and magma cubes) outright.
    const prey = nearestFoe(run, pet.x, pet.y, 22);
    if (prey && (prey.def.id === 'slime_small' || prey.def.id === 'magma_cube_small')) {
      pet.cd = 0.8;
      killEnemy(run, prey, true);
      run.fx.push(
        makeFx('text', pet.x, pet.y - 14, 0.7, { text: 'Gulp', vy: -12, color: '#7dff9a' }),
      );
    }
  } else if (eff === 'wolf_pup' && pet.noiseCd <= 0) {
    const charged = run.enemies.find(
      (e) => e.charged && !e.dying && Math.hypot(e.x - p.x, e.y - p.y) < 320,
    );
    if (charged) {
      pet.noiseCd = 8;
      run.fx.push(
        makeFx('text', pet.x, pet.y - 16, 1, { text: 'Woof!', vy: -14, color: '#ffd84a' }),
      );
    }
  }
  // Mooshroom: an emergency stew when the hero runs low.
  const stew = run.mods.stewHeal;
  if (stew > 0 && pet.cd <= 0 && !p.dead && p.hp < p.maxHp * STEW_BELOW) {
    pet.cd = STEW_CD;
    p.heal(p.maxHp * stew);
    run.emit('levelup');
    run.fx.push(makeFx('text', p.x, p.y - 28, 1.1, { text: 'Stew!', vy: -14, color: '#ffb87a' }));
  }
}

/** Where enemies near a taunting ally (Iron Golems) or a Shepherd's wool decoy should go instead of the hero. */
export function tauntTarget(run: RunState, e: Enemy): { x: number; y: number } | null {
  for (const a of run.allies) {
    if (a.downed) continue;
    const role = a.def.role;
    if (role === 'iron_golem') {
      if (Math.hypot(e.x - a.x, e.y - a.y) < TAUNT_RADIUS) return a;
    } else if (role === 'mini_golem') {
      if (Math.hypot(e.x - a.x, e.y - a.y) < MINI_TAUNT_RADIUS) return a;
    } else if (role === 'shepherd' && a.decoy.t > 0) {
      if (Math.hypot(e.x - a.decoy.x, e.y - a.decoy.y) < DECOY_LURE) return a.decoy;
    }
  }
  return null;
}
