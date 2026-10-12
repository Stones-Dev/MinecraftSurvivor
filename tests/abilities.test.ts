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
