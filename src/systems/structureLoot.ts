/**
 * Applying the loot of structure chests to a run (v1.4). `data/lootTables.ts` rolls symbolic drops; this turns
 * them into emeralds, items, weapons, XP orbs... and prints one floating line per drop.
 */
import {
  chestIndexFromId,
  chestRng,
  chestTable,
  type IronResult,
  type LootDrop,
  resolveIronUpgrade,
  resolveRangedWeapon,
  rollLoot,
  type StructureChestKind,
} from '../data/lootTables';
import { ITEMS } from '../data/items';
import { makeFx } from '../entities/fx';
import { Pickup } from '../entities/pickup';
import type { RunState } from '../game';
import type { Prop } from '../world/props';
import { MAX_WEAPON_LEVEL, newWeapon, WEAPONS } from '../weapons';
import { MAX_WEAPONS } from '../data/upgrades';
import { giveItem } from './items';

export function say(
  run: RunState,
  x: number,
  y: number,
  s: string,
  color: string,
  life = 1.3,
): void {
  run.fx.push(makeFx('text', x, y - 14, life, { text: s, vy: -14, color }));
}

// ---------------------------------------------------------------------------------------------------
// Loot

/** Apply the drops of a chest to the run; each drop prints one floating line above (x, y). */
export function applyLoot(run: RunState, drops: readonly LootDrop[], x: number, y: number): void {
  let line = 0;
  const out = (s: string, color: string): void => {
    run.fx.push(makeFx('text', x, y - 14 - line * 9, 1.9, { text: s, vy: -10, color }));
    line++;
  };
  for (const d of drops) {
    switch (d.kind) {
      case 'emeralds': {
        const n = Math.round(d.n * run.mods.lootMult * run.mods.chestMult);
        run.emeraldsPicked += n;
        out(`+${n} emeralds`, '#7dff9a');
        break;
      }
      case 'spawnEgg':
        run.spawnEggs += d.n;
        run.emit('egg');
        out(d.n > 1 ? `${d.n} Spawn Eggs!` : 'Spawn Egg!', '#ff9ad0');
        break;
      case 'rareSpawnEgg':
        run.rareSpawnEggs += d.n;
        run.emit('egg');
        out('Rare Spawn Egg!', '#ffd84a');
        break;
      case 'item':
        giveItem(run, d.id);
        out(ITEMS[d.id].name, '#ffe27a');
        break;
      case 'heal':
        run.player.heal(run.player.maxHp * d.frac);
        out('Golden Apple (eaten)', '#ff8a8a');
        break;
      case 'enchantBook':
        run.bonusOffers += d.n;
        run.emit('levelup');
        out('Enchanted Book!', '#d9a6ff');
        break;
      case 'rangedWeapon':
        out(applyRangedWeapon(run, x, y), '#ffd84a');
        break;
      case 'xpBurst': {
        // Orbs worth `levels` level-ups, flung around (x, y) and pulled to the hero at once.
        const total = run.xpNeeded() * d.levels;
        const n = 8;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const orb = new Pickup('xp', x + Math.cos(a) * 9, y - 4 + Math.sin(a) * 6, total / n);
          orb.magnet = true;
          run.pickups.push(orb);
        }
        out('XP burst!', '#7ddc4a');
        break;
      }
      case 'ironUpgrade':
        out(
          applyIronUpgrade(
            run,
            resolveIronUpgrade(
              {
                swordTier: run.swordTier,
                armorTier: run.armorTier,
                weapons: run.weapons,
                maxWeaponLevel: MAX_WEAPON_LEVEL,
              },
              chestRng(run.seed, `iron|${x}|${y}`),
            ),
          ),
          '#c8d0e0',
        );
        break;
    }
  }
}

function applyIronUpgrade(run: RunState, r: IronResult): string {
  let label: string;
  switch (r.kind) {
    case 'sword':
      run.swordTier = Math.max(run.swordTier, r.tier);
      label = 'Iron sword!';
      break;
    case 'armor':
      run.armorTier = Math.max(run.armorTier, r.tier);
      run.armorProgress = 0;
      label = 'Iron armor!';
      break;
    case 'weapon': {
      const w = run.weapons[r.index];
      if (w) w.level = Math.min(MAX_WEAPON_LEVEL, w.level + 1);
      label = w ? `${WEAPONS[w.id].name} Lv ${w.level}` : 'Weapon upgrade';
      break;
    }
    default:
      run.emeraldsPicked += r.n;
      label = `+${r.n} emeralds`;
  }
  run.recomputeStats();
  return label;
}

function applyRangedWeapon(run: RunState, x: number, y: number): string {
  const r = resolveRangedWeapon(
    { weapons: run.weapons, maxWeapons: MAX_WEAPONS, maxWeaponLevel: MAX_WEAPON_LEVEL },
    chestRng(run.seed, `ranged|${x}|${y}`),
  );
  switch (r.kind) {
    case 'weapon':
      run.weapons.push(newWeapon(r.id));
      run.recomputeStats();
      return `${WEAPONS[r.id].name}!`;
    case 'upgrade': {
      const w = run.weapons[r.index];
      if (w) w.level = Math.min(MAX_WEAPON_LEVEL, w.level + 1);
      run.recomputeStats();
      return w ? `${WEAPONS[w.id].name} Lv ${w.level}` : 'Weapon upgrade';
    }
    default:
      run.emeraldsPicked += r.n;
      return `+${r.n} emeralds`;
  }
}

/** Stats event (`RunStats.struct`) a chest kind adds on top of the generic `chests` count. */
const CHEST_EVENT: Partial<Record<Prop['kind'], string>> = {
  chest_jungle: 'jungle',
  vault: 'trial',
};

/** Open a structure chest: roll its table (seeded by world seed and prop id), apply it, remove the prop. */
export function openChest(run: RunState, prop: Prop): void {
  const table = chestTable(prop.kind as StructureChestKind, chestIndexFromId(prop.id));
  const drops = rollLoot(table, chestRng(run.seed, prop.id));
  run.world.removeProp(prop);
  run.propState.delete(`${prop.id}|${prop.kind}`);
  applyLoot(run, drops, prop.x, prop.y);
  run.fx.push(makeFx('ring', prop.x, prop.y - 4, 0.35, { r: 14, color: '#ffe27a' }));
  run.emit('chest');
  run.shake = Math.max(run.shake, 1);
  run.stats.structure('chests');
  const extra = CHEST_EVENT[prop.kind];
  if (extra) run.stats.structure(extra);
}
