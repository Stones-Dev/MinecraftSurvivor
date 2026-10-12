/** Friendly NPC events: the Wandering Trader (with llamas) and the Lost Villager escort (BRIEF section 10). */
import { ITEM_IDS } from '../data/items';
import { makeFx } from '../entities/fx';
import type { RunState } from '../game';
import { ringPoint } from './spawner';
import { giveItem } from './items';

export interface Npc {
  id: number;
  kind: 'trader' | 'villager' | 'llama';
  x: number;
  y: number;
  /** Last movement direction (selects the sprite row) and whether it is moving. */
  dx: number;
  dy: number;
  moving: boolean;
  state: 'arrive' | 'idle' | 'follow' | 'flee' | 'lost';
  t: number;
  /** Atlas prefix, e.g. `npc.wandering_trader`. */
  sprite: string;
  /** Llamas follow this NPC id. */
  leader: number;
}

/** Where the Lost Villager has to be escorted to (null when no escort is active). */
export interface RescueMarker {
  x: number;
  y: number;
  /** Seconds left before the villager gives up. */
  left: number;
}

const TRADE_COST = 100;
let nextNpc = 1;

function add(
  run: RunState,
  kind: Npc['kind'],
  x: number,
  y: number,
  sprite: string,
  leader = 0,
): Npc {
  const n: Npc = {
    id: nextNpc++,
    kind,
    x,
    y,
    dx: 0,
    dy: 1,
    moving: false,
    state: kind === 'villager' ? 'lost' : 'arrive',
    t: 0,
    sprite,
    leader,
  };
  run.npcs.push(n);
  return n;
}

function moveToward(n: Npc, tx: number, ty: number, speed: number, dt: number): number {
  const dx = tx - n.x;
  const dy = ty - n.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) {
    n.moving = false;
    return d;
  }
  n.x += (dx / d) * speed * dt;
  n.y += (dy / d) * speed * dt;
  n.dx = dx / d;
  n.dy = dy / d;
  n.moving = true;
  return d;
}

export function spawnTrader(run: RunState): void {
  const p = run.player;
  const pt = ringPoint(run, run.rng.events.range(0, Math.PI * 2), 6) ?? { x: p.x + 220, y: p.y };
  const trader = add(run, 'trader', pt.x, pt.y, 'npc.wandering_trader');
  add(run, 'llama', pt.x - 14, pt.y + 6, 'pet.brown_llama_trader_decor', trader.id);
  add(run, 'llama', pt.x + 14, pt.y + 8, 'pet.white_llama_trader_decor', trader.id);
  run.announce('A Wandering Trader arrives (100 emeralds for an item)', '#7de8e8', 4);
}

export function spawnVillager(run: RunState): void {
  if (run.rescue) return;
  const p = run.player;
  const a = run.rng.events.range(0, Math.PI * 2);
  const v = add(
    run,
    'villager',
    p.x + Math.cos(a) * 240,
    p.y + Math.sin(a) * 200,
    'npc.farmer_plains_villager',
  );
  const b = a + run.rng.events.range(2.2, 4);
  run.rescue = { x: v.x + Math.cos(b) * 380, y: v.y + Math.sin(b) * 300, left: 150 };
  run.announce('A villager is lost! Escort him to the flag', '#ffe27a', 4);
}

export function updateNpcs(run: RunState, dt: number): void {
  if (run.rift.active) return;
  const p = run.player;
  const d = run.director;
  if (
    run.time >= d.traderAt &&
    !run.npcs.some((n) => n.kind === 'trader') &&
    !run.enemies.some((e) => e.boss === 'boss')
  ) {
    d.traderAt = run.time + run.rng.events.range(200, 300);
    spawnTrader(run);
  }
  if (run.time >= d.villagerAt && !run.rescue && !run.enemies.some((e) => e.boss === 'boss')) {
    d.villagerAt = run.time + run.rng.events.range(220, 320);
    spawnVillager(run);
  }
  for (const n of run.npcs) {
    n.t += dt;
    const dist = Math.hypot(p.x - n.x, p.y - n.y);
    if (n.kind === 'trader') {
      if (n.state === 'arrive') {
        if (moveToward(n, p.x + 70, p.y - 20, 40, dt) < 12 || n.t > 12) {
          n.state = 'idle';
          n.t = 0;
        }
      } else if (n.state === 'idle') {
        n.moving = false;
        if (dist < 18 && !p.dead) {
          if (run.emeraldsPicked >= TRADE_COST) {
            run.emeraldsPicked -= TRADE_COST;
            giveItem(run, run.rng.drops.pick(ITEM_IDS));
            run.fx.push(
              makeFx('text', n.x, n.y - 30, 1.2, { text: 'Trade!', vy: -14, color: '#7dff9a' }),
            );
            run.emit('emerald');
            n.state = 'flee';
          } else if (n.t > 1) {
            n.t = 0;
            run.fx.push(
              makeFx('text', n.x, n.y - 30, 1, {
                text: 'Need 100 emeralds',
                vy: -10,
                color: '#ff9a9a',
              }),
            );
          }
        }
        if (n.t > 20) n.state = 'flee';
      } else {
        const ax = n.x - p.x;
        const ay = n.y - p.y;
        const l = Math.hypot(ax, ay) || 1;
        moveToward(n, n.x + (ax / l) * 100, n.y + (ay / l) * 100, 62, dt);
      }
    } else if (n.kind === 'llama') {
      const leader = run.npcs.find((o) => o.id === n.leader);
      if (!leader) {
        n.state = 'flee';
      } else {
        const off = n.id % 2 === 0 ? 14 : -14;
        moveToward(n, leader.x + off, leader.y + 8, leader.state === 'flee' ? 66 : 44, dt);
      }
    } else if (n.kind === 'villager' && run.rescue) {
      if (n.state === 'lost' && dist < 40 && !p.dead) {
        n.state = 'follow';
        run.fx.push(
          makeFx('text', n.x, n.y - 30, 1, { text: 'Follow me!', vy: -12, color: '#ffe27a' }),
        );
      }
      if (n.state === 'follow') {
        if (dist > 30) moveToward(n, p.x, p.y, 70, dt);
        else n.moving = false;
        if (Math.hypot(run.rescue.x - n.x, run.rescue.y - n.y) < 26) {
          const loot = run.mods.lootMult;
          run.emeraldsPicked += Math.round(40 * loot);
          run.spawnEggs++;
          run.fx.push(
            makeFx('text', n.x, n.y - 34, 1.4, {
              text: 'Rescued! +egg',
              vy: -12,
              color: '#7dff9a',
            }),
          );
          run.emit('levelup');
          n.state = 'flee';
          run.rescue = null;
        }
      }
      if (run.rescue) run.rescue.left -= dt;
      if (run.rescue && run.rescue.left <= 0) {
        n.state = 'flee';
        run.rescue = null;
      }
    } else if (n.kind === 'villager') {
      // Rescued or abandoned: wander off.
      moveToward(n, n.x + 80, n.y + 20, 40, dt);
    }
  }
  run.npcs = run.npcs.filter(
    (n) => !(n.state === 'flee' && Math.hypot(p.x - n.x, p.y - n.y) > 380),
  );
  if (run.npcs.every((n) => n.kind !== 'villager')) run.rescue = null;
}

/** Off-screen pointers: Charged mobs, the portal, the rescue flag and the trader. */
export interface Marker {
  x: number;
  y: number;
  color: string;
}

export function getMarkers(run: RunState): Marker[] {
  const out: Marker[] = [];
  for (const e of run.enemies)
    if (e.charged && !e.dying) out.push({ x: e.x, y: e.y, color: '#6ad0ff' });
  if (run.rescue) out.push({ x: run.rescue.x, y: run.rescue.y, color: '#ffe27a' });
  for (const n of run.npcs)
    if (n.kind === 'trader' && n.state !== 'flee') out.push({ x: n.x, y: n.y, color: '#7de8e8' });
  if (run.rift.portal) out.push({ x: run.rift.portal.x, y: run.rift.portal.y, color: '#b06bff' });
  return out;
}
