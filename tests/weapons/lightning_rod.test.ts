import { describe, expect, it } from 'vitest';
import type { InputSource } from '../../src/core/input';
import type { Enemy } from '../../src/entities/enemy';
import { RunState } from '../../src/game';
import { makeEnemy } from '../../src/systems/spawner';
import { newWeapon, WEAPONS, weaponLevel } from '../../src/weapons';

class Still implements InputSource {
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

/** Tanky enemies in a row, 20 px apart, so every chain jump has a target and none dies. */
function lineAhead(run: RunState, n: number): Enemy[] {
  const out: Enemy[] = [];
  for (let i = 0; i < n; i++) {
    const e = makeEnemy(run, 'zombie', run.player.x + 60 + i * 20, run.player.y, false);
    if (!e) throw new Error('zombie definition missing');
    e.maxHp = 500;
    e.hp = 500;
    run.enemies.push(e);
    out.push(e);
  }
  return out;
}

/** Fill the spatial hash without moving anything (fire() reads it). */
function indexEnemies(run: RunState): void {
  run.hash.clear();
  for (const e of run.enemies) run.hash.insert(e);
}

describe('Lightning Rod', () => {
  it('chains to exactly `count` distinct enemies at level 1', () => {
    const run = new RunState(1);
    const w = newWeapon('lightning_rod');
    run.weapons = [w];
    const enemies = lineAhead(run, 7);
    indexEnemies(run);
    expect(WEAPONS.lightning_rod.fire(run, w, weaponLevel('lightning_rod', w.level))).toBe(true);
    const hit = enemies.filter((e) => e.hp < e.maxHp);
    expect(hit).toHaveLength(weaponLevel('lightning_rod', 1).count);
    expect(hit.every((e) => e.stunT === 0)).toBe(true);
  });

  it('evolved Thunderstorm jumps six times and stuns every hit for 1 s', () => {
    const run = new RunState(1);
    const w = newWeapon('lightning_rod');
    w.level = 5;
    w.evolved = true;
    run.weapons = [w];
    const enemies = lineAhead(run, 8);
    indexEnemies(run);
    expect(WEAPONS.lightning_rod.fire(run, w, weaponLevel('lightning_rod', w.level))).toBe(true);
    const hit = enemies.filter((e) => e.hp < e.maxHp);
    expect(hit).toHaveLength(6);
    expect(hit.every((e) => e.stunT > 0)).toBe(true);
  });

  it('fires during a run and damages more than one enemy', () => {
    const run = new RunState(1);
    run.weapons = [newWeapon('lightning_rod')];
    const enemies: Enemy[] = [];
    for (let i = 0; i < 3; i++) {
      const e = makeEnemy(run, 'zombie', run.player.x + 60 + i * 20, run.player.y + i * 6, false);
      if (!e) throw new Error('zombie definition missing');
      run.enemies.push(e);
      enemies.push(e);
    }
    const input = new Still();
    for (let i = 0; i < 240; i++) run.update(1 / 60, input);
    expect(enemies.filter((e) => e.hp < e.maxHp).length).toBeGreaterThanOrEqual(2);
  });

  it('does nothing and reports false without enemies in range', () => {
    const run = new RunState(1);
    const w = newWeapon('lightning_rod');
    expect(WEAPONS.lightning_rod.fire(run, w, weaponLevel('lightning_rod', 1))).toBe(false);
    expect(run.fx).toHaveLength(0);
  });
});
