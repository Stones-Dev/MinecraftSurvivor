import { describe, expect, it } from 'vitest';
import type { InputSource } from '../../src/core/input';
import { RunState } from '../../src/game';
import { makeEnemy } from '../../src/systems/spawner';
import { newWeapon, weaponLevel } from '../../src/weapons';
import { axe } from '../../src/weapons/axe';
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

/**
 * Put a single tough zombie in front of the hero and index it, as RunState.update does,
 * so fire() can be called directly many times.
 */
function frontZombie(run: RunState, hp: number) {
  run.enemies = [];
  const z = addZombie(run, 30, 0);
  z.hp = hp;
  z.maxHp = hp;
  run.hash.clear();
  run.hash.insert(z);
  return z;
}

function hasCrit(run: RunState): boolean {
  return run.fx.some((f) => f.text === 'CRIT!');
}

describe('axe', () => {
  it('has five levels that each upgrade the previous one', () => {
    expect(axe.levels).toHaveLength(5);
    for (let i = 1; i < 5; i++) {
      const prev = axe.levels[i - 1];
      const cur = axe.levels[i];
      if (!prev || !cur) throw new Error('missing level');
      expect(cur.dmg).toBeGreaterThan(prev.dmg);
      expect(cur.cd).toBeLessThan(prev.cd);
      expect(cur.area).toBeGreaterThan(prev.area);
    }
  });

  it('swings at a zombie in front, damages it and sets the swing animation', () => {
    const run = setup(1, newWeapon('axe'));
    const z = addZombie(run, 30, 0);
    const input = new IdleInput();
    for (let i = 0; i < 240; i++) run.update(1 / 60, input);
    expect(z.hp).toBeLessThan(z.maxHp);
    expect(run.events).toContain('swing');
  });

  it('crits on a fraction of hits over many swings', () => {
    const run = setup(5, newWeapon('axe'));
    const w = run.weapons[0] ?? newWeapon('axe');
    const s = weaponLevel('axe', 1);
    let crits = 0;
    for (let i = 0; i < 200; i++) {
      run.fx = [];
      frontZombie(run, 1e6);
      expect(axe.fire(run, w, s)).toBe(true);
      if (hasCrit(run)) crits++;
    }
    expect(crits).toBeGreaterThan(20);
    expect(crits).toBeLessThan(90);
  });

  it('evolved Diamond Cleaver crits more often and strips shields on a crit', () => {
    const w = newWeapon('axe');
    w.level = 5;
    w.evolved = true;
    const run = setup(6, w);
    const s = weaponLevel('axe', 5);
    const plainDmg = s.dmg;
    let crits = 0;
    for (let i = 0; i < 200; i++) {
      run.fx = [];
      const z = frontZombie(run, 1e6);
      z.shield = 1000;
      expect(axe.fire(run, w, s)).toBe(true);
      if (hasCrit(run)) {
        crits++;
        expect(z.shield).toBe(0);
      } else {
        // A plain hit is fully absorbed by the shield.
        expect(z.shield).toBeCloseTo(1000 - plainDmg, 6);
      }
    }
    expect(crits).toBeGreaterThan(80);
    expect(crits).toBeLessThan(160);
  });
});
