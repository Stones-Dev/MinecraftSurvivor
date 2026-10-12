/**
 * Hero passives as code, one kit per hero: every hero-specific rule lives here, and the systems call the hooks
 * (meta.applyLoadoutMods -> `mods`, RunState -> `onStart` / `tick`, combat -> `onHitEnemy` / `beforeHurt` /
 * `onHurt`, enemyAI -> `ignoredBy`). The texts shown to players are HeroDef.passiveName / passive.
 */
import { spawnDecoy } from '../abilities/decoys';
import type { Enemy } from '../entities/enemy';
import { makeFx } from '../entities/fx';
import type { RunState } from '../game';
import { damageEnemy } from '../systems/combat';
import { giveItem } from '../systems/items';
import type { RunLoadout } from '../systems/meta';
import { enemiesInCircle } from '../weapons/helpers';
import { MAX_WEAPON_LEVEL, newWeapon } from '../weapons';
import type { WeaponId } from '../weapons/types';
import { ITEM_IDS } from './items';
import type { Mods } from './upgrades';

export interface HeroKit {
  /** Stat changes, applied on every recompute (after the hero's base dmg / speed multipliers). */
  mods?(m: Mods, loadout: RunLoadout): void;
  /** Multiplier on the hero's base max HP (Steve's Builder's Grit). */
  hpMult?: number;
  /** Cards one armor tier costs (default 2). */
  armorCardCost?: number;
  /** XP multiplier from slimes and magma cubes (on top of the Frog pet) and how often slimes may split. */
  slimeXpMult?: number;
  maxSlimeSplit?: number;
  /** One-time run-start effects (starting weapons, items, tiers); runs before the allies' start effects. */
  onStart?(run: RunState): void;
  /** Every simulation step (also after death, like the other passives). */
  tick?(run: RunState, dt: number): void;
  /** A direct (non damage-over-time) hit of `dmg` landed on `e`. */
  onHitEnemy?(run: RunState, e: Enemy, dmg: number): void;
  /** A hit of `raw` damage is about to land (after shield blocks, before absorb/armor); return the damage to use. */
  beforeHurt?(run: RunState, raw: number, attacker: Enemy | null): number;
  /** The hero just lost `dealt` HP to a hit. */
  onHurt?(run: RunState, dealt: number, attacker: Enemy | null): void;
  /** Enemies for which this returns true neither chase nor touch the hero. */
  ignoredBy?(run: RunState, e: Enemy): boolean;
}

function addWeapon(run: RunState, id: WeaponId, level: number): void {
  const owned = run.weapons.find((w) => w.id === id);
  if (owned) owned.level = Math.max(owned.level, Math.min(MAX_WEAPON_LEVEL, level));
  else {
    const w = newWeapon(id);
    w.level = Math.min(MAX_WEAPON_LEVEL, level);
    run.weapons.push(w);
  }
}

const PIGLIN_FAMILY = new Set(['piglin', 'zombie_piglin']);
const BLINK_CHANCE = 0.15;
const WATER_DAMAGE = 1.3;
const DECOY_CHANCE = 0.2;
const MINI_BLAST_CHANCE = 0.1;
const blastHits: Enemy[] = [];
/** Re-entrancy guard: a mini explosion's own hits must not chain further mini explosions. */
let blasting = false;

export const HERO_KITS: Record<string, HeroKit> = {
  steve: {
    hpMult: 1.1,
    armorCardCost: 1,
    tick(run) {
      if (run.kitData['freeLeather'] || run.time < 60) return;
      run.kitData['freeLeather'] = 1;
      if (run.armorTier === 0) {
        run.armorTier = 1;
        run.armorProgress = 0;
        run.recomputeStats();
        run.announce("Builder's Grit: free Leather armor", '#c8a06a', 3);
      }
    },
  },
  alex: {
    mods(m) {
      m.projSpeed *= 1.15;
      m.pierce += 1;
    },
    onStart(run) {
      addWeapon(run, 'bow', 2);
    },
  },
  rana: {
    slimeXpMult: 2,
    maxSlimeSplit: 1,
    mods(m) {
      m.luck += 0.1;
      m.waterImmune = true;
    },
  },
  skeleton: {
    mods(m) {
      m.pierce += 1;
    },
    onStart(run) {
      addWeapon(run, 'bow', 3);
    },
    tick(run) {
      // Undead: poison washes off at once.
      const p = run.player;
      if (p.dotKind === 'poison' && p.dotT > 0) {
        p.dotT = 0;
        p.dotDps = 0;
      }
    },
  },
  wandering_trader: {
    mods(m) {
      m.payoutMult *= 1.25;
      m.chestMult *= 1.25;
    },
    onStart(run) {
      giveItem(run, run.rng.drops.pick(ITEM_IDS));
    },
  },
  village_smith: {
    mods(m) {
      m.swordMult *= 1.2;
      m.armor += 2;
    },
    onStart(run) {
      run.swordTier = Math.max(run.swordTier, 2);
    },
  },
  enderman: {
    beforeHurt(run, raw) {
      const p = run.player;
      if (run.rng.ai.chance(BLINK_CHANCE)) {
        // Phase Step: blink a short hop away instead of taking the hit.
        const a = run.rng.ai.range(0, Math.PI * 2);
        run.fx.push(makeFx('ring', p.x, p.y - 12, 0.3, { r: 14, color: '#b06bff' }));
        const c = run.world.collide(
          p.x + Math.cos(a) * 34,
          p.y + Math.sin(a) * 26,
          p.radius,
          run.biome(),
        );
        p.x = c.x;
        p.y = c.y;
        p.snap();
        p.iframes = Math.max(p.iframes, 0.5);
        run.fx.push(makeFx('ring', p.x, p.y - 12, 0.3, { r: 14, color: '#b06bff' }));
        run.fx.push(
          makeFx('text', p.x, p.y - 30, 0.6, { text: 'Blink', vy: -16, color: '#d9a6ff' }),
        );
        return 0;
      }
      return run.world.surface(p.x, p.y, run.biome()) === 'water' ? raw * WATER_DAMAGE : raw;
    },
  },
  witch: {
    mods(m) {
      m.potionArea *= 1.3;
    },
    onStart(run) {
      addWeapon(run, run.rng.drops.chance(0.5) ? 'poison' : 'harming', 1);
    },
  },
  illusioner: {
    mods(m) {
      m.speed *= 1.1;
    },
    onHurt(run) {
      if (!run.rng.ai.chance(DECOY_CHANCE)) return;
      const p = run.player;
      spawnDecoy(run, p.x - p.facing * 12, p.y + 2, 1.5, 110, 0);
    },
  },
  piglin: {
    mods(m) {
      m.luck += 0.15;
      m.healOnKill += 1;
    },
    ignoredBy(_run, e) {
      return PIGLIN_FAMILY.has(e.def.id) && !e.boss && !e.riftFoe;
    },
  },
  creeper: {
    mods(m) {
      m.explosionResist += 0.5;
    },
    onHitEnemy(run, e, dmg) {
      if (blasting || !run.rng.ai.chance(MINI_BLAST_CHANCE)) return;
      blasting = true;
      const r = 26 * run.mods.area;
      const blast = Math.max(4, dmg * 0.6);
      run.fx.push(makeFx('ring', e.x, e.y - 4, 0.3, { r, color: '#7dff6a' }));
      run.fx.push(makeFx('ring', e.x, e.y - 4, 0.25, { r: r * 0.6, color: '#ffffff' }));
      enemiesInCircle(run, e.x, e.y, r, blastHits);
      for (const o of blastHits) if (o !== e) damageEnemy(run, o, blast, e.x, e.y, 70);
      run.shake = Math.max(run.shake, 1.5);
      run.emit('explode');
      blasting = false;
    },
  },
};

const NO_KIT: HeroKit = {};

export function kitOf(heroId: string): HeroKit {
  return HERO_KITS[heroId] ?? NO_KIT;
}
