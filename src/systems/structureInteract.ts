/**
 * Run-time behaviour of world structures (v1.4): the glue between the placed stamps (world/structures.ts) and
 * the run. Everything here is driven from two hooks:
 *
 * - `updateStructureInteract(run, dt, near)` from systems/interact.ts: chests (`chest_village`,
 *   `chest_pyramid`: open on touch, loot from data/lootTables.ts), crops (`crop`: eaten once for 8 HP, regrow),
 *   the temple's pressure plate (`pressure_plate`: the trap of systems/templeTrap.ts);
 * - `updateVillageLife(run, dt)` from systems/npcs.ts: the villagers (Blacksmith, Librarian, Cleric, Farmer)
 *   appear when the hero is near a village and leave when he goes, and sell their services for emeralds.
 *   (The Iron Golem is systems/villageGolem.ts, hooked next to it.)
 *
 * Per-run state lives in a WeakMap keyed by the RunState, so nothing leaks between runs and RunState needs no
 * new fields. To add behaviour for a new structure prop, add a case in `updateStructureInteract`.
 */
import { makeFx } from '../entities/fx';
import type { RunState, Telegraph } from '../game';
import { MAX_WEAPON_LEVEL, WEAPONS } from '../weapons';
import { updateJungleTemple } from './jungleTemple';
import { outpostStatusTags, servicePriceFactor, updatePillagerOutpost } from './pillagerOutpost';
import { updateGuards } from './structureEnemies';
import { applyLoot, openChest, say } from './structureLoot';
import { updateTrialChamber } from './trialChamber';
import { updateWitchHut, witchStatusTags } from './witchHut';

export { applyLoot };
import type { Prop } from '../world/props';
import { structuresInRect, type PlacedStructure } from '../world/structures';
import { TILE_PX } from '../world/terrain';
import { explode, hurtPlayer } from './combat';
import type { Npc } from './npcs';
import {
  FUSE_S,
  inTrapZone,
  newTrap,
  PLATE_HIT_PX,
  PLATE_SWING_PX,
  PLATE_TRIGGER_PX,
  stepTrap,
  TNT_BLAST_PX,
  TRAP_DAMAGE,
  TRAP_ENEMY_DAMAGE,
  TRAP_RADIUS,
  type TrapState,
  tntPoints,
} from './templeTrap';

// ---------------------------------------------------------------------------------------------------
// Tunables

/** Hero reach beyond the two radii to open a chest. */
const CHEST_REACH = 6;
/** HP a crop gives, the distance that eats it and the seconds it takes to regrow. */
export const CROP_HEAL = 8;
const CROP_EAT_PX = 9;
export const CROP_REGROW_S = 80;
/** Village services (emeralds). */
export const SERVICE_COST = { smith: 60, librarian: 30, cleric: 25 } as const;
const SMITH_USES = 2;
const LIBRARIAN_USES = 1;
const CLERIC_HEAL = 0.6;
/** The cleric only treats a hero below this share of max HP. */
const CLERIC_BELOW = 0.85;
/** Seconds the hero must stand next to a villager before he trades (walking past costs nothing). */
const DWELL_S = 0.6;
const TALK_PX = 22;
const GREET_PX = 80;
/** Villagers appear within this distance of their village and leave beyond the second value. */
const SPAWN_PX = 520;
const DESPAWN_PX = 760;
/** "<Structure> found" banner when the hero gets this close to one. */
const ANNOUNCE_PX = 300;

const NPC_SPRITE = {
  smith: 'npc.weaponsmith_plains_villager',
  librarian: 'npc.librarian_plains_villager',
  cleric: 'npc.cleric_plains_villager',
  farmer: 'npc.farmer_plains_villager',
} as const;
const NPC_LABEL = {
  smith: 'Blacksmith',
  librarian: 'Librarian',
  cleric: 'Cleric',
  farmer: 'Farmer',
} as const;
type VillagerRole = keyof typeof NPC_SPRITE;

// ---------------------------------------------------------------------------------------------------
// Per-run state

interface NpcMemo {
  dwell: number;
  /** Seconds until this villager trades again, and until he repeats a message. */
  cool: number;
  msg: number;
  greeted: boolean;
  homeX: number;
  homeY: number;
}

interface TrapRun {
  trap: TrapState;
  plate: Prop;
  tele: Telegraph | null;
}

interface Runtime {
  villagers: Map<string, number[]>;
  memo: Map<number, NpcMemo>;
  uses: Map<string, { smith: number; librarian: number }>;
  crops: { prop: Prop; t: number }[];
  traps: Map<string, TrapRun>;
  scan: number;
  plateScan: number;
  /** Structures already announced ("Village found"). */
  announced: Set<string>;
}

const RUNTIMES = new WeakMap<RunState, Runtime>();

function rt(run: RunState): Runtime {
  let r = RUNTIMES.get(run);
  if (!r) {
    r = {
      villagers: new Map(),
      memo: new Map(),
      uses: new Map(),
      crops: [],
      traps: new Map(),
      scan: 0,
      plateScan: 0,
      announced: new Set(),
    };
    RUNTIMES.set(run, r);
  }
  return r;
}

// ---------------------------------------------------------------------------------------------------
// Props: chests, crops, the temple plate

/** Hook from updateInteract: `near` are the props around the hero (the same list the other props use). */
export function updateStructureInteract(run: RunState, dt: number, near: readonly Prop[]): void {
  if (!run.world.structures) return;
  const p = run.player;
  const r = rt(run);
  for (const prop of near) {
    switch (prop.kind) {
      case 'chest_village':
      case 'chest_pyramid':
      case 'chest_jungle':
      case 'chest_legendary':
        if (
          !p.dead &&
          Math.hypot(prop.x - p.x, prop.y - p.y) < prop.radius + p.radius + CHEST_REACH
        )
          openChest(run, prop);
        break;
      case 'crop':
        if (
          !p.dead &&
          p.hp < p.maxHp - 0.5 &&
          Math.hypot(prop.x - p.x, prop.y - p.y) < CROP_EAT_PX
        ) {
          p.heal(CROP_HEAL);
          run.world.removeProp(prop);
          r.crops.push({ prop, t: CROP_REGROW_S });
          say(run, prop.x, prop.y, `+${CROP_HEAL} HP`, '#ff8a8a');
          run.emit('emerald');
        }
        break;
      default:
        break;
    }
  }
  // Pressure plates within a screen or two are armed, so an arrow shot from a distance can break one too.
  r.plateScan -= dt;
  if (r.plateScan <= 0) {
    r.plateScan = 0.3;
    for (const prop of run.world.propsInRect(p.x - 300, p.y - 300, p.x + 300, p.y + 300)) {
      if (prop.kind === 'pressure_plate' && !r.traps.has(prop.id))
        r.traps.set(prop.id, { trap: newTrap(), plate: prop, tele: null });
    }
  }
  // Crops regrow wherever the hero is.
  for (let i = r.crops.length - 1; i >= 0; i--) {
    const c = r.crops[i];
    if (!c) continue;
    c.t -= dt;
    if (c.t <= 0) {
      run.world.restoreProp(c.prop);
      r.crops.splice(i, 1);
    }
  }
  if (r.traps.size > 0) updateTraps(run, r, dt);
  // Structures, part 2: the jungle temple's wires and levers, the trial, the outpost and raids, the witch hut.
  updateJungleTemple(run, dt);
  updateTrialChamber(run, dt);
  updatePillagerOutpost(run, dt);
  updateWitchHut(run, dt);
  updateGuards(run);
}

/** HUD tags of the effects structures give the hero (Bad Omen, Hero of the Village, a cauldron's Regeneration). */
export function structureStatusTags(
  run: RunState,
): { text: string; color: string; left: number }[] {
  return [...outpostStatusTags(run), ...witchStatusTags(run)];
}

/** Price of a village service for this hero right now (halved under Hero of the Village). */
export function serviceCost(run: RunState, base: number): number {
  return Math.ceil(base * servicePriceFactor(run));
}

function plateHit(run: RunState, plate: Prop): boolean {
  for (const pr of run.projectiles) {
    if (!pr.friendly || !pr.alive) continue;
    if (segDist(plate.x, plate.y, pr.px, pr.py, pr.x, pr.y) < PLATE_HIT_PX + pr.radius) return true;
  }
  const p = run.player;
  if (p.swingT > 0.22 && Math.hypot(plate.x - p.x, plate.y - p.y) < PLATE_SWING_PX) return true;
  const h = run.hitPoints;
  for (let i = 0; i < h.length; i += 2) {
    if (Math.hypot((h[i] ?? 0) - plate.x, (h[i + 1] ?? 0) - plate.y) < PLATE_HIT_PX + 4)
      return true;
  }
  return false;
}

/** Distance from a point to the segment (ax, ay)-(bx, by). */
export function segDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function updateTraps(run: RunState, r: Runtime, dt: number): void {
  const p = run.player;
  for (const [id, tr] of r.traps) {
    const { plate } = tr;
    if (run.world.isRemoved(plate)) {
      r.traps.delete(id);
      continue;
    }
    // Far-away armed plates sleep; a lit one keeps burning wherever the hero is.
    if (tr.trap.phase === 'armed' && Math.hypot(plate.x - p.x, plate.y - p.y) > 400) continue;
    const onPlate = !p.dead && Math.hypot(plate.x - p.x, plate.y - p.y) < PLATE_TRIGGER_PX;
    const hit = plateHit(run, plate);
    for (const ev of stepTrap(tr.trap, dt, { onPlate, hit })) {
      switch (ev.type) {
        case 'lit': {
          const tele: Telegraph = {
            kind: 'circle',
            x: plate.x,
            y: plate.y,
            x2: 0,
            y2: 0,
            r: TRAP_RADIUS,
            t: 0,
            dur: FUSE_S,
          };
          run.telegraphs.push(tele);
          tr.tele = tele;
          run.emit('tnt');
          say(run, plate.x, plate.y, 'TRAP! Run or break the plate!', '#fff2b0', 1.6);
          break;
        }
        case 'blip':
          run.emit('tnt');
          break;
        case 'boom': {
          const pt = tntPoints(plate.x, plate.y)[ev.index];
          if (!pt) break;
          explode(run, pt.x, pt.y, TNT_BLAST_PX, TRAP_ENEMY_DAMAGE, 0, null);
          if (ev.index === 0) {
            run.shake = Math.max(run.shake, 10);
            if (!p.dead && inTrapZone(p.x, p.y, p.radius, plate.x, plate.y))
              hurtPlayer(run, TRAP_DAMAGE, null);
          }
          break;
        }
        case 'disarmed': {
          if (tr.tele) {
            const i = run.telegraphs.indexOf(tr.tele);
            if (i >= 0) run.telegraphs.splice(i, 1);
            tr.tele = null;
          }
          run.world.removeProp(plate);
          run.emit('hit');
          say(run, plate.x, plate.y, 'Trap disarmed', '#7dff9a', 1.6);
          run.fx.push(makeFx('ring', plate.x, plate.y - 2, 0.3, { r: 14, color: '#7dff9a' }));
          r.traps.delete(id);
          break;
        }
        case 'done':
          run.world.removeProp(plate);
          r.traps.delete(id);
          break;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Villagers

function villagerNpc(run: RunState, role: VillagerRole, x: number, y: number): Npc {
  const n: Npc = {
    id: run.nextNpcId++,
    kind: role,
    x,
    y,
    dx: 0,
    dy: 1,
    moving: false,
    state: 'idle',
    t: 0,
    sprite: NPC_SPRITE[role],
    leader: 0,
  };
  run.npcs.push(n);
  return n;
}

function spawnVillage(run: RunState, v: PlacedStructure): void {
  const r = rt(run);
  const ids: number[] = [];
  for (const a of v.blueprint.actors) {
    if (!(a.role in NPC_SPRITE)) continue; // the golem is systems/villageGolem.ts
    const x = (v.tx + a.tx + 0.5) * TILE_PX;
    const y = (v.ty + a.ty + 0.5) * TILE_PX;
    const n = villagerNpc(run, a.role as VillagerRole, x, y);
    r.memo.set(n.id, { dwell: 0, cool: 0, msg: 0, greeted: false, homeX: x, homeY: y });
    ids.push(n.id);
  }
  r.villagers.set(v.key, ids);
}

function despawnVillage(run: RunState, key: string): void {
  const r = rt(run);
  const ids = r.villagers.get(key) ?? [];
  run.npcs = run.npcs.filter((n) => !ids.includes(n.id));
  for (const id of ids) r.memo.delete(id);
  r.villagers.delete(key);
}

/** Pure choice for the Blacksmith: the best weapon (highest level) that can still be raised. */
export function smithTarget(weapons: readonly { level: number }[], maxLevel: number): number {
  let best = -1;
  for (let i = 0; i < weapons.length; i++) {
    const w = weapons[i];
    if (!w || w.level >= maxLevel) continue;
    if (best < 0 || w.level > (weapons[best]?.level ?? 0)) best = i;
  }
  return best;
}

type Service = { ok: true } | { ok: false; why: string };

function serviceCheck(
  run: RunState,
  role: VillagerRole,
  used: { smith: number; librarian: number },
): Service {
  const p = run.player;
  switch (role) {
    case 'smith':
      if (used.smith >= SMITH_USES) return { ok: false, why: 'Nothing more to forge' };
      if (smithTarget(run.weapons, MAX_WEAPON_LEVEL) < 0)
        return { ok: false, why: 'Weapons are maxed' };
      return run.emeraldsPicked >= serviceCost(run, SERVICE_COST.smith)
        ? { ok: true }
        : { ok: false, why: `Need ${serviceCost(run, SERVICE_COST.smith)} emeralds (weapon +1)` };
    case 'librarian':
      if (used.librarian >= LIBRARIAN_USES) return { ok: false, why: 'Sold out' };
      return run.emeraldsPicked >= serviceCost(run, SERVICE_COST.librarian)
        ? { ok: true }
        : { ok: false, why: `Need ${serviceCost(run, SERVICE_COST.librarian)} emeralds (reroll)` };
    case 'cleric':
      if (p.hp >= p.maxHp * CLERIC_BELOW) return { ok: false, why: 'You look healthy' };
      return run.emeraldsPicked >= serviceCost(run, SERVICE_COST.cleric)
        ? { ok: true }
        : { ok: false, why: `Need ${serviceCost(run, SERVICE_COST.cleric)} emeralds (heal)` };
    default:
      return { ok: false, why: '' };
  }
}

function perform(
  run: RunState,
  n: Npc,
  role: VillagerRole,
  used: { smith: number; librarian: number },
): void {
  const p = run.player;
  switch (role) {
    case 'smith': {
      const i = smithTarget(run.weapons, MAX_WEAPON_LEVEL);
      const w = run.weapons[i];
      if (!w) return;
      run.emeraldsPicked -= serviceCost(run, SERVICE_COST.smith);
      w.level = Math.min(MAX_WEAPON_LEVEL, w.level + 1);
      used.smith++;
      run.recomputeStats();
      say(run, n.x, n.y - 10, `${WEAPONS[w.id].name} Lv ${w.level}!`, '#ffd84a', 1.6);
      break;
    }
    case 'librarian':
      run.emeraldsPicked -= serviceCost(run, SERVICE_COST.librarian);
      run.rerolls++;
      used.librarian++;
      say(run, n.x, n.y - 10, '+1 reroll', '#d9a6ff', 1.6);
      break;
    case 'cleric':
      run.emeraldsPicked -= serviceCost(run, SERVICE_COST.cleric);
      p.heal(p.maxHp * CLERIC_HEAL);
      say(run, n.x, n.y - 10, 'Healed!', '#ff8a8a', 1.6);
      break;
    default:
      return;
  }
  run.stats.trades++;
  run.emit('trade');
  run.fx.push(makeFx('ring', n.x, n.y - 6, 0.35, { r: 14, color: '#7dff9a' }));
}

/** Hook from updateNpcs: spawn / remove villagers around the hero and run their services. */
export function updateVillageLife(run: RunState, dt: number): void {
  if (!run.world.structures) return;
  const p = run.player;
  const r = rt(run);
  r.scan -= dt;
  if (r.scan <= 0) {
    r.scan = 0.5;
    for (const v of structuresInRect(
      run.world,
      p.x - SPAWN_PX,
      p.y - SPAWN_PX,
      p.x + SPAWN_PX,
      p.y + SPAWN_PX,
    )) {
      if (!r.announced.has(v.key) && Math.hypot(v.cx - p.x, v.cy - p.y) < ANNOUNCE_PX) {
        r.announced.add(v.key);
        run.announce(`${v.def.name} found`, v.def.color, 3);
      }
      if (
        v.def.id === 'village' &&
        !r.villagers.has(v.key) &&
        Math.hypot(v.cx - p.x, v.cy - p.y) < SPAWN_PX
      )
        spawnVillage(run, v);
    }
    for (const key of [...r.villagers.keys()]) {
      const ids = r.villagers.get(key) ?? [];
      const first = run.npcs.find((n) => n.id === ids[0]);
      if (!first || Math.hypot(first.x - p.x, first.y - p.y) > DESPAWN_PX) despawnVillage(run, key);
    }
  }
  for (const n of run.npcs) {
    if (n.kind !== 'smith' && n.kind !== 'librarian' && n.kind !== 'cleric' && n.kind !== 'farmer')
      continue;
    const memo = r.memo.get(n.id);
    if (!memo) continue;
    const role: VillagerRole = n.kind;
    const d = Math.hypot(p.x - n.x, p.y - n.y);
    memo.cool = Math.max(0, memo.cool - dt);
    memo.msg = Math.max(0, memo.msg - dt);
    // The farmer paces along his furrow; everyone else stands at the post and faces the hero.
    if (role === 'farmer') {
      n.moving = true;
      n.dx = Math.cos(run.time * 0.4 + n.id) >= 0 ? 1 : -1;
      n.dy = 0;
      n.x = memo.homeX + Math.sin(run.time * 0.4 + n.id) * 14;
      n.y = memo.homeY;
      continue;
    }
    if (d < GREET_PX && !memo.greeted && !p.dead) {
      memo.greeted = true;
      say(run, n.x, n.y - 14, NPC_LABEL[role], '#ffe27a', 1.6);
    } else if (d > GREET_PX * 2) memo.greeted = false;
    if (d < GREET_PX) {
      n.dx = (p.x - n.x) / (d || 1);
      n.dy = (p.y - n.y) / (d || 1);
    }
    if (d >= TALK_PX || p.dead) {
      memo.dwell = 0;
      continue;
    }
    const key = [...r.villagers.entries()].find(([, ids]) => ids.includes(n.id))?.[0] ?? '';
    let used = r.uses.get(key);
    if (!used) {
      used = { smith: 0, librarian: 0 };
      r.uses.set(key, used);
    }
    const check = serviceCheck(run, role, used);
    if (!check.ok) {
      memo.dwell = 0;
      if (memo.msg <= 0) {
        memo.msg = 1.8;
        say(run, n.x, n.y - 14, check.why, '#ff9a9a', 1.4);
      }
      continue;
    }
    if (memo.cool > 0) continue;
    memo.dwell += dt;
    if (memo.dwell >= DWELL_S) {
      memo.dwell = 0;
      memo.cool = role === 'cleric' ? 6 : 2.5;
      perform(run, n, role, used);
    }
  }
}
