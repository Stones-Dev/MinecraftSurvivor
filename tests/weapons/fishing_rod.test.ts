import { describe, expect, it } from 'vitest';
import type { InputSource } from '../../src/core/input';
import { RunState } from '../../src/game';
import { makeEnemy } from '../../src/systems/spawner';
import { newWeapon, weaponLevel } from '../../src/weapons';
import { fishing_rod } from '../../src/weapons/fishing_rod';

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

describe('fishing rod', () => {
  it('hooks the nearest enemy and damages it', () => {
    const run = new RunState(12);
    run.weapons = [newWeapon('fishing_rod')];
    const zombie = makeEnemy(run, 'zombie', run.player.x + 90, run.player.y, false);
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

  it('the hook pulls the enemy toward the hero (bosses resist)', () => {
    const run = new RunState(13);
    const w = newWeapon('fishing_rod');
    const s = weaponLevel('fishing_rod', 1);
    const zombie = makeEnemy(run, 'zombie', run.player.x + 60, run.player.y, false);
    if (!zombie) throw new Error('no zombie');
    run.hash.clear();
    run.hash.insert(zombie);
    expect(fishing_rod.fire(run, w, s)).toBe(true);
    const hook = run.projectiles.find((p) => p.style === 'hook');
    if (!hook?.onHit) throw new Error('no hook');
    hook.onHit(run, hook, zombie);
    // The zombie is to the right of the hero, so the pull is leftward.
    expect(zombie.kx).toBeCloseTo(-220, 5);
    expect(zombie.ky).toBeCloseTo(0, 5);

    const boss = makeEnemy(run, 'zombie', run.player.x + 60, run.player.y, false);
    if (!boss) throw new Error('no zombie');
    boss.boss = 'boss';
    hook.onHit(run, hook, boss);
    expect(boss.kx).toBeCloseTo(-80, 5);
  });

  it('evolved Harpoon throws three hooks and stuns the enemies it hits', () => {
    const run = new RunState(14);
    const w = newWeapon('fishing_rod');
    w.level = 5;
    w.evolved = true;
    run.weapons = [w];
    const xs = [70, 90, 110];
    const zombies = xs.map((dx) => {
      const z = makeEnemy(run, 'zombie', run.player.x + dx, run.player.y, false);
      if (!z) throw new Error('no zombie');
      // Tough enough to survive the hook: a killing blow would not take the stun (status ignores dying enemies).
      z.maxHp = 500;
      z.hp = 500;
      run.enemies.push(z);
      return z;
    });
    const input = new StillInput();
    const stunned = new Set<number>();
    let firstVolley = 0;
    for (let i = 0; i < 180; i++) {
      run.update(1 / 60, input);
      if (firstVolley === 0) {
        firstVolley = run.projectiles.filter((p) => p.style === 'hook').length;
      }
      for (const z of zombies) if (z.stunT > 0) stunned.add(z.id);
    }
    expect(firstVolley).toBe(3);
    expect(stunned.size).toBeGreaterThanOrEqual(2);
  });

  it('does not fire without an enemy in range', () => {
    const run = new RunState(15);
    const w = newWeapon('fishing_rod');
    const s = weaponLevel('fishing_rod', 1);
    expect(fishing_rod.fire(run, w, s)).toBe(false);
    const far = makeEnemy(run, 'zombie', run.player.x + 400, run.player.y, false);
    if (!far) throw new Error('no zombie');
    run.hash.clear();
    run.hash.insert(far);
    expect(fishing_rod.fire(run, w, s)).toBe(false);
    expect(run.projectiles).toHaveLength(0);
  });
});
