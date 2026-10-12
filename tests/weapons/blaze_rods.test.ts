import { describe, expect, it } from 'vitest';
import type { InputSource } from '../../src/core/input';
import { RunState } from '../../src/game';
import { makeEnemy } from '../../src/systems/spawner';
import { newWeapon, weaponLevel } from '../../src/weapons';
import { blaze_rods } from '../../src/weapons/blaze_rods';
import type { WeaponState } from '../../src/weapons/types';

class IdleInput implements InputSource {
  moveVector(): { x: number; y: number } {
    return { x: 0, y: 0 };
  }
  pausePressed(): boolean {
    return false;
  }
  confirmPressed(): boolean {
    return false;
  }
  cancelPressed(): boolean {
    return false;
  }
  activePressed(): boolean {
    return false;
  }
  endStep(): void {}
}

/** A run with only the given weapon and no spawner tides, so only the test's enemies exist. */
function setup(seed: number, w: WeaponState): RunState {
  const run = new RunState(seed);
  run.spawnMult = 0;
  run.weapons = [w];
  return run;
}

function addZombie(run: RunState, dx: number, dy: number) {
  const e = makeEnemy(run, 'zombie', run.player.x + dx, run.player.y + dy, false);
  if (!e) throw new Error('zombie definition missing');
  run.enemies.push(e);
  return e;
}

function rods(run: RunState) {
  return run.orbiters.filter((o) => o.owner === 'blaze_rods');
}

describe('blaze_rods', () => {
  it('has five levels that each upgrade the previous one', () => {
    expect(blaze_rods.levels).toHaveLength(5);
    for (let i = 1; i < 5; i++) {
      const prev = blaze_rods.levels[i - 1];
      const cur = blaze_rods.levels[i];
      if (!prev || !cur) throw new Error('missing level');
      expect(cur.dmg).toBeGreaterThan(prev.dmg);
      expect(cur.count).toBeGreaterThanOrEqual(prev.count);
      expect(cur.area).toBeGreaterThan(prev.area);
    }
  });

  it('keeps two orbiting rods at level 1 and they damage a nearby enemy', () => {
    const run = setup(1, newWeapon('blaze_rods'));
    const z = addZombie(run, 30, 0);
    const input = new IdleInput();
    for (let i = 0; i < 240; i++) run.update(1 / 60, input);
    expect(rods(run)).toHaveLength(2);
    expect(rods(run).every((o) => !o.burn)).toBe(true);
    expect(z.hp).toBeLessThan(z.maxHp);
  });

  it('adds rods as the level rises', () => {
    const w = newWeapon('blaze_rods');
    w.level = 3;
    const run = setup(2, w);
    run.update(1 / 60, new IdleInput());
    expect(rods(run)).toHaveLength(3);
  });

  it('evolved Blaze Crown keeps five rods that burn and spin 35% faster', () => {
    const base = newWeapon('blaze_rods');
    base.level = 5;
    const runBase = setup(3, base);
    runBase.update(1 / 60, new IdleInput());
    expect(rods(runBase)).toHaveLength(4);
    const baseSpeed = rods(runBase)[0]?.speed ?? 0;

    const w = newWeapon('blaze_rods');
    w.level = 5;
    w.evolved = true;
    const run = setup(3, w);
    const z = addZombie(run, 30, 0);
    const input = new IdleInput();
    for (let i = 0; i < 240; i++) run.update(1 / 60, input);
    expect(rods(run)).toHaveLength(5);
    expect(rods(run).every((o) => o.burn)).toBe(true);
    expect(rods(run)[0]?.speed ?? 0).toBeCloseTo(baseSpeed * 1.35, 6);
    expect(z.hp).toBeLessThan(z.maxHp);
  });

  it('never starts a cooldown itself', () => {
    const w = newWeapon('blaze_rods');
    const run = setup(4, w);
    expect(blaze_rods.fire(run, w, weaponLevel('blaze_rods', 1))).toBe(false);
  });
});
