/**
 * World interactables and hazards (BRIEF section 8): ores and chests, locked chests, melons and
 * pumpkins, beacons, campfires, anvils, enchanting tables, traps, lava, cobwebs and magma.
 */
import { ITEM_IDS } from '../data/items';
import { BIOMES } from '../world/biomes';
import { makeFx } from '../entities/fx';
import { Pickup } from '../entities/pickup';
import type { Prop } from '../world/props';
import { ORE_TYPES, propType } from '../world/props';
import type { RunState } from '../game';
import { explode } from './combat';
import { giveItem } from './items';
import { gainXp, openNextOffer } from './levelup';
import { applyStatus } from './status';

export interface PropState {
  /** Hit points (ores, melons) or charge seconds (campfire). */
  hp: number;
  /** Progress or recharge timer. */
  t: number;
  /** Seconds until the next touch-hit may land. */
  cool: number;
}

const HERO_REACH = 6;

/** Max hit points of breakable props. */
const BREAKABLE: Partial<Record<Prop['kind'], number>> = { ore: 3, melon: 1, pumpkin: 1, chest: 1 };

function stateOf(run: RunState, p: Prop): PropState {
  const key = `${p.id}|${p.kind}`;
  let st = run.propState.get(key);
  if (!st) {
    st = { hp: BREAKABLE[p.kind] ?? (p.kind === 'campfire' ? 8 : 0), t: 0, cool: 0 };
    run.propState.set(key, st);
  }
  return st;
}

export function propStateOf(run: RunState, p: Prop): PropState | undefined {
  return run.propState.get(`${p.id}|${p.kind}`);
}

function text(run: RunState, x: number, y: number, s: string, color: string): void {
  run.fx.push(makeFx('text', x, y - 14, 0.9, { text: s, vy: -16, color }));
}

function reward(run: RunState, p: Prop): void {
  const luck = 1 + run.mods.luck;
  const loot = run.mods.lootMult;
  switch (p.kind) {
    case 'ore': {
      const type = ORE_TYPES[propType(p)] ?? 'coal';
      if (type === 'coal') {
        for (let i = 0; i < 3; i++) run.pickups.push(new Pickup('xp', p.x + i * 3 - 3, p.y, 2));
        text(run, p.x, p.y, 'Coal', '#cfcfd8');
      } else if (type === 'iron' || type === 'gold') {
        const n = Math.round((type === 'iron' ? 2 : 4) * loot);
        run.emeraldsPicked += n;
        text(run, p.x, p.y, `+${n} emeralds`, '#7dff9a');
      } else if (type === 'lapis') {
        run.addBuff('lapis', 20);
        text(run, p.x, p.y, 'Luck pulse!', '#6aa0ff');
      } else if (type === 'redstone') {
        run.addBuff('redstone', 10);
        text(run, p.x, p.y, 'Haste!', '#ff6a6a');
      } else {
        run.emeraldsPicked += Math.round(6 * loot);
        if (run.rng.drops.chance(0.05 * luck)) {
          run.rareSpawnEggs++;
          text(run, p.x, p.y - 8, 'Rare Spawn Egg!', '#ffd84a');
        }
        text(run, p.x, p.y, 'Diamond!', '#7de8e8');
      }
      break;
    }
    case 'chest': {
      const n = Math.round(run.rng.drops.range(4, 10) * loot);
      run.emeraldsPicked += n;
      text(run, p.x, p.y, `+${n} emeralds`, '#7dff9a');
      if (run.rng.drops.chance(0.08 * luck)) giveItem(run, run.rng.drops.pick(ITEM_IDS));
      break;
    }
    case 'locked_chest': {
      const n = Math.round(run.rng.drops.range(15, 30) * loot);
      run.emeraldsPicked += n;
      const eggs = 1 + run.rng.drops.int(3);
      run.spawnEggs += eggs;
      if (run.rng.drops.chance(0.15 * luck)) run.rareSpawnEggs++;
      text(run, p.x, p.y, `+${n} emeralds, ${eggs} eggs`, '#ffd84a');
      gainXp(run, run.xpNeeded());
      break;
    }
    case 'melon':
    case 'pumpkin':
      run.player.heal(6);
      text(run, p.x, p.y, '+6 HP', '#ff8a8a');
      break;
    default:
      break;
  }
  run.fx.push(makeFx('ring', p.x, p.y - 4, 0.3, { r: 12, color: '#ffe27a' }));
  run.emit('emerald');
}

function breakProp(run: RunState, p: Prop): void {
  run.world.removeProp(p);
  run.propState.delete(`${p.id}|${p.kind}`);
  reward(run, p);
}

function hitProp(run: RunState, p: Prop, st: PropState): void {
  st.hp -= 1;
  run.fx.push(makeFx('spark', p.x, p.y - 6, 0.25, { vx: 20, vy: -30, color: '#d8d8e0' }));
  if (st.hp <= 0) breakProp(run, p);
}

/** Per-step interactions around the hero, plus hazards for the hero and for enemies. */
export function updateInteract(run: RunState, dt: number): void {
  const p = run.player;
  if (run.offer === null && run.bonusOffers > 0) openNextOffer(run);
  const biome = run.biome();
  const b = BIOMES[biome];
  p.envMult = b.snow && run.mods.frost <= 0 ? 0.9 : 1;
  if (
    run.mods.lavaSpeed > 0 &&
    (run.rift.active || run.world.surface(p.x, p.y, biome) === 'lava')
  ) {
    p.envMult *= 1 + run.mods.lavaSpeed;
  }
  if (p.dead) return;
  const props = run.world.propsInRect(p.x - 40, p.y - 40, p.x + 40, p.y + 40, biome);
  const hits = run.hitPoints;
  for (const prop of props) {
    const d = Math.hypot(prop.x - p.x, prop.y - p.y);
    const touch = d < prop.radius + p.radius + HERO_REACH;
    switch (prop.kind) {
      case 'ore':
      case 'melon':
      case 'pumpkin':
      case 'chest': {
        const st = stateOf(run, prop);
        st.cool -= dt;
        let struck = false;
        for (let i = 0; i < hits.length; i += 2) {
          if (Math.hypot((hits[i] ?? 0) - prop.x, (hits[i + 1] ?? 0) - prop.y) < 26) struck = true;
        }
        if ((touch || struck) && st.cool <= 0) {
          st.cool = prop.kind === 'chest' ? 0 : 0.4;
          hitProp(run, prop, st);
        }
        break;
      }
      case 'locked_chest': {
        const st = stateOf(run, prop);
        if (d < 22) st.t += dt;
        else st.t = Math.max(0, st.t - dt * 2);
        if (st.t >= 3.5) breakProp(run, prop);
        break;
      }
      case 'beacon':
        if (d < 14) {
          const kind = run.rng.drops.pick(['strength', 'speed', 'magnet', 'haste'] as const);
          run.addBuff(kind, 25);
          text(run, prop.x, prop.y, `Beacon: ${kind}`, '#7de8e8');
          run.world.removeProp(prop);
          run.emit('levelup');
        }
        break;
      case 'campfire': {
        const st = stateOf(run, prop);
        if (st.hp <= 0) {
          st.t -= dt;
          if (st.t <= 0) st.hp = 8;
        } else if (d < 22 && p.hp < p.maxHp) {
          p.heal(4 * dt);
          st.hp -= dt;
          if (st.hp <= 0) st.t = 45;
        }
        break;
      }
      case 'anvil':
        if (d < 14 && (run.armorTier < 7 || run.swordTier < 6)) {
          const armor = run.armorTier < 7;
          const sword = run.swordTier < 6;
          const pickArmor = armor && (!sword || run.rng.drops.chance(0.5));
          if (pickArmor) run.armorTier++;
          else if (sword) run.swordTier++;
          run.recomputeStats();
          text(run, prop.x, prop.y, pickArmor ? 'Armor upgraded!' : 'Sword upgraded!', '#ffd84a');
          run.world.removeProp(prop);
          run.emit('levelup');
        }
        break;
      case 'enchant_table':
        if (d < 14) {
          run.bonusOffers++;
          run.world.removeProp(prop);
          run.emit('levelup');
        }
        break;
      case 'cobweb':
        if (d < 12) p.envMult *= 0.4;
        break;
      case 'magma':
        if (d < 8 && run.item !== 'fire_potion' && p.dotT < 1) burnHero(run);
        break;
      default:
        break;
    }
  }
  // Traps and ground hazards that also affect enemies.
  run.hazardT -= dt;
  if (run.hazardT <= 0) {
    run.hazardT = 0.3;
    run.hazards = run.world
      .propsInRect(p.x - 300, p.y - 220, p.x + 300, p.y + 220, biome)
      .filter((q) => q.kind === 'tnt_trap' || q.kind === 'cobweb' || q.kind === 'magma');
  }
  for (const prop of run.hazards) {
    if (run.world.isRemoved(prop)) continue;
    if (prop.kind === 'tnt_trap') {
      const trigger =
        Math.hypot(prop.x - p.x, prop.y - p.y) < 12 ||
        run.enemies.some(
          (e) => !e.dying && !e.def.flying && Math.hypot(prop.x - e.x, prop.y - e.y) < 12,
        );
      if (trigger) {
        run.world.removeProp(prop);
        explode(run, prop.x, prop.y, 44, 40, 40, null);
      }
    } else if (prop.kind === 'cobweb' || prop.kind === 'magma') {
      for (const e of run.enemies) {
        if (e.dying || e.def.flying || Math.hypot(prop.x - e.x, prop.y - e.y) > 11) continue;
        if (prop.kind === 'cobweb') applyStatus(e, 'slow', 0.3, 0.4);
        else applyStatus(e, 'burn', 1.5, 4);
      }
    }
  }
  run.hitPoints.length = 0;

  // Lava burns anyone standing in it.
  run.lavaT -= dt;
  if (b.lava && run.lavaT <= 0) {
    run.lavaT = 0.25;
    if (run.world.surface(p.x, p.y, biome) === 'lava' && run.item !== 'fire_potion') burnHero(run);
    for (const e of run.enemies) {
      if (!e.dying && !e.def.flying && run.world.surface(e.x, e.y, biome) === 'lava')
        applyStatus(e, 'burn', 2, 6);
    }
  }
}

function burnHero(run: RunState): void {
  if (run.mods.lavaImmune) return;
  const p = run.player;
  p.dotKind = 'burn';
  p.dotT = Math.max(p.dotT, 2.5);
  p.dotDps = Math.max(p.dotDps, 6);
}
