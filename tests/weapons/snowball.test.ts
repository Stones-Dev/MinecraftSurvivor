import { describe, expect, it } from 'vitest';
import type { InputSource } from '../../src/core/input';
import type { Projectile } from '../../src/entities/projectile';
import { RunState } from '../../src/game';
import { makeEnemy } from '../../src/systems/spawner';
import { newWeapon, weaponLevel } from '../../src/weapons';
import { snowball } from '../../src/weapons/snowball';

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

describe('snowball', () => {
  it('throws a fan of three snowballs that damage and slow the target', () => {
    const run = new RunState(8);
    run.weapons = [newWeapon('snowball')];
    const zombie = makeEnemy(run, 'zombie', run.player.x + 70, run.player.y, false);
    if (!zombie) throw new Error('no zombie');
    run.enemies.push(zombie);
    const input = new StillInput();
    let hurt = false;
    let slowed = false;
    let firstVolley = 0;
    for (let i = 0; i < 180; i++) {
      run.update(1 / 60, input);
      if (firstVolley === 0)
        firstVolley = run.projectiles.filter((p) => p.style === 'snowball').length;
      if (zombie.dying || zombie.hp < zombie.maxHp) hurt = true;
      if (zombie.slowT > 0) {
        slowed = true;
        expect(zombie.slowF).toBeCloseTo(0.6, 5);
      }
    }
    expect(firstVolley).toBe(3);
    expect(hurt).toBe(true);
    expect(slowed).toBe(true);
  });

  it('level 5 throws five snowballs per volley', () => {
    const run = new RunState(9);
    const w = newWeapon('snowball');
    w.level = 5;
    run.weapons = [w];
    const zombie = makeEnemy(run, 'zombie', run.player.x + 70, run.player.y, false);
    if (!zombie) throw new Error('no zombie');
    run.enemies.push(zombie);
    const input = new StillInput();
    let balls = 0;
    for (let i = 0; i < 60 && balls === 0; i++) {
      run.update(1 / 60, input);
      balls = run.projectiles.filter((p) => p.style === 'snowball').length;
    }
    expect(balls).toBe(5);
    expect(weaponLevel('snowball', 5).dmg).toBe(14);
  });

  it('evolved Blizzard throws seven snowballs and some of them freeze', () => {
    const run = new RunState(10);
    const w = newWeapon('snowball');
    w.level = 5;
    w.evolved = true;
    run.weapons = [w];
    const zombie = makeEnemy(run, 'zombie', run.player.x + 70, run.player.y, false);
    if (!zombie) throw new Error('no zombie');
    run.enemies.push(zombie);
    const input = new StillInput();
    const seen = new Set<Projectile>();
    let firstVolley = 0;
    for (let i = 0; i < 360; i++) {
      run.update(1 / 60, input);
      const balls = run.projectiles.filter((p) => p.style === 'snowball');
      if (firstVolley === 0 && balls.length > 0) firstVolley = balls.length;
      for (const b of balls) seen.add(b);
    }
    expect(firstVolley).toBe(7);
    const frozen = [...seen].filter((b) => b.freeze > 0);
    expect(frozen.length).toBeGreaterThan(0);
    expect(frozen.every((b) => b.freeze === 1)).toBe(true);
  });

  it('does not fire without an enemy in range', () => {
    const run = new RunState(11);
    const w = newWeapon('snowball');
    const s = weaponLevel('snowball', 1);
    expect(snowball.fire(run, w, s)).toBe(false);
    const far = makeEnemy(run, 'zombie', run.player.x + 400, run.player.y, false);
    if (!far) throw new Error('no zombie');
    run.hash.clear();
    run.hash.insert(far);
    expect(snowball.fire(run, w, s)).toBe(false);
    expect(run.projectiles).toHaveLength(0);
  });
});
