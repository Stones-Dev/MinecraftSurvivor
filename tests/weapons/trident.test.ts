import { describe, expect, it } from 'vitest';
import type { InputSource } from '../../src/core/input';
import { RunState } from '../../src/game';
import { makeEnemy } from '../../src/systems/spawner';
import { newWeapon, weaponLevel } from '../../src/weapons';
import { trident } from '../../src/weapons/trident';

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

describe('trident', () => {
  it('sounds like a throw (bow recipe), not a blade swing', () => {
    const run = new RunState(5);
    run.weapons = [newWeapon('trident')];
    const zombie = makeEnemy(run, 'zombie', run.player.x + 60, run.player.y, false);
    if (!zombie) throw new Error('no zombie');
    run.enemies.push(zombie);
    const heard = new Set<string>();
    for (let i = 0; i < 120; i++) {
      run.update(1 / 60, new StillInput());
      for (const ev of run.events) heard.add(ev);
      run.events.length = 0;
      if (heard.has('bow')) break;
    }
    expect(heard.has('bow')).toBe(true);
    expect(heard.has('swing')).toBe(false);
  });

  it('throws a boomerang that hits the target and returns to the hero', () => {
    const run = new RunState(4);
    run.weapons = [newWeapon('trident')];
    const zombie = makeEnemy(run, 'zombie', run.player.x + 80, run.player.y, false);
    if (!zombie) throw new Error('no zombie');
    run.enemies.push(zombie);
    const input = new StillInput();
    let hurt = false;
    let returned = false;
    let sawBoomerang = false;
    for (let i = 0; i < 240; i++) {
      run.update(1 / 60, input);
      if (zombie.dying || zombie.hp < zombie.maxHp) hurt = true;
      for (const p of run.projectiles) {
        if (!p.boomerang) continue;
        sawBoomerang = true;
        if (p.phase === 1) returned = true;
      }
    }
    expect(sawBoomerang).toBe(true);
    expect(hurt).toBe(true);
    expect(returned).toBe(true);
    // The boomerang is removed once it reaches the hero.
    expect(run.projectiles.filter((p) => p.boomerang)).toHaveLength(0);
  });

  it('level 5 with two tridents throws two boomerangs at an angle', () => {
    const run = new RunState(5);
    const w = newWeapon('trident');
    w.level = 5;
    run.weapons = [w];
    const zombie = makeEnemy(run, 'zombie', run.player.x + 80, run.player.y, false);
    if (!zombie) throw new Error('no zombie');
    run.enemies.push(zombie);
    const input = new StillInput();
    let throws = 0;
    for (let i = 0; i < 60 && throws === 0; i++) {
      run.update(1 / 60, input);
      throws = run.projectiles.filter((p) => p.boomerang).length;
    }
    expect(throws).toBe(2);
    expect(run.projectiles.every((p) => p.maxDist === weaponLevel('trident', 5).area)).toBe(true);
  });

  it('evolved Riptide dashes the hero toward the target and grants i-frames', () => {
    const run = new RunState(6);
    const w = newWeapon('trident');
    w.level = 5;
    w.evolved = true;
    run.weapons = [w];
    const zombie = makeEnemy(run, 'zombie', run.player.x + 80, run.player.y, false);
    if (!zombie) throw new Error('no zombie');
    run.enemies.push(zombie);
    const input = new StillInput();
    let sawDash = false;
    let sawIframes = false;
    let hurt = false;
    for (let i = 0; i < 180; i++) {
      run.update(1 / 60, input);
      if (run.dash) {
        sawDash = true;
        expect(run.dash.dx).toBeGreaterThan(0); // toward the zombie, which is to the right
      }
      if (run.player.iframes > 0) sawIframes = true;
      if (zombie.dying || zombie.hp < zombie.maxHp) hurt = true;
    }
    expect(sawDash).toBe(true);
    expect(sawIframes).toBe(true);
    expect(hurt).toBe(true);
  });

  it('does not fire without an enemy in range', () => {
    const run = new RunState(7);
    const w = newWeapon('trident');
    const s = weaponLevel('trident', 1);
    expect(trident.fire(run, w, s)).toBe(false);
    const far = makeEnemy(run, 'zombie', run.player.x + 300, run.player.y, false);
    if (!far) throw new Error('no zombie');
    run.hash.clear();
    run.hash.insert(far);
    expect(trident.fire(run, w, s)).toBe(false);
    expect(run.projectiles).toHaveLength(0);
    expect(run.dash).toBeNull();
  });
});
