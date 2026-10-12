import { describe, expect, it } from 'vitest';
import { abilityText } from '../src/abilities';
import type { InputSource } from '../src/core/input';
import { defaultSave } from '../src/core/save';
import { HEROES } from '../src/data/companions';
import { HERO_KITS, kitOf } from '../src/data/heroKits';
import { baseMods } from '../src/data/upgrades';
import { RunState } from '../src/game';
import { hurtPlayer } from '../src/systems/combat';
import {
  abilityRank,
  applyLoadoutMods,
  defaultLoadout,
  heroBaseHp,
  loadoutFromSave,
  type RunLoadout,
} from '../src/systems/meta';
import { makeEnemy } from '../src/systems/spawner';
import { damageEnemy } from '../src/systems/combat';

const idle: InputSource = {
  moveVector: () => ({ x: 0, y: 0 }),
  pausePressed: () => false,
  confirmPressed: () => false,
  cancelPressed: () => false,
  activePressed: () => false,
  endStep() {},
};

const as = (hero: string, patch: Partial<RunLoadout> = {}): RunState =>
  new RunState(7, 0, { ...defaultLoadout(), hero, ...patch });

function step(run: RunState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) run.update(1 / 60, idle);
}

describe('hero roster', () => {
  it('has 11 heroes, each with its own ability and a kit for every new hero', () => {
    expect(HEROES).toHaveLength(11);
    expect(new Set(HEROES.map((h) => h.ability)).size).toBe(HEROES.length);
    for (const h of HEROES) {
      expect(h.passive.length).toBeGreaterThan(20);
      expect(h.quip.length).toBeGreaterThan(10);
      expect(HERO_KITS[h.id]).toBeDefined();
      expect(['uncommon', 'rare', 'epic', 'legendary', 'common']).toContain(h.rarity);
    }
    const sprite = HEROES.filter((h) => h.render === 'sprite');
    expect(sprite).toHaveLength(8);
    expect(kitOf('nobody')).toEqual({});
  });
});

describe('hero kits', () => {
  it('Skeleton: Bow level 3, +1 pierce and poison washes off', () => {
    const run = as('skeleton');
    expect(run.weapons.find((w) => w.id === 'bow')?.level).toBe(3);
    expect(run.mods.pierce).toBe(1);
    expect(run.player.maxHp).toBe(75);
    run.player.dotKind = 'poison';
    run.player.dotT = 3;
    run.player.dotDps = 4;
    step(run, 0.05);
    expect(run.player.dotT).toBe(0);
  });

  it('Wandering Trader: better payout and chests, starts with an item', () => {
    const run = as('wandering_trader');
    expect(run.mods.payoutMult).toBeCloseTo(1.25);
    expect(run.mods.chestMult).toBeCloseTo(1.25);
    expect(run.item).not.toBeNull();
  });

  it('Village Smith: Iron sword tier, +20% sword damage and +2 armor', () => {
    const run = as('village_smith');
    expect(run.swordTier).toBeGreaterThanOrEqual(2);
    expect(run.mods.swordMult).toBeCloseTo(1.2);
    expect(run.mods.armor).toBeGreaterThanOrEqual(2);
  });

  it('Enderman: blinks out of about 15% of hits', () => {
    const run = as('enderman', {});
    run.player.maxHp = run.player.hp = 1e6;
    let dodged = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      run.player.iframes = 0;
      run.player.x = 0;
      run.player.y = 0;
      if (hurtPlayer(run, 5) === 0) dodged++;
    }
    expect(dodged / n).toBeGreaterThan(0.08);
    expect(dodged / n).toBeLessThan(0.24);
  });

  it('Witch: potion weapons +30% area and a starting potion weapon', () => {
    const run = as('witch');
    expect(run.mods.potionArea).toBeCloseTo(1.3);
    expect(run.weapons.some((w) => w.id === 'poison' || w.id === 'harming')).toBe(true);
  });

  it('Illusioner: +10% speed and some hits leave a decoy', () => {
    const run = as('illusioner');
    expect(run.mods.speed).toBeCloseTo(1.1);
    run.player.maxHp = run.player.hp = 1e6;
    let spawned = 0;
    for (let i = 0; i < 60; i++) {
      run.player.iframes = 0;
      run.decoys = [];
      hurtPlayer(run, 3);
      spawned += run.decoys.length;
    }
    expect(spawned).toBeGreaterThan(3);
    expect(spawned).toBeLessThan(30);
  });

  it('Piglin: luck, heal on kill, and piglins leave him alone (zombies do not)', () => {
    const run = as('piglin');
    expect(run.mods.luck).toBeCloseTo(0.15);
    expect(run.mods.healOnKill).toBe(1);
    run.weapons = [];
    const piglin = makeEnemy(run, 'piglin', 4, 0, false);
    if (!piglin) throw new Error('no piglin');
    run.enemies = [piglin];
    const hp = run.player.hp;
    step(run, 3);
    expect(run.player.hp).toBeGreaterThanOrEqual(hp);
    const zombie = makeEnemy(run, 'zombie', 4, 0, false);
    if (!zombie) throw new Error('no zombie');
    run.enemies = [zombie];
    step(run, 3);
    expect(run.player.hp).toBeLessThan(hp);
    expect(kitOf('steve').ignoredBy).toBeUndefined();
  });

  it('Creeper: halves explosion damage and some hits set off mini explosions', () => {
    const run = as('creeper');
    expect(run.mods.explosionResist).toBeCloseTo(0.5);
    run.weapons = [];
    const target = makeEnemy(run, 'zombie', 60, 0, false);
    const by = makeEnemy(run, 'zombie', 70, 0, false);
    if (!target || !by) throw new Error('no zombies');
    target.maxHp = target.hp = 1e6;
    by.maxHp = by.hp = 1e6;
    run.enemies = [target, by];
    step(run, 1 / 60);
    for (let i = 0; i < 80; i++) damageEnemy(run, target, 5, 0, 0, 0);
    expect(by.hp).toBeLessThan(1e6);
  });
});

describe('Steve, Alex and Rana behave as before through their kits', () => {
  it('keeps their numbers', () => {
    expect(heroBaseHp('steve')).toBe(110);
    expect(as('steve').armorCardCost()).toBe(2 - 1);
    expect(as('rana').armorCardCost()).toBe(2);
    expect(kitOf('rana').maxSlimeSplit).toBe(1);
    expect(as('alex').weapons.find((w) => w.id === 'bow')?.level).toBe(2);
  });
});

describe('ability ranks from hero shards', () => {
  it('rank = 1 + floor(shards / 5), capped at 5', () => {
    expect(abilityRank(0)).toBe(1);
    expect(abilityRank(4)).toBe(1);
    expect(abilityRank(5)).toBe(2);
    expect(abilityRank(14)).toBe(3);
    expect(abilityRank(999)).toBe(5);
  });

  it('each rank above 1 adds +8% power and -4% cooldown', () => {
    const m = baseMods();
    applyLoadoutMods({ ...defaultLoadout(), heroShards: 12 }, m);
    expect(m.abilityPower).toBeCloseTo(1.16);
    expect(m.abilityCd).toBeCloseTo(0.92);
    const top = baseMods();
    applyLoadoutMods({ ...defaultLoadout(), heroShards: 500 }, top);
    expect(top.abilityPower).toBeCloseTo(1.32);
    expect(top.abilityCd).toBeCloseTo(0.84);
  });

  it('loadoutFromSave reads the equipped hero shards', () => {
    const s = defaultSave();
    s.owned['witch'] = { level: 3, shards: 11, obtainedAt: 0 };
    s.loadout.hero = 'witch';
    const l = loadoutFromSave(s);
    expect(l.hero).toBe('witch');
    expect(l.heroShards).toBe(11);
    expect(new RunState(1, 0, l).mods.abilityPower).toBeCloseTo(1.16);
  });

  it('abilityText names the ability and its rank bonus', () => {
    const t = abilityText('enderman', 3);
    expect(t.name).toBe('Blink');
    expect(t.blurb.length).toBeGreaterThan(20);
    expect(t.bonus).toBe('Rank 3: +16% power, -8% cooldown');
    expect(t.cooldown).toBeCloseTo(9.2);
    expect(abilityText('steve', 1).bonus).toBe('Rank 1');
    expect(abilityText('creeper', 9).rank).toBe(5);
  });
});
