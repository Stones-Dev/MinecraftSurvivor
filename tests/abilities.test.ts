import { describe, expect, it } from 'vitest';
import { ABILITIES, ABILITY_IDS, abilityCooldown, castAbility } from '../src/abilities';
import type { InputSource } from '../src/core/input';
import { HEROES } from '../src/data/companions';
import { RunState } from '../src/game';
import { defaultLoadout } from '../src/systems/meta';
import { makeEnemy } from '../src/systems/spawner';

const idle: InputSource = {
  moveVector: () => ({ x: 0, y: 0 }),
  pausePressed: () => false,
  confirmPressed: () => false,
  cancelPressed: () => false,
  activePressed: () => false,
  endStep() {},
};

const aim = { x: 90, y: 0, moveX: 0, moveY: 0 };

function crowd(run: RunState, n: number, radius: number): void {
  for (let i = 0; i < n; i++) {
    const e = makeEnemy(run, 'zombie', 0, 0, false);
    if (!e) continue;
    const a = (i / n) * Math.PI * 2;
    e.x = Math.cos(a) * radius;
    e.y = Math.sin(a) * radius;
    e.maxHp = e.hp = 200;
    run.enemies.push(e);
  }
}

function step(run: RunState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) run.update(1 / 60, idle);
}

describe('ability registry', () => {
  it('every hero has a registered ability with sane data', () => {
    for (const h of HEROES) expect(ABILITIES[h.ability]).toBeDefined();
    for (const id of ABILITY_IDS) {
      const a = ABILITIES[id];
      expect(a?.cooldown).toBeGreaterThan(2);
      expect(a?.blurb.length).toBeGreaterThan(15);
    }
  });
});

describe('casting', () => {
  it('spends and respects the cooldown, scaled by Mods.abilityCd', () => {
    const run = new RunState(1, 0, defaultLoadout());
    expect(castAbility(run, aim)).toBe(true);
    const def = ABILITIES[run.abilityId ?? ''];
    if (!def) throw new Error('no ability');
    expect(run.ability.cd).toBeCloseTo(abilityCooldown(run, def));
    expect(castAbility(run, aim)).toBe(false);
    run.mods.abilityCd = 0.5;
    expect(abilityCooldown(run, def)).toBeCloseTo(def.cooldown * 0.5);
    step(run, def.cooldown + 1);
    expect(run.ability.cd).toBe(0);
    expect(castAbility(run, aim)).toBe(true);
    expect(run.ability.castCount).toBe(2);
  });

  it("Steve's Iron Resolve shields him, halves damage and shoves enemies", () => {
    const run = new RunState(2, 0, defaultLoadout());
    crowd(run, 6, 30);
    step(run, 0.05); // builds the spatial hash the ability queries
    const before = run.enemies.map((e) => Math.hypot(e.x, e.y));
    expect(castAbility(run, aim)).toBe(true);
    expect(run.absorb).toBeGreaterThanOrEqual(25);
    expect(run.resistUntil).toBeGreaterThan(run.time);
    step(run, 0.4);
    const after = run.enemies.map((e) => Math.hypot(e.x, e.y));
    expect(after.some((d, i) => d > (before[i] ?? 0) + 5)).toBe(true);
  });

  it("Alex's Arrow Rain damages enemies under the target area over time", () => {
    const run = new RunState(3, 0, { ...defaultLoadout(), hero: 'alex' });
    run.weapons = [];
    for (let i = 0; i < 8; i++) {
      const e = makeEnemy(run, 'zombie', 0, 0, false);
      if (!e) continue;
      e.x = 90 + (i - 4) * 5;
      e.y = (i % 3) * 6;
      e.maxHp = e.hp = 500;
      run.enemies.push(e);
    }
    expect(castAbility(run, aim)).toBe(true);
    step(run, 1.8);
    const hurt = run.enemies.filter((e) => e.hp < 500).length;
    expect(hurt).toBeGreaterThan(3);
  });

  it("Rana's Frog Leap moves her towards the target and leaves a poison pool", () => {
    const run = new RunState(4, 0, { ...defaultLoadout(), hero: 'rana' });
    run.weapons = [];
    const x0 = run.player.x;
    expect(castAbility(run, aim)).toBe(true);
    step(run, 0.5);
    expect(run.player.x).toBeGreaterThan(x0 + 40);
    expect(run.zones.some((z) => z.kind === 'poison' && z.friendly)).toBe(true);
  });
});

describe('sprite hero abilities', () => {
  const heroRun = (hero: string, seed = 11): RunState => {
    const run = new RunState(seed, 0, { ...defaultLoadout(), hero });
    run.weapons = [];
    run.player.maxHp = run.player.hp = 9000;
    return run;
  };
  const castOk = (run: RunState, at = aim): void => {
    const def = ABILITIES[run.abilityId ?? ''];
    if (!def) throw new Error('no ability');
    expect(castAbility(run, at)).toBe(true);
    expect(run.ability.cd).toBeCloseTo(abilityCooldown(run, def));
    expect(def.cooldown).toBeGreaterThanOrEqual(10);
    expect(def.cooldown).toBeLessThanOrEqual(22);
    expect(castAbility(run, at)).toBe(false);
    expect(run.player.castT).toBeGreaterThan(0);
  };
  const hurtCount = (run: RunState, hp: number): number =>
    run.enemies.filter((e) => e.hp < hp).length;

  it("Wandering Trader's Emerald Shower drops Emeralds and stuns nearby enemies", () => {
    const run = heroRun('wandering_trader');
    crowd(run, 6, 40);
    step(run, 0.05);
    const before = run.pickups.filter((p) => p.kind === 'emerald').length;
    castOk(run);
    expect(run.pickups.filter((p) => p.kind === 'emerald').length).toBeGreaterThanOrEqual(
      before + 4,
    );
    expect(run.enemies.every((e) => e.stunT > 0)).toBe(true);
    expect(hurtCount(run, 200)).toBe(6);
  });

  it("Enderman's Blink teleports towards the cursor and pops at both ends", () => {
    const run = heroRun('enderman');
    crowd(run, 4, 20);
    step(run, 0.05);
    const x0 = run.player.x;
    castOk(run, { x: 400, y: 0, moveX: 0, moveY: 0 });
    expect(run.player.x).toBeGreaterThan(x0 + 100);
    expect(run.player.x).toBeLessThanOrEqual(x0 + 151);
    expect(Number.isNaN(run.player.prevX)).toBe(true);
    expect(run.player.iframes).toBeGreaterThanOrEqual(0.4);
    expect(hurtCount(run, 200)).toBeGreaterThan(0);
  });

  it("Witch's Brew lands a big lingering pool at the cursor", () => {
    const run = heroRun('witch');
    for (let i = 0; i < 5; i++) {
      const e = makeEnemy(run, 'zombie', 0, 0, false);
      if (!e) continue;
      e.x = 90 + (i - 2) * 8;
      e.y = 0;
      e.maxHp = e.hp = 500;
      e.speed = 0;
      run.enemies.push(e);
    }
    castOk(run);
    step(run, 1.6);
    const pool = run.zones.find((z) => z.friendly && Math.abs(z.x - 90) < 2);
    expect(pool).toBeDefined();
    expect(pool?.r ?? 0).toBeGreaterThan(60); // 56 x Cauldron Craft 1.3
    expect(hurtCount(run, 500)).toBeGreaterThan(2);
  });

  it("Piglin's Gold Rush raises damage, speed and Emerald drops, then wears off", () => {
    const run = heroRun('piglin');
    const dmg = run.mods.dmg;
    const speed = run.mods.speed;
    const drop = run.mods.emeraldDrop;
    castOk(run);
    expect(run.mods.dmg).toBeGreaterThan(dmg * 1.2);
    expect(run.mods.speed).toBeGreaterThan(speed * 1.2);
    expect(run.mods.emeraldDrop).toBeGreaterThan(drop);
    step(run, 6.2);
    expect(run.heroBuff).toBeNull();
    expect(run.mods.dmg).toBeCloseTo(dmg);
  });

  it("Skeleton's Bone Barrage fires piercing arrows in every direction", () => {
    const run = heroRun('skeleton');
    crowd(run, 8, 60);
    step(run, 0.05);
    castOk(run);
    const arrows = run.projectiles.filter((p) => p.friendly && p.style === 'arrow');
    expect(arrows.length).toBeGreaterThanOrEqual(8);
    expect(arrows.every((a) => a.pierce >= 2)).toBe(true);
    step(run, 0.5);
    expect(run.projectiles.filter((p) => p.style === 'arrow').length).toBeGreaterThan(0);
    expect(hurtCount(run, 200)).toBeGreaterThanOrEqual(6);
  });

  it("Illusioner's Mirror Images lure chasers to decoys, then burst", () => {
    const run = heroRun('illusioner');
    castOk(run);
    expect(run.decoys).toHaveLength(3);
    const d = run.decoys[0];
    if (!d) throw new Error('no decoy');
    const e = makeEnemy(run, 'zombie', 0, 0, false);
    if (!e) throw new Error('no zombie');
    e.x = d.x + (d.x - run.player.x) * 1.5;
    e.y = d.y + (d.y - run.player.y) * 1.5;
    e.maxHp = e.hp = 500;
    run.enemies.push(e);
    const start = Math.hypot(e.x - d.x, e.y - d.y);
    step(run, 1);
    expect(Math.hypot(e.x - d.x, e.y - d.y)).toBeLessThan(start);
    step(run, 5.5);
    expect(run.decoys).toHaveLength(0);
    expect(e.hp).toBeLessThan(500);
  });

  it("Village Smith's Anvil Drop slams, stuns and damages after the fall", () => {
    const run = heroRun('village_smith');
    for (let i = 0; i < 4; i++) {
      const e = makeEnemy(run, 'zombie', 0, 0, false);
      if (!e) continue;
      e.x = 90 + (i - 2) * 10;
      e.y = 4;
      e.maxHp = e.hp = 500;
      run.enemies.push(e);
    }
    castOk(run);
    expect(run.fx.some((f) => f.kind === 'anvil')).toBe(true);
    expect(hurtCount(run, 500)).toBe(0);
    step(run, 0.4);
    expect(hurtCount(run, 500)).toBe(4);
    expect(run.enemies.every((e) => e.stunT > 0.8)).toBe(true);
  });

  it("Creeper's Charged Blast fuses, then blows enemies away without hurting him", () => {
    const run = heroRun('creeper');
    crowd(run, 6, 50);
    const mine = { x: 30, y: 0, fuse: 9, area: 30, dmg: 1 };
    run.mines.push(mine);
    step(run, 0.05);
    const hp = run.player.hp;
    castOk(run);
    expect(run.player.castT).toBeCloseTo(1.2);
    step(run, 1.1);
    expect(hurtCount(run, 200)).toBe(0);
    expect(run.player.iframes).toBeGreaterThan(0);
    const dist = (): number =>
      run.enemies.reduce((s, e) => s + Math.hypot(e.x - run.player.x, e.y - run.player.y), 0);
    const near = dist();
    step(run, 0.25);
    expect(hurtCount(run, 200)).toBe(6);
    expect(dist()).toBeGreaterThan(near + 6 * 10);
    expect(mine.fuse).toBeLessThan(1);
    expect(run.player.hp).toBeGreaterThanOrEqual(hp - 1);
  });
});
