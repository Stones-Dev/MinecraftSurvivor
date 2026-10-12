/** Pets and allies in a run (BRIEF section 11). Allies fight, get hurt by contact, go downed and respawn. */
import { allyById, petById, type AllyDef } from '../data/companions';
import { Ally, PetState } from '../entities/ally';
import type { Enemy } from '../entities/enemy';
import { makeFx } from '../entities/fx';
import { Projectile } from '../entities/projectile';
import type { RunState } from '../game';
import { damageEnemy, killEnemy } from './combat';
import type { RunLoadout } from './meta';

const near: Enemy[] = [];
const ALLY_RADIUS = 5;
const RESPAWN_TIME = 20;
/** Allies hit for this much base damage times the role multiplier and the hero's damage mods. */
const BASE_DMG = 9;
const TAUNT_RADIUS = 64;

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
  }
  if (run.pet) {
    run.pet.x = p.x - 20;
    run.pet.y = p.y + 10;
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
  const next = run.world.collide(
    a.x + (dx / d) * step,
    a.y + (dy / d) * step,
    ALLY_RADIUS,
    run.biome(),
  );
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

function allyDamage(run: RunState, a: Ally): number {
  return BASE_DMG * a.def.dmg * run.mods.dmg * (1 + 0.2 * (a.level - 1));
}

function shoot(
  run: RunState,
  a: Ally,
  target: Enemy,
  style: Projectile['style'],
  speed: number,
  dmgMult = 1,
): Projectile {
  const ang = Math.atan2(target.y - a.y, target.x - a.x);
  const pr = new Projectile(
    a.x,
    a.y - 6,
    Math.cos(ang) * speed,
    Math.sin(ang) * speed,
    3,
    allyDamage(run, a) * dmgMult,
    0,
    true,
    1.4,
  );
  pr.style = style;
  run.projectiles.push(pr);
  a.facing = target.x >= a.x ? 1 : -1;
  return pr;
}

/** Contact damage taken from enemies touching an ally. */
function takeContact(run: RunState, a: Ally, dt: number): void {
  a.contactCd -= dt;
  if (a.contactCd > 0) return;
  run.hash.query(a.x, a.y, 14, near);
  for (const e of near) {
    if (e.dying || Math.hypot(e.x - a.x, e.y - a.y) > e.radius + ALLY_RADIUS + 1) continue;
    const armor = a.def.role === 'iron_golem' ? 0.5 : 1;
    a.hp -= e.dmg * 0.5 * armor;
    a.hurtT = 0.15;
    a.contactCd = 0.7;
    if (a.hp <= 0) {
      a.hp = 0;
      a.downed = true;
      a.respawnT = RESPAWN_TIME;
      run.fx.push(
        makeFx('text', a.x, a.y - 22, 1.2, { text: 'Downed', vy: -12, color: '#ff9a9a' }),
      );
      return;
    }
    return;
  }
}

function runRole(run: RunState, a: Ally, dt: number, anchorX: number, anchorY: number): void {
  const p = run.player;
  const def: AllyDef = a.def;
  a.cd -= dt;
  a.cd2 -= dt;
  a.atkT = Math.max(0, a.atkT - dt);
  const leash = 190;
  const foe = nearestFoe(run, a.x, a.y, leash);
  const foeOk = foe && Math.hypot(foe.x - p.x, foe.y - p.y) < leash + 40;
  switch (def.role) {
    case 'wolf':
    case 'iron_golem': {
      if (foe && foeOk) {
        const d = moveTo(run, a, foe.x, foe.y, def.speed, dt);
        if (d < foe.radius + ALLY_RADIUS + 8 && a.cd <= 0) {
          a.cd = def.role === 'wolf' ? 0.6 : 1.1;
          a.atkT = 0.2;
          damageEnemy(run, foe, allyDamage(run, a), a.x, a.y, def.role === 'wolf' ? 40 : 90);
          if (def.role === 'wolf') run.emit('hit');
        }
      } else if (Math.hypot(anchorX - a.x, anchorY - a.y) > 14) {
        moveTo(run, a, anchorX, anchorY, def.speed, dt);
      } else a.moving = false;
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
    case 'snow_golem':
    case 'llama':
    case 'fletcher': {
      const range = def.role === 'fletcher' ? 200 : 150;
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
        } else {
          a.cd = 1.2;
          shoot(run, a, foe, 'arrow', 220);
        }
        a.atkT = 0.2;
      }
      if (Math.hypot(anchorX - a.x, anchorY - a.y) > 22) {
        moveTo(run, a, anchorX, anchorY, def.speed, dt);
      } else a.moving = false;
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
      if (Math.hypot(anchorX - a.x, anchorY - a.y) > 18) {
        moveTo(run, a, anchorX, anchorY, def.speed, dt);
      } else a.moving = false;
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
      if (Math.hypot(anchorX - a.x, anchorY - a.y) > 12) {
        moveTo(run, a, anchorX, anchorY, def.speed * 1.4, dt);
      } else a.moving = false;
      break;
    }
    default: {
      // Support villagers (weaponsmith, armorer, librarian): their effect is applied at run start.
      if (Math.hypot(anchorX - a.x, anchorY - a.y) > 18) {
        moveTo(run, a, anchorX, anchorY, def.speed, dt);
      } else a.moving = false;
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
}

/** Where enemies near an Iron Golem should go instead of the hero (BRIEF: taunts within 4 tiles). */
export function tauntTarget(run: RunState, e: Enemy): { x: number; y: number } | null {
  for (const a of run.allies) {
    if (a.def.role !== 'iron_golem' || a.downed) continue;
    if (Math.hypot(e.x - a.x, e.y - a.y) < TAUNT_RADIUS) return a;
  }
  return null;
}
