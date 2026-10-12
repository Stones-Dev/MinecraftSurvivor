/**
 * Nether rift (BRIEF section 10): from 1:15 a portal may open (14% every 30 s) for 45 s. Entering
 * starts a 90 s fight in a walled Nether arena; the overworld freezes meanwhile.
 */
import type { Enemy } from '../entities/enemy';
import { makeFx } from '../entities/fx';
import type { RunState } from '../game';
import type { World } from '../world/world';
import { gatherCompanions } from './allies';
import { ringPoint, makeEnemy } from './spawner';

interface Stash {
  enemies: Enemy[];
  projectiles: RunState['projectiles'];
  pickups: RunState['pickups'];
  zones: RunState['zones'];
  mines: RunState['mines'];
  telegraphs: RunState['telegraphs'];
  orbiters: RunState['orbiters'];
  npcs: RunState['npcs'];
  scheduled: RunState['scheduled'];
  decoys: RunState['decoys'];
  x: number;
  y: number;
  world: World;
}

export class RiftState {
  portal: { x: number; y: number; left: number } | null = null;
  checkAt = 75;
  active = false;
  timer = 0;
  stash: Stash | null = null;
  foes: Enemy[] = [];
}

export const RIFT_DURATION = 90;
const PORTAL_LIFE = 45;

function enter(run: RunState): void {
  const r = run.rift;
  const p = run.player;
  r.stash = {
    enemies: run.enemies,
    projectiles: run.projectiles,
    pickups: run.pickups,
    zones: run.zones,
    mines: run.mines,
    telegraphs: run.telegraphs,
    orbiters: run.orbiters,
    npcs: run.npcs,
    scheduled: run.scheduled,
    decoys: run.decoys,
    x: p.x,
    y: p.y,
    world: run.world,
  };
  run.enemies = [];
  run.projectiles = [];
  run.pickups = [];
  run.zones = [];
  run.mines = [];
  run.telegraphs = [];
  run.orbiters = [];
  run.npcs = [];
  run.scheduled = [];
  run.decoys = []; // overworld decoys must not lure the arena foes; they wait in the stash
  run.hazardT = 0;
  run.storm = false;
  run.chargedBonus = 0;
  run.world = run.arenaWorld;
  r.active = true;
  r.timer = RIFT_DURATION;
  r.portal = null;
  p.x = 0;
  p.y = 90;
  p.snap();
  p.vx = p.vy = 0;
  p.iframes = 1.5;
  gatherCompanions(run);
  r.foes = [];
  const kind = run.rng.events.pick(['blaze_lord', 'ghast', 'brute', 'hoglins'] as const);
  const spawn = (id: string, x: number, y: number, hpMult: number): Enemy | null => {
    const e = makeEnemy(run, id, x, y, false);
    if (!e) return null;
    e.maxHp *= hpMult;
    e.hp = e.maxHp;
    e.boss = 'mini';
    e.riftFoe = true;
    e.cd = 2;
    run.enemies.push(e);
    r.foes.push(e);
    return e;
  };
  if (kind === 'blaze_lord') {
    spawn('blaze', 0, -60, 9);
    run.announce('Blaze Lord!', '#ff9a3a', 4);
  } else if (kind === 'ghast') {
    spawn('ghast', 0, -50, 3);
    run.announce('A Ghast haunts the rift!', '#ff9a3a', 4);
  } else if (kind === 'brute') {
    spawn('piglin_brute', 0, -60, 1);
    run.announce('Piglin Brute!', '#ff9a3a', 4);
  } else {
    for (let i = 0; i < 3; i++) spawn('hoglin', -40 + i * 40, -60, 1.3);
    run.announce('Hoglin pack!', '#ff9a3a', 4);
  }
  run.fx.push(makeFx('ring', 0, 90, 0.6, { r: 40, color: '#b06bff' }));
}

function leave(run: RunState, won: boolean): void {
  const r = run.rift;
  const s = r.stash;
  const p = run.player;
  if (!s) return;
  // Callbacks queued inside the arena (volleys, pools, blasts) are bound to arena positions, so firing them
  // later in the overworld would land them in the wrong place. Flush them now instead, while the arena is
  // still the active world: hero effects resolve, and any loot they drop is collected below. The overworld's
  // own queue is restored untouched (it is frozen meanwhile, like everything else in the stash).
  const pending = run.scheduled;
  run.scheduled = [];
  for (const q of pending) q.fn();
  const loot = run.pickups;
  run.enemies = s.enemies;
  run.projectiles = s.projectiles;
  run.pickups = s.pickups;
  run.zones = s.zones;
  run.mines = s.mines;
  run.telegraphs = s.telegraphs;
  run.orbiters = s.orbiters;
  run.npcs = s.npcs;
  run.scheduled = s.scheduled;
  run.decoys = s.decoys;
  run.hazardT = 0;
  run.world = s.world;
  p.x = s.x;
  p.y = s.y;
  p.snap();
  p.vx = p.vy = 0;
  p.iframes = 2;
  p.dotT = 0;
  p.dotDps = 0;
  gatherCompanions(run);
  r.stash = null;
  r.active = false;
  r.foes = [];
  r.checkAt = run.time + 30;
  if (won) {
    // Whatever the arena kills dropped comes back with the hero.
    for (const pk of loot) {
      pk.x = p.x;
      pk.y = p.y;
      pk.prevX = Number.NaN;
      pk.magnet = true;
      run.pickups.push(pk);
    }
    run.rareSpawnEggs++;
    run.spawnEggs += 3;
    run.emeraldsPicked += Math.round(60 * run.mods.lootMult);
    run.announce('Rift cleared! Rare Spawn Egg', '#ffd84a', 4);
    run.emit('levelup');
  } else {
    p.dead = false;
    p.hp = Math.max(1, p.maxHp * 0.3);
    run.status = 'playing';
    run.announce('You escaped the rift...', '#ff9a9a', 3);
  }
}

export function updateRift(run: RunState, dt: number): void {
  const r = run.rift;
  const p = run.player;
  if (r.active) {
    r.timer -= dt;
    // A dead hero escapes even if the last foe fell the same step: no reward, no corpse in the overworld.
    if (p.dead) {
      leave(run, false);
    } else if (r.foes.length > 0 && r.foes.every((e) => e.dying || e.hp <= 0)) {
      leave(run, true);
    } else if (r.timer <= 0) {
      leave(run, false);
    }
    return;
  }
  if (p.dead) return;
  const bossAlive = run.enemies.some((e) => e.boss === 'boss' && !e.dying);
  if (run.time >= r.checkAt) {
    r.checkAt = run.time + 30;
    if (!r.portal && !bossAlive && run.rng.events.chance(0.14)) {
      const pt = ringPoint(run, run.rng.events.range(0, Math.PI * 2), 8);
      if (pt) {
        r.portal = { x: pt.x * 0.55 + p.x * 0.45, y: pt.y * 0.55 + p.y * 0.45, left: PORTAL_LIFE };
        run.announce('A Nether rift has opened!', '#b06bff', 4);
        run.emit('portal');
      }
    }
  }
  if (r.portal) {
    r.portal.left -= dt;
    if (r.portal.left <= 0) {
      r.portal = null;
      run.announce('The rift closed.', '#9a9aa8', 2);
    } else if (Math.hypot(p.x - r.portal.x, p.y - r.portal.y) < 16) {
      enter(run);
    }
  }
}
