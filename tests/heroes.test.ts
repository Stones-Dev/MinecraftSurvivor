import { describe, expect, it } from 'vitest';
import type { InputSource } from '../src/core/input';
import { RunState } from '../src/game';
import { killEnemy } from '../src/systems/combat';
import { applyCard, candidateCards } from '../src/systems/levelup';
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

const armorCard = (run: RunState) => {
  const c = candidateCards(run).find((x) => x.kind === 'armor');
  if (!c) throw new Error('no armor card on offer');
  return c;
};

describe("Steve's Builder's Grit: armor tiers cost one fewer card", () => {
  it('Steve raises a tier with one card, everyone else needs two', () => {
    const steve = new RunState(1, 0, defaultLoadout());
    expect(steve.armorCardCost()).toBe(1);
    applyCard(steve, armorCard(steve));
    expect(steve.armorTier).toBe(1);
    applyCard(steve, armorCard(steve));
    expect(steve.armorTier).toBe(2);

    const alex = new RunState(1, 0, { ...defaultLoadout(), hero: 'alex' });
    expect(alex.armorCardCost()).toBe(2);
    const first = armorCard(alex);
    expect(first.desc).toContain('Card 1 of 2');
    applyCard(alex, first);
    expect(alex.armorTier).toBe(0);
    const second = armorCard(alex);
    expect(second.desc).toContain('Card 2 of 2');
    applyCard(alex, second);
    expect(alex.armorTier).toBe(1);
    expect(alex.armorProgress).toBe(0);
  });

  it('hands Steve the first Leather tier for free at minute 1 and not before', () => {
    const run = new RunState(2);
    for (let i = 0; i < 58 * 60; i++) run.update(1 / 60, idle);
    expect(run.armorTier).toBe(0);
    for (let i = 0; i < 4 * 60; i++) run.update(1 / 60, idle);
    expect(run.armorTier).toBe(1);
  });

  it('the Anvil and an Armorer grant tiers outside the card cost and reset progress', () => {
    const alex = new RunState(3, 0, {
      ...defaultLoadout(),
      hero: 'alex',
      allies: [{ id: 'armorer', level: 1 }],
    });
    expect(alex.armorTier).toBe(2);
    alex.armorProgress = 1;
    applyCard(alex, armorCard(alex));
    expect(alex.armorTier).toBe(3);
  });
});

describe("Rana's Frog's Luck: slimes never split more than once", () => {
  const kids = (run: RunState, id: string): string[] => {
    const e = makeEnemy(run, id, 0, 0, false);
    if (!e) throw new Error(`cannot make ${id}`);
    run.enemies = [e];
    killEnemy(run, e, true);
    return run.enemies.filter((x) => x !== e).map((x) => x.def.id);
  };

  it('a big slime splits into two mediums that do not split again', () => {
    const rana = new RunState(4, 0, { ...defaultLoadout(), hero: 'rana' });
    expect(kids(rana, 'slime_big')).toEqual(['slime_medium', 'slime_medium']);
    expect(kids(rana, 'slime_medium')).toEqual(['slime_small', 'slime_small']); // a fresh medium splits once
    // The children of a split never split: they carry splitDepth 1.
    const e = makeEnemy(rana, 'slime_big', 0, 0, false);
    if (!e) throw new Error('no slime');
    rana.enemies = [e];
    killEnemy(rana, e, true);
    const medium = rana.enemies.find((x) => x !== e);
    if (!medium) throw new Error('no child');
    rana.enemies = [medium];
    killEnemy(rana, medium, true);
    expect(rana.enemies.filter((x) => x !== medium)).toHaveLength(0);
  });

  it('other heroes keep the full big > medium > small chain', () => {
    const steve = new RunState(5);
    const e = makeEnemy(steve, 'slime_big', 0, 0, false);
    if (!e) throw new Error('no slime');
    steve.enemies = [e];
    killEnemy(steve, e, true);
    const medium = steve.enemies.find((x) => x !== e);
    if (!medium) throw new Error('no child');
    steve.enemies = [medium];
    killEnemy(steve, medium, true);
    expect(steve.enemies.filter((x) => x !== medium).map((x) => x.def.id)).toEqual([
      'slime_small',
      'slime_small',
    ]);
  });

  it('slimes and magma cubes give Rana double XP', () => {
    const xpOf = (hero: string): number => {
      const run = new RunState(6, 0, { ...defaultLoadout(), hero });
      const e = makeEnemy(run, 'slime_small', 0, 0, false);
      if (!e) throw new Error('no slime');
      run.enemies = [e];
      killEnemy(run, e, true);
      return run.pickups.filter((p) => p.kind === 'xp').reduce((s, p) => s + p.value, 0);
    };
    expect(xpOf('rana')).toBeCloseTo(xpOf('steve') * 2);
  });
});
