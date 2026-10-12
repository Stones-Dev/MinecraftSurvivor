import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { InputSource } from '../src/core/input';
import {
  ALLIES,
  COMPANIONS,
  PETS,
  RARITY_ORDER,
  type AllyDef,
  type PetDef,
} from '../src/data/companions';
import { baseMods, type Mods } from '../src/data/upgrades';
import type { Enemy } from '../src/entities/enemy';
import { Pickup } from '../src/entities/pickup';
import { Projectile } from '../src/entities/projectile';
import { RunState } from '../src/game';
import { tauntTarget } from '../src/systems/allies';
import { damageEnemy, hurtPlayer, killEnemy } from '../src/systems/combat';
import { OVERWORLD_BANNER } from '../src/systems/gacha';
import { defaultLoadout, type RunLoadout } from '../src/systems/meta';
import { makeEnemy } from '../src/systems/spawner';

const idle: InputSource = {
  moveVector: () => ({ x: 0, y: 0 }),
  pausePressed: () => false,
  confirmPressed: () => false,
  cancelPressed: () => false,
  activePressed: () => false,
  endStep() {},
};

const NEW_PETS = [
  'duck',
  'moobloom',
  'arctic_fox',
  'toast',
  'pufferfish',
  'polar_bear',
  'toucan',
  'magma_cow',
  'ocelot',
  'mooshroom',
  'piggy_bank',
  'golden_monkey',
  'bat',
  'glare',
  'wisp',
];
const NEW_ALLIES = [
  'mini_golem',
  'butcher',
  'leatherworker',
  'goat',
  'black_cat',
  'melon_golem',
  'fisherman',
  'copper_golem',
  'shepherd',
  'love_golem',
  'furnace_golem',
  'soul_wizard',
];
const NEW_FIELDS: (keyof Mods)[] = [
  'chillDmg',
  'eliteXp',
  'fireResist',
  'critChance',
  'stewHeal',
  'chestEggs',
  'dodge',
  'nightBoost',
  'bossDmg',
  'revive',
];

const withLoadout = (patch: Partial<RunLoadout>): RunLoadout => ({ ...defaultLoadout(), ...patch });
const petRun = (id: string, level = 5, seed = 1): RunState =>
  new RunState(seed, 0, withLoadout({ pet: { id, level } }));

function step(run: RunState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    run.update(1 / 60, idle);
    if (run.offer) run.offer = null;
  }
}

function enemyAt(run: RunState, id: string, dx: number, dy: number, elite = false): Enemy {
  const e = makeEnemy(run, id, run.player.x + dx, run.player.y + dy, elite);
  if (!e) throw new Error(`no ${id}`);
  e.x = run.player.x + dx;
  e.y = run.player.y + dy;
  run.enemies.push(e);
  run.hash.insert(e);
  return e;
}

const atlas = JSON.parse(
  readFileSync(new URL('../public/atlas/atlas.json', import.meta.url), 'utf8'),
) as { anims: Record<string, { frames: string[] }> };

describe('new companions: data', () => {
  it('reaches 30 pets and 22 allies with unique ids', () => {
    expect(PETS.length).toBeGreaterThanOrEqual(30);
    expect(ALLIES.length).toBeGreaterThanOrEqual(22);
    expect(new Set(COMPANIONS.map((c) => c.id)).size).toBe(COMPANIONS.length);
    for (const id of NEW_PETS) expect(PETS.some((p) => p.id === id)).toBe(true);
    for (const id of NEW_ALLIES) expect(ALLIES.some((a) => a.id === id)).toBe(true);
  });

  it('has at least 3 companions of every rarity in the Spawner pool', () => {
    for (const r of RARITY_ORDER) expect(OVERWORLD_BANNER.pool[r].length).toBeGreaterThanOrEqual(3);
    // The new ones alone span all five tiers.
    const fresh = COMPANIONS.filter((c) => NEW_PETS.includes(c.id) || NEW_ALLIES.includes(c.id));
    for (const r of RARITY_ORDER) expect(fresh.some((c) => c.rarity === r)).toBe(true);
  });

  it('every pet and ally has a distinct effect/role and shipped animations', () => {
    expect(new Set(PETS.map((p) => p.effect)).size).toBe(PETS.length);
    expect(new Set(ALLIES.map((a) => a.role)).size).toBe(ALLIES.length);
    for (const c of [...PETS, ...ALLIES] as (PetDef | AllyDef)[]) {
      const anims = ['idle', 'walk', 'flying'].filter((a) => atlas.anims[`${c.sprite}.${a}`]);
      expect(anims.length, c.id).toBeGreaterThan(0);
      for (const a of anims)
        expect(atlas.anims[`${c.sprite}.${a}`]?.frames.length).toBeGreaterThan(0);
      expect(c.quip.length).toBeGreaterThan(10);
    }
  });

  it('every pet changes the run modifiers, scaling with level', () => {
    const base = JSON.stringify(new RunState(1).mods);
    for (const p of PETS) {
      const lo = new RunState(1, 0, withLoadout({ pet: { id: p.id, level: 1 } }));
      expect(JSON.stringify(lo.mods), p.id).not.toBe(base);
      expect(p.values[4]).toBeGreaterThan(p.values[0]);
    }
    // Spot-check numbers and the Kennel bonus.
    expect(petRun('ocelot').mods.critChance).toBeCloseTo(0.15);
    expect(petRun('golden_monkey').mods.dodge).toBeCloseTo(0.15);
    expect(petRun('polar_bear').mods.frost).toBe(36);
    expect(petRun('pufferfish').mods.thorns).toBeCloseTo(0.75);
    const kennel = new RunState(1, 0, withLoadout({ pet: { id: 'glare', level: 1 }, kennel: 5 }));
    expect(kennel.mods.bossDmg).toBeCloseTo(0.15 * 1.5);
    expect(petRun('wisp').mods.revive).toBeCloseTo(0.75);
  });

  it('adds Mods fields with neutral defaults', () => {
    const m = baseMods();
    for (const f of NEW_FIELDS) expect(m[f]).toBe(0);
  });
});

describe('new pet effects are read by the game', () => {
  it('Ocelot crits double a hit (critChance)', () => {
    const run = new RunState(2);
    const e = enemyAt(run, 'zombie', 60, 0);
    e.hp = e.maxHp = 1000;
    damageEnemy(run, e, 10, run.player.x, run.player.y, 0);
    expect(1000 - e.hp).toBeCloseTo(10);
    run.mods.critChance = 1;
    damageEnemy(run, e, 10, run.player.x, run.player.y, 0);
    expect(1000 - e.hp).toBeCloseTo(30);
    expect(run.fx.some((f) => f.text === '20!')).toBe(true);
  });

  it('Arctic Fox hits chilled enemies harder (chillDmg)', () => {
    const run = petRun('arctic_fox');
    const e = enemyAt(run, 'zombie', 60, 0);
    e.hp = e.maxHp = 1000;
    damageEnemy(run, e, 10, run.player.x, run.player.y, 0, true);
    expect(1000 - e.hp).toBeCloseTo(10);
    e.slowT = 1;
    damageEnemy(run, e, 10, run.player.x, run.player.y, 0, true);
    expect(1000 - e.hp).toBeCloseTo(10 + 10 * 1.26);
  });

  it('Glare hits elites harder and they drop an Emerald (bossDmg)', () => {
    const run = petRun('glare');
    const e = enemyAt(run, 'zombie', 60, 0, true);
    e.hp = e.maxHp = 1000;
    damageEnemy(run, e, 10, run.player.x, run.player.y, 0, true);
    expect(1000 - e.hp).toBeCloseTo(14);
    const before = run.pickups.filter((p) => p.kind === 'emerald').length;
    killEnemy(run, e, true);
    expect(run.pickups.filter((p) => p.kind === 'emerald').length).toBeGreaterThan(before);
  });

  it('Toucan gives more XP for elites (eliteXp)', () => {
    const xpOf = (run: RunState): number => {
      const e = enemyAt(run, 'zombie', 60, 0, true);
      killEnemy(run, e, true);
      return run.pickups.filter((p) => p.kind === 'xp').reduce((s, p) => s + p.value, 0);
    };
    expect(xpOf(petRun('toucan'))).toBeCloseTo(xpOf(new RunState(1)) * 1.7);
  });

  it('Bat: more damage and speed at night only (nightBoost)', () => {
    const day = petRun('bat', 5, 1);
    const night = new RunState(1, 230, withLoadout({ pet: { id: 'bat', level: 5 } }));
    const lost = [day, night].map((run) => {
      const e = enemyAt(run, 'zombie', 60, 0);
      e.hp = e.maxHp = 1000;
      damageEnemy(run, e, 10, run.player.x, run.player.y, 0, true);
      run.update(1 / 60, idle);
      return 1000 - e.hp;
    });
    expect(lost[0]).toBeCloseTo(10);
    expect(lost[1]).toBeCloseTo(12.5);
    // A second step: run-start events (Steve's free Leather at minute 1) may rebuild the stats once.
    night.update(1 / 60, idle);
    day.update(1 / 60, idle);
    expect(night.player.speedMult).toBeCloseTo(night.mods.speed * 1.25);
    expect(day.player.speedMult).toBeCloseTo(day.mods.speed);
  });

  it('Golden Monkey dodges hits (dodge)', () => {
    const run = new RunState(3);
    run.mods.dodge = 1;
    const hp = run.player.hp;
    expect(hurtPlayer(run, 30)).toBe(0);
    expect(run.player.hp).toBe(hp);
    run.player.iframes = 0;
    run.mods.dodge = 0;
    expect(hurtPlayer(run, 30)).toBeGreaterThan(0);
  });

  it('Magma Cow cuts burning and fireball damage (fireResist)', () => {
    const burnLoss = (run: RunState): number => {
      run.player.maxHp = run.player.hp = 1000;
      run.player.regen = 0;
      run.mods.regen = 0;
      run.player.dotKind = 'burn';
      run.player.dotT = 2;
      run.player.dotDps = 20;
      const before = run.player.hp;
      run.update(1 / 60, idle);
      for (let i = 0; i < 59; i++) run.update(1 / 60, idle);
      return before - run.player.hp;
    };
    const plain = burnLoss(new RunState(4));
    const cow = burnLoss(new RunState(4, 0, withLoadout({ pet: { id: 'magma_cow', level: 5 } })));
    expect(cow).toBeLessThan(plain * 0.5);
    const fireball = (run: RunState): number => {
      const p = run.player;
      p.maxHp = p.hp = 1000;
      const pr = new Projectile(p.x - 10, p.y - 6, 300, 0, 3, 40, 0, false, 1);
      pr.style = 'fireball';
      run.projectiles.push(pr);
      const before = p.hp;
      run.update(1 / 60, idle);
      return before - p.hp;
    };
    const f0 = fireball(new RunState(4));
    const f1 = fireball(new RunState(4, 0, withLoadout({ pet: { id: 'magma_cow', level: 5 } })));
    expect(f0).toBeGreaterThan(0);
    expect(f1).toBeLessThan(f0 * 0.6);
  });

  it('Mooshroom serves a stew at low HP, then waits (stewHeal)', () => {
    const run = petRun('mooshroom');
    const p = run.player;
    p.hp = p.maxHp * 0.2;
    run.update(1 / 60, idle);
    expect(p.hp).toBeGreaterThan(p.maxHp * 0.5);
    p.hp = p.maxHp * 0.2;
    run.update(1 / 60, idle);
    expect(p.hp).toBeLessThan(p.maxHp * 0.3);
  });

  it('Wisp revives the hero once per run (revive)', () => {
    const run = petRun('wisp');
    const p = run.player;
    p.hp = 0;
    p.dead = true;
    run.update(1 / 60, idle);
    expect(p.dead).toBe(false);
    expect(run.status).toBe('playing');
    expect(p.hp).toBeGreaterThan(p.maxHp * 0.74);
    expect(p.hp).toBeLessThan(p.maxHp * 0.8);
    p.hp = 0;
    p.dead = true;
    run.update(1 / 60, idle);
    expect(run.status).toBe('dead');
  });

  it('Piggy Bank: chests can hold Spawn Eggs (chestEggs)', () => {
    const run = new RunState(13, 10);
    const chest = run.world
      .propsInRect(-3000, -3000, 3000, 3000, 'plains')
      .find((pr) => pr.kind === 'chest' && Math.hypot(pr.x, pr.y) > 150);
    if (!chest) throw new Error('no chest');
    run.mods.chestEggs = 1;
    // Keep the field through stat rebuilds by giving the hero the pet as well.
    (run.loadout as RunLoadout).pet = { id: 'piggy_bank', level: 5 };
    run.recomputeStats();
    run.mods.chestEggs = 1;
    run.player.x = chest.x;
    run.player.y = chest.y + 2;
    const eggs = run.spawnEggs;
    step(run, 0.5);
    expect(run.world.isRemoved(chest)).toBe(true);
    expect(run.spawnEggs).toBeGreaterThan(eggs);
  });
});

describe('new allies in a run', () => {
  const attackers = [
    'mini_golem',
    'butcher',
    'goat',
    'black_cat',
    'melon_golem',
    'copper_golem',
    'furnace_golem',
    'soul_wizard',
  ];

  for (const id of NEW_ALLIES) {
    it(`${id} runs 20 s without NaN and does its job`, () => {
      const run = new RunState(21, 0, withLoadout({ allies: [{ id, level: 3 }] }));
      run.weapons = [];
      const p = run.player;
      p.maxHp = p.hp = 99999;
      const ally = run.allies[0];
      if (!ally) throw new Error('no ally');
      const foes: Enemy[] = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const e = enemyAt(run, 'zombie', Math.cos(a) * (50 + (i % 4) * 20), Math.sin(a) * 60);
        e.hp = e.maxHp = id === 'butcher' ? 40 : 400;
        foes.push(e);
      }
      const probe = makeEnemy(run, 'zombie', 0, 0, false);
      if (!probe) throw new Error('no probe');
      for (let i = 0; i < 6; i++) run.pickups.push(new Pickup('xp', p.x + 150, p.y + i * 10, 1));
      const seen = { line: false, circle: false, burn: false, stun: false, decoy: false, heal: 0 };
      let absorbMax = 0;
      let hpLow = p.hp;
      for (let i = 0; i < 20 * 60; i++) {
        if (id === 'butcher' || id === 'love_golem') {
          // Keep the hero hurt so heals show up; regen is switched off.
          p.regen = 0;
          if (p.hp > 50000) p.hp = 50000;
          hpLow = Math.min(hpLow, p.hp);
        }
        run.update(1 / 60, idle);
        if (run.offer) run.offer = null;
        for (const t of run.telegraphs) {
          if (t.friendly && t.kind === 'line') seen.line = true;
          if (t.friendly && t.kind === 'circle') seen.circle = true;
        }
        for (const e of foes) {
          if (e.burnT > 0) seen.burn = true;
          if (e.stunT > 0) seen.stun = true;
        }
        if (ally.decoy.t > 0) {
          seen.decoy = true;
          probe.x = ally.decoy.x + 10;
          probe.y = ally.decoy.y;
          expect(tauntTarget(run, probe)).toBe(ally.decoy);
        }
        absorbMax = Math.max(absorbMax, run.absorb);
        for (const f of run.fx) if (f.text === '+' || f.text === '<3') seen.heal++;
      }
      expect(Number.isFinite(ally.x + ally.y + ally.hp)).toBe(true);
      const dealt = foes.reduce((s, e) => s + (e.maxHp - Math.max(0, e.hp)), 0);
      if (attackers.includes(id)) expect(dealt, id).toBeGreaterThan(0);
      else expect(dealt, id).toBe(0);
      if (id === 'goat') expect(seen.line).toBe(true);
      if (id === 'copper_golem') expect(seen.circle && seen.stun).toBe(true);
      if (id === 'furnace_golem') expect(seen.burn).toBe(true);
      if (id === 'love_golem') expect(seen.stun && seen.heal > 0).toBe(true);
      if (id === 'butcher') expect(seen.heal).toBeGreaterThan(0);
      if (id === 'leatherworker') expect(absorbMax).toBeGreaterThanOrEqual(8);
      if (id === 'shepherd') expect(seen.decoy).toBe(true);
      if (id === 'fisherman') {
        // Every far orb was hooked and reeled in.
        expect(run.pickups.some((pk) => pk.x > p.x + 140)).toBe(false);
      }
    });
  }

  it('the Small Iron Golem taunts nearby chasers', () => {
    const run = new RunState(5, 0, withLoadout({ allies: [{ id: 'mini_golem', level: 1 }] }));
    const golem = run.allies[0];
    if (!golem) throw new Error('no ally');
    const e = enemyAt(run, 'zombie', 0, 0);
    e.x = golem.x + 20;
    e.y = golem.y;
    expect(tauntTarget(run, e)).toBe(golem);
    e.x = golem.x + 80;
    expect(tauntTarget(run, e)).toBeNull();
  });
});
