import { describe, expect, it } from 'vitest';
import type { InputSource } from '../../src/core/input';
import { RunState } from '../../src/game';
import { makeEnemy } from '../../src/systems/spawner';
import { newWeapon, weaponLevel } from '../../src/weapons';
import { crossbow } from '../../src/weapons/crossbow';

class StillInput implements InputSource {
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

describe('crossbow', () => {
  it('shoots the nearest enemy and damages it', () => {
    const run = new RunState(1);
    run.weapons = [newWeapon('crossbow')];
    const zombie = makeEnemy(run, 'zombie', run.player.x + 60, run.player.y, false);
    if (!zombie) throw new Error('no zombie');
    run.enemies.push(zombie);
    const input = new StillInput();
    let hurt = false;
    for (let i = 0; i < 180; i++) {
      run.update(1 / 60, input);
      if (zombie.dying || zombie.hp < zombie.maxHp) hurt = true;
    }
    expect(hurt).toBe(true);
  });

  it('evolved Multishot Crossbow fires a five-way fan spanning about 0.5 rad', () => {
    const run = new RunState(2);
    const w = newWeapon('crossbow');
    w.level = 5;
    w.evolved = true;
    run.weapons = [w];
    const zombie = makeEnemy(run, 'zombie', run.player.x + 80, run.player.y, false);
    if (!zombie) throw new Error('no zombie');
    run.enemies.push(zombie);
    const input = new StillInput();
    let bolts: { vx: number; vy: number; pierce: number }[] = [];
    for (let i = 0; i < 120 && bolts.length === 0; i++) {
      run.update(1 / 60, input);
      bolts = run.projectiles.filter((p) => p.style === 'bolt');
    }
    expect(bolts).toHaveLength(5);
    const angles = bolts.map((b) => Math.atan2(b.vy, b.vx));
    expect(Math.max(...angles) - Math.min(...angles)).toBeCloseTo(0.5, 2);
    // Evolved bolts pierce one more enemy than a level-5 bolt (4 + 1).
    expect(bolts.every((b) => b.pierce === 5)).toBe(true);
  });

  it('level 5 hits harder than level 1', () => {
    const l1 = weaponLevel('crossbow', 1);
    const l5 = weaponLevel('crossbow', 5);
    expect(l5.dmg).toBeGreaterThan(l1.dmg);
    expect(l5.cd).toBeLessThan(l1.cd);
    expect(crossbow.levels).toHaveLength(5);
  });

  it('does not fire without an enemy in range', () => {
    const run = new RunState(3);
    const w = newWeapon('crossbow');
    const s = weaponLevel('crossbow', 1);
    expect(crossbow.fire(run, w, s)).toBe(false);
    const far = makeEnemy(run, 'zombie', run.player.x + 400, run.player.y, false);
    if (!far) throw new Error('no zombie');
    run.hash.clear();
    run.hash.insert(far);
    expect(crossbow.fire(run, w, s)).toBe(false);
    expect(run.projectiles).toHaveLength(0);
  });
});
