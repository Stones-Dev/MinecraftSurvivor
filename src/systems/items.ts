/** Item effects: passives are applied in recomputeStats/update, actives in useItem (Space). */
import { ITEMS, type ItemId } from '../data/items';
import { makeFx } from '../entities/fx';
import type { RunState } from '../game';

/** Equip an item, or queue a choice if one is already held (the screen pauses to ask). */
export function giveItem(run: RunState, id: ItemId): void {
  if (run.item === null) {
    run.item = id;
    run.itemCd = 0;
    run.recomputeStats();
  } else if (run.item !== id) {
    if (run.pendingItem === null) run.pendingItem = id;
    else run.pendingQueue.push(id);
  }
}

/** Resolve the swap prompt: keep the old item or take the new one. */
export function resolveItemChoice(run: RunState, take: boolean): void {
  if (take && run.pendingItem) {
    run.item = run.pendingItem;
    run.itemCd = 0;
    run.recomputeStats();
  }
  run.pendingItem = run.pendingQueue.shift() ?? null;
}

function floatText(run: RunState, text: string, color: string): void {
  run.fx.push(makeFx('text', run.player.x, run.player.y - 26, 0.9, { text, vy: -16, color }));
}

export function useItem(run: RunState, dirX: number, dirY: number): void {
  const id = run.item;
  const p = run.player;
  if (p.dead || run.itemCd > 0) return;
  // The Horse gives the Space key a sprint when no active item is equipped.
  if ((!id || !ITEMS[id].active) && run.loadout.allies.some((a) => a.id === 'horse')) {
    const len = Math.hypot(dirX, dirY);
    run.dash = { dx: len > 0 ? dirX / len : p.facing, dy: len > 0 ? dirY / len : 0, t: 0.3 };
    p.iframes = Math.max(p.iframes, 0.2);
    run.itemCd = 6;
    return;
  }
  if (!id || !ITEMS[id].active) return;
  switch (id) {
    case 'golden_apple':
      p.heal(p.maxHp * 0.5);
      run.absorb = 20;
      floatText(run, 'Golden Apple', '#ffe27a');
      run.item = null;
      break;
    case 'enchanted_apple':
      p.heal(p.maxHp);
      run.resistUntil = run.time + 20;
      floatText(run, 'Enchanted Apple', '#d9a6ff');
      run.item = null;
      break;
    case 'elytra': {
      const len = Math.hypot(dirX, dirY);
      const dx = len > 0 ? dirX / len : p.facing;
      const dy = len > 0 ? dirY / len : 0;
      run.dash = { dx, dy, t: 0.22 };
      p.iframes = Math.max(p.iframes, 0.3);
      run.itemCd = ITEMS.elytra.cooldown;
      break;
    }
    case 'ender_pearl': {
      const dx = run.targetX - p.x;
      const dy = run.targetY - p.y;
      const d = Math.hypot(dx, dy);
      const reach = Math.min(d, 140);
      const tx = d > 0 ? p.x + (dx / d) * reach : p.x + p.facing * 60;
      const ty = d > 0 ? p.y + (dy / d) * reach : p.y;
      const r = run.world.collide(tx, ty, p.radius, run.biome());
      run.fx.push(makeFx('ring', p.x, p.y - 8, 0.3, { r: 16, color: '#7a5cff' }));
      p.x = r.x;
      p.y = r.y;
      p.iframes = Math.max(p.iframes, 0.4);
      run.fx.push(makeFx('ring', p.x, p.y - 8, 0.3, { r: 16, color: '#7a5cff' }));
      run.itemCd = ITEMS.ender_pearl.cooldown;
      break;
    }
    default:
      break;
  }
}

/** Per-step item upkeep: cooldowns, dashes, Turtle Shell regeneration, Totem revival. */
export function updateItems(run: RunState, dt: number): void {
  const p = run.player;
  run.itemCd = Math.max(0, run.itemCd - dt);
  if (run.dash) {
    const d = run.dash;
    const step = 320 * dt;
    const r = run.world.collide(p.x + d.dx * step, p.y + d.dy * step, p.radius, run.biome());
    p.x = r.x;
    p.y = r.y;
    d.t -= dt;
    if (d.t <= 0) run.dash = null;
  }
  if (run.item === 'turtle_shell' && !p.moving && !p.dead) p.heal(1.5 * dt);
  if (run.item === 'totem' && p.dead) {
    p.dead = false;
    p.hp = p.maxHp * 0.5;
    p.iframes = 2;
    run.item = null;
    run.status = 'playing';
    floatText(run, 'Totem of Undying!', '#ffe27a');
    run.fx.push(makeFx('ring', p.x, p.y - 8, 0.6, { r: 40, color: '#ffe27a' }));
  }
}
